import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Dropbox Webhook Flow:
 * 1. User uploads file to Dropbox
 * 2. Dropbox sends POST to this endpoint with account IDs that changed
 * 3. We verify the webhook signature (security)
 * 4. We fetch actual file changes from Dropbox API
 * 5. Process files:
 *    - If SQS_QUEUE_URL is set: Queue to SQS → Lambda compresses → Uploads to S3
 *    - If not set: Process directly in route.ts → Compress → Upload to S3
 * 6. Website fetches from S3 via presigned URLs
 *
 * NOTE: Firebase + Dropbox sync are loaded only in POST (dynamic import) so the
 * GET ?challenge= verification for Dropbox does not need valid FIREBASE_ADMIN_PRIVATE_KEY.
 */

// Dropbox webhook verification: responds with the challenge parameter
// This is called by Dropbox when you first register the webhook URL
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  if (!challenge) {
    return new NextResponse('Bad Request', { status: 400 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}

/**
 * Verify webhook signature to ensure request is from Dropbox
 * @see https://www.dropbox.com/developers/reference/webhooks
 * X-Dropbox-Signature = hex digest of HMAC-SHA256(body, app_secret) over the raw POST body
 * (must use the same bytes as Dropbox, not a re-encoded string)
 */
type VerifyResult = { ok: true } | { ok: false; reason: string };

function verifyWebhookSignatureRaw(body: Buffer, signature: string | null): VerifyResult {
  const secret = process.env.DROPBOX_CLIENT_SECRET?.trim();
  if (!secret) {
    return { ok: false, reason: 'missing_env_DROPBOX_CLIENT_SECRET' };
  }
  if (!signature) {
    return { ok: false, reason: 'missing_header_X_Dropbox_Signature' };
  }

  // Header is hex; some stacks document "sha256=..." (Strip if present)
  const sigHex = signature.replace(/^sha256=/i, '').trim();

  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  const expectedHex = hmac.digest('hex');

  if (sigHex.length !== expectedHex.length) {
    return { ok: false, reason: 'signature_header_not_hex_64' };
  }
  try {
    const match = timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'));
    if (!match) {
      return { ok: false, reason: 'hmac_mismatch' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'invalid_hex_in_signature' };
  }
}

/** Normalized key for a user's `folderPath` — must match the prefix logic in the sync. */
function dropboxFolderKey(d: { data: () => { folderPath?: string } }): string {
  const userFolderPath = (d.data()?.folderPath as string).trim();
  const cleanPath = userFolderPath.replace(/^\/+|\/+$/g, '');
  const pathPrefix = cleanPath.toLowerCase().startsWith('apps') ? 'Apps' : '0 US';
  return `${pathPrefix}::${cleanPath.toLowerCase()}`;
}

// Dropbox webhook events delivery - processes only changed files
export async function POST(request: NextRequest) {
  try {
    // Raw bytes: signature is HMAC-SHA256 over these exact bytes (Dropbox reference uses request.data)
    const rawBody = Buffer.from(await request.arrayBuffer());
    const signature =
      request.headers.get('X-Dropbox-Signature') ?? request.headers.get('x-dropbox-signature');

    const verify = verifyWebhookSignatureRaw(rawBody, signature);
    if (!verify.ok) {
      console.error('[dropbox/webhook] Signature failed:', verify.reason, {
        bodyLength: rawBody.length,
        hasHeader: Boolean(signature),
        secretLen: process.env.DROPBOX_CLIENT_SECRET?.trim().length ?? 0,
      });
      if (process.env.NODE_ENV === 'development') {
        // Same App Console app must own: webhook URL, OAuth, and this env secret (App **secret**, not App key)
        return NextResponse.json(
          { error: 'webhook_unauthorized', reason: verify.reason },
          { status: 401 },
        );
      }
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Load Firebase + sync only for POST (GET challenge must work without them)
    const { adminDb } = await import('../../../lib/firebase-admin');
    const { syncDropboxToS3, processWebhookFiles, DROPBOX_SYNC_CURSOR_FIELD, isDropboxFullScopeSync } =
      await import('../../../lib/dropbox-sync');

    // Parse JSON from the same raw body
    const body = JSON.parse(rawBody.toString('utf8'));

    console.log('Webhook payload:', JSON.stringify(body, null, 2));

    // Dropbox webhook format: { list_folder: { accounts: [...] } }
    // The payload contains account IDs, not specific file changes
    // We need to call Dropbox API to get actual changes
    const accounts = body?.list_folder?.accounts || [];

    console.log(`Webhook received: ${accounts.length} account(s) in payload`);

    if (accounts.length === 0) {
      console.log('Empty payload received, but will still check for changes using cursor');
    }

    // `DROPBOX_SYNC_MODE=full`: one `list_folder` over the whole scoped Dropbox; cursor in
    // `config/dropboxSync`. Otherwise per-user cursors in `users/{uid}` (folderPath = sync root).
    // `folderPath` is still used by the yearbook APIs to list a member’s S3 prefix only.
    (async () => {
      if (isDropboxFullScopeSync()) {
        try {
          await processWebhookFiles({ fullScope: true });
        } catch (error) {
          console.error('[dropbox/webhook] processWebhookFiles full-scope failed:', error);
          await syncDropboxToS3({ fullScope: true, recursive: true }).catch((syncError) => {
            console.error('[dropbox/webhook] fallback full-scope sync failed:', syncError);
          });
        }
        return;
      }

      const usersSnap = await adminDb.collection('users').get();
      const withFolder = usersSnap.docs.filter((d) => {
        const data = d.data() as { folderPath?: string; dropboxWebhookSync?: boolean } | undefined;
        const fp = data?.folderPath;
        if (typeof fp !== 'string' || !fp.trim()) return false;
        if (data?.dropboxWebhookSync === false) return false;
        return true;
      });

      if (withFolder.length === 0) {
        console.warn('[dropbox/webhook] No users with non-empty folderPath; nothing to sync');
        return;
      }

      const byDropboxKey = new Map<string, (typeof withFolder)[0][]>();
      for (const d of withFolder) {
        const k = dropboxFolderKey(d);
        const list = byDropboxKey.get(k) ?? [];
        list.push(d);
        byDropboxKey.set(k, list);
      }

      type UserDoc = (typeof withFolder)[0];
      const uniqueToRun: UserDoc[] = [];
      Array.from(byDropboxKey.entries()).forEach(([k, docs]) => {
        if (docs.length === 1) {
          uniqueToRun.push(docs[0]!);
          return;
        }
        const withC = docs.filter((d: UserDoc) => {
          const c = d.data()?.[DROPBOX_SYNC_CURSOR_FIELD];
          return typeof c === 'string' && c.length > 0;
        });
        const best = (withC[0] ?? docs[0])!;
        uniqueToRun.push(best);
        const skipIds = docs
          .filter((d: UserDoc) => d.id !== best.id)
          .map((d: UserDoc) => d.id);
        console.log(
          `[dropbox/webhook] dedupe: same Dropbox folder as another user — key ${k}, sync uid ${best.id}, skip uid(s) ${skipIds.join(', ')}`,
        );
      });

      const withCursors = withFolder.filter((d) => {
        const c = d.data()?.[DROPBOX_SYNC_CURSOR_FIELD];
        return typeof c === 'string' && c.length > 0;
      });
      const noCursor = withFolder.length - withCursors.length;
      const sameFolderDupes = withFolder.length - uniqueToRun.length;
      console.log(
        `[dropbox/webhook] ${withFolder.length} user folder(s)${
          sameFolderDupes > 0 ? `, ${uniqueToRun.length} unique path(s) after same-folder dedupe` : ''
        } — ${withCursors.length} with ${DROPBOX_SYNC_CURSOR_FIELD} (incremental if changes), ` +
          `${noCursor} may full-sync until cursor saved (shared Dropbox app in env)`,
      );

      const runOne = async (doc: (typeof withFolder)[0]) => {
        const userFolderPath = (doc.data()?.folderPath as string).trim();
        const syncUserId = doc.id;
        const cleanPath = userFolderPath.replace(/^\/+|\/+$/g, '');
        const pathPrefix = cleanPath.toLowerCase().startsWith('apps') ? 'Apps' : '0 US';

        console.log(`[dropbox/webhook] user ${syncUserId} folderPath=${userFolderPath} prefix=${pathPrefix}`);

        try {
          await processWebhookFiles({ userFolderPath, pathPrefix, syncUserId });
        } catch (error) {
          console.error(`[dropbox/webhook] processWebhookFiles failed for ${syncUserId}:`, error);
          await syncDropboxToS3({ userFolderPath, pathPrefix, recursive: true, syncUserId }).catch(
            (syncError) => {
              console.error(`[dropbox/webhook] fallback full sync failed for ${syncUserId}:`, syncError);
            },
          );
        }
      };

      await Promise.all(uniqueToRun.map((d) => runOne(d)));
    })().catch((error) => {
      console.error('Error in webhook handler:', error);
    });

    // Respond immediately (Dropbox requires response within 10 seconds)
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook POST error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
