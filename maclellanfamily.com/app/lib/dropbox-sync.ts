import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Dropbox, DropboxResponseError } from 'dropbox';
import fetch from 'cross-fetch';
import sharp from 'sharp';
import { adminDb } from './firebase-admin';

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Initialize Dropbox client - supports both access token and refresh token
const dropbox = process.env.DROPBOX_ACCESS_TOKEN
  ? new Dropbox({
      accessToken: process.env.DROPBOX_ACCESS_TOKEN,
      fetch
    })
  : new Dropbox({
      clientId: process.env.DROPBOX_CLIENT_ID!,
      clientSecret: process.env.DROPBOX_CLIENT_SECRET!,
      refreshToken: process.env.DROPBOX_REFRESH_TOKEN!,
      fetch
    });

const sqsClient = process.env.SQS_QUEUE_URL
  ? new SQSClient({
      region: process.env.AWS_S3_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  : undefined;

function ensureLeadingSlash(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

/** Firestore `users` doc field for Dropbox /files list_folder continue cursor (per app user) */
export const DROPBOX_SYNC_CURSOR_FIELD = 'dropboxSyncCursor' as const;

function userSyncCursorRef(syncUserId: string) {
  return adminDb.collection('users').doc(syncUserId);
}

/** Single cursor for `DROPBOX_SYNC_MODE=full` (entire list_folder scope, not per-user). */
const DROPBOX_CONFIG_COLLECTION = 'config';
const DROPBOX_GLOBAL_CURSOR_DOC = 'dropboxSync';

function globalDropboxCursorRef() {
  return adminDb.collection(DROPBOX_CONFIG_COLLECTION).doc(DROPBOX_GLOBAL_CURSOR_DOC);
}

/** Clears the full-scope cursor so the next sync runs a fresh `filesListFolder` (use if incremental returns 0 but files exist). */
export async function clearGlobalDropboxSyncCursor(): Promise<void> {
  await globalDropboxCursorRef().set({ [DROPBOX_SYNC_CURSOR_FIELD]: null }, { merge: true });
  console.log(`[dropbox] Cleared ${DROPBOX_CONFIG_COLLECTION}/${DROPBOX_GLOBAL_CURSOR_DOC} ${DROPBOX_SYNC_CURSOR_FIELD}`);
}

/**
 * When set to `full`, one incremental cursor syncs the whole scoped Dropbox (see env below).
 * Per-user `folderPath` is only for the site (yearbooks); sync ignores it unless mode is per-user.
 */
export function isDropboxFullScopeSync(): boolean {
  const m = process.env.DROPBOX_SYNC_MODE?.trim().toLowerCase();
  return m === 'full' || m === 'global' || m === 'all';
}

type SyncState = {
  userDocRef: ReturnType<typeof userSyncCursorRef> | ReturnType<typeof globalDropboxCursorRef>;
  cleanUser: string;
  /** S3 + URL layout: `0 US` or `Apps` */
  prefix: string;
  /** `filesListFolder` path for non — app root (e.g. `/0 US`) */
  dropboxBase: string;
  /**
   * Use Dropbox API path `""` (scoped app / app-folder root). When true, `dropboxBase` is still
   * `''` for compatibility but list calls use `path: ''`.
   */
  listFromAppRoot: boolean;
  /**
   * When set, S3 keys get `Apps/{name}/...`. Omitted for pure `0 US/...` trees (incl. app root with `0 us/...` paths).
   */
  s3AppsSubfolder: string | null;
};

function getFullScopeSyncState(): SyncState {
  const listFromAppRoot =
    process.env.DROPBOX_IS_APP_FOLDER === 'true' || process.env.DROPBOX_IS_APP_FOLDER === '1';
  const listPath = (process.env.DROPBOX_FULL_LIST_PATH ?? '/0 US').trim() || '/0 US';
  const appsName = process.env.DROPBOX_APPS_S3_NAME?.trim() || null;
  const useAppsS3 =
    Boolean(appsName) &&
    (process.env.DROPBOX_USE_APPS_S3_PREFIX === 'true' || process.env.DROPBOX_USE_APPS_S3_PREFIX === '1');
  return {
    userDocRef: globalDropboxCursorRef(),
    cleanUser: useAppsS3 && appsName ? `apps/${appsName}` : '',
    prefix: useAppsS3 && appsName ? 'Apps' : '0 US',
    dropboxBase: listFromAppRoot ? '' : ensureLeadingSlash(listPath),
    listFromAppRoot,
    s3AppsSubfolder: useAppsS3 && appsName ? appsName : null,
  };
}

function getPerUserSyncState(options: {
  userFolderPath: string;
  pathPrefix?: string;
  syncUserId: string;
}): SyncState {
  const cleanUser = options.userFolderPath.replace(/^\/+|\/+$/g, '');
  let prefix: string;
  let dropboxBase: string;
  let listFromAppRoot: boolean;
  let s3AppsSubfolder: string | null;
  if (cleanUser.toLowerCase().startsWith('apps/') || cleanUser.toLowerCase().startsWith('apps')) {
    const appFolderName = cleanUser.replace(/^apps\/?/i, '');
    prefix = options.pathPrefix ?? 'Apps';
    dropboxBase = '';
    listFromAppRoot = true;
    s3AppsSubfolder = appFolderName || null;
  } else {
    prefix = options.pathPrefix ?? '0 US';
    dropboxBase = ensureLeadingSlash(`${prefix}/${cleanUser}`);
    listFromAppRoot = false;
    s3AppsSubfolder = null;
  }
  return {
    userDocRef: userSyncCursorRef(options.syncUserId),
    cleanUser,
    prefix,
    dropboxBase,
    listFromAppRoot,
    s3AppsSubfolder,
  };
}

/** Dropbox cursors are per-app. If you switch apps or re-auth, the old cursor 400/409s — reset and re-list. */
function shouldResetDropboxCursor(error: any): boolean {
  // Missing folder, not a bad cursor
  if (error?.error?.error?.['.tag'] === 'path' && error?.error?.error?.path?.['.tag'] === 'not_found') {
    return false;
  }
  if (error?.error?.error?.['.tag'] === 'reset') return true;
  const pieces = [
    typeof error?.error === 'string' ? error.error : '',
    error?.message,
    error?.error?.error_summary,
    JSON.stringify(error?.error ?? {}),
  ].filter(Boolean);
  const msg = pieces.join(' ');
  if (error?.status === 409 && /cursor|list_folder|reset|conflict/i.test(msg) && !/not_found|path\//i.test(msg)) {
    return true;
  }
  if (
    (error?.status === 400 || error?.status === 401) &&
    /different app|Invalid.*cursor|cursor.*(invalid|expired)/i.test(msg)
  ) {
    return true;
  }
  return false;
}

export type SyncOptions =
  | {
      userFolderPath: string;
      pathPrefix?: string;
      recursive?: boolean;
      /** `users` document id; stores `dropboxSyncCursor` (Dropbox list_folder cursor) */
      syncUserId: string;
    }
  | { fullScope: true; recursive?: boolean };

/**
 * Process webhook-triggered changes - only processes files that changed since last sync.
 * Cursors: per-user in `users/{uid}` in per-user mode, or `config/dropboxSync` in full-scope mode.
 */
export async function processWebhookFiles(
  options: { fullScope: true } | { userFolderPath: string; pathPrefix?: string; syncUserId: string },
) {
  let st: SyncState;
  if ('fullScope' in options && options.fullScope) {
    st = getFullScopeSyncState();
  } else {
    st = getPerUserSyncState(options as { userFolderPath: string; pathPrefix?: string; syncUserId: string });
  }

  const { userDocRef, cleanUser, prefix, dropboxBase, listFromAppRoot, s3AppsSubfolder } = st;
  if ('fullScope' in options && options.fullScope) {
    console.log(
      `[dropbox] full-scope sync: prefix=${prefix}, listFromAppRoot=${listFromAppRoot}, dropboxBase="${dropboxBase}", s3AppsSubfolder=${s3AppsSubfolder ?? 'null'}`,
    );
  } else if (cleanUser.toLowerCase().startsWith('apps')) {
    const appFolderName = cleanUser.replace(/^apps\/?/i, '');
    console.log(
      `Detected Apps folder structure. App folder: ${appFolderName}, Dropbox API path: "" (empty string), S3 prefix: ${prefix}/${appFolderName}`,
    );
  } else {
    console.log(`Detected standard structure. Dropbox base: ${dropboxBase}`);
  }

  const userSnap = await userDocRef.get();
  let cursor: string | undefined = userSnap.exists
    ? (userSnap.data()?.[DROPBOX_SYNC_CURSOR_FIELD] as string | undefined)
    : undefined;

  console.log(`Cursor status: ${cursor ? 'Found cursor, doing incremental sync' : 'No cursor, doing full sync'}`);
  const sqsReady =
    Boolean(sqsClient && process.env.SQS_QUEUE_URL && !process.env.SQS_QUEUE_URL.includes('your-queue')) &&
    Boolean(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim());
  console.log(
    `[dropbox] SQS can SendMessage: ${sqsReady} (queueUrl set: ${Boolean(process.env.SQS_QUEUE_URL?.trim())}, ` +
      `AWS keys set: ${Boolean(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim())}, ` +
      `region: ${process.env.AWS_S3_REGION ?? 'MISSING'}) — if true but no Lambda invocations, Dropbox likely returned 0 delta entries; use admin sync ?forceFull=1 or check file is under list root + image ext`,
  );

  if (!cursor) {
    console.log('Starting full sync (no cursor found)...');
    if ('fullScope' in options && options.fullScope) {
      return syncDropboxToS3({ fullScope: true, recursive: true });
    }
    return syncDropboxToS3({
      userFolderPath: (options as { userFolderPath: string }).userFolderPath,
      pathPrefix: prefix,
      recursive: true,
      syncUserId: (options as { syncUserId: string }).syncUserId,
    });
  }

  let hasMore = true;
  let processedCount = 0;
  try {
    while (hasMore && cursor) {
      const cont = await dropbox.filesListFolderContinue({ cursor });
      await processEntries(cont.result.entries, prefix, cleanUser, s3AppsSubfolder);
      processedCount += cont.result.entries.length;
      cursor = cont.result.cursor;
      hasMore = cont.result.has_more;
    }
    await userDocRef.set({ [DROPBOX_SYNC_CURSOR_FIELD]: cursor }, { merge: true });
    console.log(`Processed ${processedCount} changed files from webhook`);
    if (processedCount === 0 && 'fullScope' in options && options.fullScope) {
      console.warn(
        '[dropbox] incremental list_folder/continue returned 0 entries. ' +
          'New files must live under the configured list root in Dropbox (default `/0 US` from DROPBOX_FULL_LIST_PATH, or app root with DROPBOX_IS_APP_FOLDER). ' +
          'If you added a folder and expect uploads, run admin POST /api/dropbox/sync?forceFull=1 (or clear `config/dropboxSync` dropboxSyncCursor in Firestore) then sync again.',
      );
    }
  } catch (error: any) {
    if (shouldResetDropboxCursor(error)) {
      console.log(
        'Dropbox list_folder cursor is invalid (wrong app, or expired). Clearing Firestore cursor and running full sync...',
      );
      await userDocRef.set({ [DROPBOX_SYNC_CURSOR_FIELD]: null }, { merge: true });
      if ('fullScope' in options && options.fullScope) {
        return syncDropboxToS3({ fullScope: true, recursive: true });
      }
      return syncDropboxToS3({
        userFolderPath: (options as { userFolderPath: string }).userFolderPath,
        pathPrefix: prefix,
        recursive: true,
        syncUserId: (options as { syncUserId: string }).syncUserId,
      });
    }
    throw error;
  }
}

export async function syncDropboxToS3(options: SyncOptions) {
  if (!('fullScope' in options) || !options.fullScope) {
    const o = options as { userFolderPath: string; pathPrefix?: string; syncUserId: string };
    if (!o.syncUserId) {
      throw new Error('syncUserId is required (Firestore users/{syncUserId} for dropboxSyncCursor)');
    }
  }

  let st: SyncState;
  if ('fullScope' in options && options.fullScope) {
    st = getFullScopeSyncState();
  } else {
    const per = options as { userFolderPath: string; pathPrefix?: string; syncUserId: string };
    st = getPerUserSyncState(per);
  }
  const { userDocRef, cleanUser, prefix, dropboxBase, listFromAppRoot, s3AppsSubfolder } = st;
  if ('fullScope' in options && options.fullScope) {
    console.log(
      `[sync] full-scope: prefix=${prefix}, listFromAppRoot=${listFromAppRoot}, dropboxBase="${dropboxBase}", s3AppsSubfolder=${s3AppsSubfolder ?? 'null'}`,
    );
  }

  const userSnap = await userDocRef.get();
  let cursor: string | undefined = userSnap.exists
    ? (userSnap.data()?.[DROPBOX_SYNC_CURSOR_FIELD] as string | undefined)
    : undefined;

  if (listFromAppRoot && cursor) {
    console.log('Clearing existing cursor for App Folder app (ensuring fresh start)...');
    cursor = undefined;
    await userDocRef.set({ [DROPBOX_SYNC_CURSOR_FIELD]: null }, { merge: true });
  }

  if (!cursor) {
    const apiPath = listFromAppRoot ? '' : dropboxBase || '';
    console.log(
      `Starting fresh sync for path: "${apiPath}" (listFromAppRoot: ${listFromAppRoot}, dropboxBase: "${dropboxBase}")`,
    );
    
    try {
      // Verify Dropbox connection first
      try {
        const accountInfo = await dropbox.usersGetCurrentAccount();
        console.log(`Dropbox connection verified. Account: ${accountInfo.result.email}`);
      } catch (accountError: any) {
        console.error('CRITICAL: Could not verify Dropbox account. Error:', accountError?.status, accountError?.error);
        console.error('This suggests the refresh token is invalid or lacks permissions.');
        console.error('Please check:');
        console.error('1. DROPBOX_REFRESH_TOKEN is correct');
        console.error('2. Token was generated for the correct app (stone-development)');
        console.error('3. App has App Folder permissions');
        // Don't throw here - let filesListFolder try and show the real error
      }
      
      // Build the request parameters
      // For App Folder apps, Dropbox API requires empty string "" for root
      // But the SDK might need it passed differently
      const recursive = options.recursive ?? true;
      const listParams: { include_non_downloadable_files: boolean; recursive: boolean; path: string } = {
        include_non_downloadable_files: false,
        recursive,
        path: listFromAppRoot ? '' : apiPath,
      };

      console.log(
        'Calling filesListFolder - path type:',
        typeof listParams.path,
        'value:',
        listParams.path === '' ? '(empty string)' : listParams.path,
      );

      let res;
      if (listFromAppRoot) {
        console.log('Calling with explicit empty string for App Folder / scoped app root');
        res = await dropbox.filesListFolder({
          path: '',
          recursive: listParams.recursive,
          include_non_downloadable_files: false,
        });
      } else {
        console.log('Full params:', JSON.stringify(listParams, null, 2));
        res = await dropbox.filesListFolder(listParams);
      }

      console.log(`Successfully listed folder. Found ${res.result.entries.length} entries`);
      await processEntries(res.result.entries, prefix, cleanUser, s3AppsSubfolder);
      cursor = res.result.cursor;
    } catch (error: any) {
      console.error('Error in filesListFolder:', error);
      console.error('Error status:', error?.status);
      console.error('Error details:', JSON.stringify(error.error || error, null, 2));
      
      // path/not_found: only App Folder “root not ready” is a soft exit; for 0 US/... it’s a config issue
      const pathNotFound =
        error?.error?.error?.['.tag'] === 'path' && error?.error?.error?.path?.['.tag'] === 'not_found';
      if (pathNotFound) {
        if (listFromAppRoot) {
          console.log('App folder root not listable yet. It may appear after the first file upload.');
          return;
        }
        console.error(
          `Dropbox path not found: "${dropboxBase}". In per-user mode, update Firestore user folderPath to a folder that exists; ` +
            `in full-scope mode set DROPBOX_FULL_LIST_PATH (e.g. /0 US) or DROPBOX_IS_APP_FOLDER. Webhook will stay 200; sync did not run.`,
        );
        return;
      }

      throw error;
    }
  }

  // Drain changes using filesListFolderContinue
  const recursiveFlag = options.recursive ?? true;
  let hasMore = true;
  while (hasMore && cursor) {
    try {
      const cont = await dropbox.filesListFolderContinue({ cursor });
      await processEntries(cont.result.entries, prefix, cleanUser, s3AppsSubfolder);
      cursor = cont.result.cursor;
      hasMore = cont.result.has_more;
    } catch (error: any) {
      // 409, reset tag, or 400 "cursor is for a different app" (new OAuth app / rotated app) — re-list
      if (shouldResetDropboxCursor(error)) {
        console.log('Dropbox cursor invalid; resetting and starting fresh list_folder sync...');
        console.error('Cursor error details:', JSON.stringify(error.error || error, null, 2));
        // Clear the cursor and start fresh
        cursor = undefined;
        await userDocRef.set({ [DROPBOX_SYNC_CURSOR_FIELD]: null }, { merge: true });

        const res = await dropbox.filesListFolder({
          path: listFromAppRoot ? '' : dropboxBase || '',
          recursive: recursiveFlag,
          include_non_downloadable_files: false,
        });
        console.log(`Fresh sync successful. Found ${res.result.entries.length} entries`);
        await processEntries(res.result.entries, prefix, cleanUser, s3AppsSubfolder);
        cursor = res.result.cursor;
        hasMore = res.result.has_more;
      } else {
        // Log other errors with details
        console.error('Error in filesListFolderContinue:', error);
        console.error('Error details:', JSON.stringify(error.error || error, null, 2));
        // Re-throw other errors
        throw error;
      }
    }
  }

  // Persist latest cursor
  await userDocRef.set({ [DROPBOX_SYNC_CURSOR_FIELD]: cursor ?? null }, { merge: true });
}

async function processEntries(
  entries: any[],
  prefix: string,
  cleanUser: string,
  s3AppsSubfolder: string | null = null,
) {
  console.log(
    `Processing ${entries.length} entries with prefix: ${prefix}, cleanUser: ${cleanUser}, s3AppsSubfolder: ${s3AppsSubfolder ?? 'null'}`,
  );

  for (const entry of entries) {
    // Handle deleted files
    if (entry['.tag'] === 'deleted') {
      const pathLower: string = entry.path_lower;
      console.log(`🗑️  File deleted in Dropbox: ${pathLower}`);

      let relative = pathLower.replace(/^\/+/, '');

      if (s3AppsSubfolder) {
        relative = `Apps/${s3AppsSubfolder}/${relative}`;
      } else if (prefix.toLowerCase() === 'apps') {
        relative = relative.replace(/^apps\//i, 'Apps/');
      } else {
        relative = relative.replace(/^0 us\//i, '0 US/');
      }
      
      // Only process if it's an image/video file
      const isImage = isImageFile(relative);
      const isVideo = isVideoFile(relative);
      
      if (isImage || isVideo) {
        const s3Key = relative.startsWith(prefix) ? relative : `${prefix}/${relative}`;
        
        try {
          await deleteFromS3(s3Key);
          console.log(`✅ Deleted from S3: ${s3Key}`);
        } catch (error) {
          console.error(`❌ Failed to delete from S3: ${s3Key}`, error);
        }
      }
      
      continue; // Skip to next entry
    }
    
    // Handle new/modified files
    if (entry['.tag'] === 'file') {
      const pathLower: string = entry.path_lower; // For App Folder: /folder/file.jpg (relative to app folder)
      console.log(`Found file: ${pathLower}`);
      
      // Normalize path - handle both /Apps/ and /0 US/ structures
      let relative = pathLower.replace(/^\/+/, '');
      
      if (s3AppsSubfolder) {
        relative = `Apps/${s3AppsSubfolder}/${relative}`;
      } else if (prefix.toLowerCase() === 'apps') {
        relative = relative.replace(/^apps\//i, 'Apps/');
      } else {
        relative = relative.replace(/^0 us\//i, '0 US/');
      }
      
      const isImage = isImageFile(relative);
      const isVideo = isVideoFile(relative);
      
      if (!isImage && !isVideo) {
        console.log(`Skipping non-image/video: ${relative}`);
        continue;
      }
      
      // Use the relative path as S3 key (already includes prefix for App Folder)
      const s3Key = relative.startsWith(prefix) ? relative : `${prefix}/${relative}`;
      console.log(`Processing ${isImage ? 'image' : 'video'}: ${s3Key}`);

      // RECOMMENDED: Use SQS + Lambda for ALL production workloads
      // Benefits: No timeout limits, parallel processing, handles multi-GB files
      if (sqsClient && process.env.SQS_QUEUE_URL && !process.env.SQS_QUEUE_URL.includes('your-queue')) {
        console.log(`📨 Queueing to SQS: ${s3Key}`);
        await enqueueSqsJob({
          dropboxId: entry.id,
          path: `/${relative}`,
          type: isVideo ? 'video' : 'image',
          userFolderPath: cleanUser,
          s3Key: s3Key
        });
        continue;
      }

      // FALLBACK: Direct processing in Next.js (NOT recommended for large files)
      // Limitations:
      // - Vercel Pro: 60 second timeout (may fail on large files)
      // - Memory limits: 1GB max
      // - No parallel processing
      // Use SQS+Lambda for production!
      if (isImage) {
        console.log(`⚠️  Processing directly (no SQS) - may timeout on large files: ${s3Key}`);
        try {
          await processImageDirectly(entry.id, s3Key);
          console.log(`✅ Successfully processed: ${s3Key}`);
        } catch (error) {
          console.error(`❌ Failed to process image ${s3Key}:`, error);
          if (error instanceof Error && error.message.includes('timeout')) {
            console.error(`💡 TIP: Configure SQS_QUEUE_URL to avoid timeouts on large files`);
          }
          // Continue processing other files even if one fails
        }
      } else if (isVideo) {
        console.warn(`⚠️  Video processing requires Lambda/SQS. Skipping ${s3Key}`);
      }
    }
  }
}

function isImageFile(key: string) {
  const lower = key.toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'].some(ext => lower.endsWith(ext));
}

function isVideoFile(key: string) {
  const lower = key.toLowerCase();
  return ['.mp4', '.mov', '.m4v', '.avi', '.mkv'].some(ext => lower.endsWith(ext));
}

/**
 * Process image directly (no Lambda) - creates single optimized JPG
 * Handles HEIC/HEIF conversion and compresses 4K images optimally
 */
async function processImageDirectly(fileId: string, s3Key: string) {
  try {
    // Download content from Dropbox by file id
    console.log(`⏬ Downloading from Dropbox: ${s3Key}`);
    const dl = await dropbox.filesDownload({ path: fileId });
    const fileBinary = (dl.result as any).fileBinary as ArrayBuffer | undefined;
    const fileBlob = (dl.result as any).fileBlob as Blob | undefined;

    let inputBuffer: Buffer;
    if (fileBinary) {
      inputBuffer = Buffer.from(fileBinary);
    } else if (fileBlob) {
      inputBuffer = Buffer.from(await fileBlob.arrayBuffer());
    } else {
      const file = (dl.result as any).file as ArrayBuffer | undefined;
      if (!file) {
        console.error('No file data found in Dropbox response');
        return;
      }
      inputBuffer = Buffer.from(file);
    }

    const fileSizeMB = inputBuffer.length / 1024 / 1024;
    console.log(`📦 Downloaded: ${fileSizeMB.toFixed(2)}MB`);

    // Extract directory and filename
    const parts = s3Key.split('/');
    const filename = parts.pop() || '';
    const dir = parts.join('/');
    const dotIndex = filename.lastIndexOf('.');
    const name = dotIndex > -1 ? filename.slice(0, dotIndex) : filename;
    const ext = dotIndex > -1 ? filename.slice(dotIndex).toLowerCase() : '';

    console.log(`🖼️  Processing ${ext} image: ${filename}`);

    // Detect image format and get metadata
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    console.log(`Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}, size: ${(inputBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    // Create single optimally compressed JPG
    // For 4K images (3840x2160 or higher), we preserve quality while compressing
    // Max dimension: 3840px (4K), Quality: 85% (excellent), Progressive: true (faster perceived load)
    const compressed = await image
      .resize(3840, 3840, { 
        fit: 'inside', 
        withoutEnlargement: true,
        kernel: 'lanczos3' // Best quality downscaling
      })
      .jpeg({ 
        quality: 85,           // Higher quality for 4K images
        progressive: true,     // Progressive rendering for web
        mozjpeg: true,         // Use mozjpeg for better compression
        chromaSubsampling: '4:4:4'  // Better color quality
      })
      .toBuffer();
    
    console.log(`Compressed to: ${(compressed.length / 1024 / 1024).toFixed(2)}MB (${((compressed.length / inputBuffer.length) * 100).toFixed(1)}% of original)`);

    // Always save as .jpg regardless of input format (handles HEIC, PNG, etc.)
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: `${dir}/${name}.jpg`,
      Body: compressed,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable'
    }));

    console.log(`✅ Processed image: ${s3Key} → ${name}.jpg (single compressed variant)`);
  } catch (error) {
    console.error(`Error processing image ${s3Key}:`, error);
    throw error;
  }
}

/**
 * Delete file from S3
 * Handles both original filename and .jpg conversion
 */
async function deleteFromS3(s3Key: string) {
  try {
    // Extract directory and filename
    const parts = s3Key.split('/');
    const filename = parts.pop() || '';
    const dir = parts.join('/');
    const dotIndex = filename.lastIndexOf('.');
    const name = dotIndex > -1 ? filename.slice(0, dotIndex) : filename;

    // Always delete the .jpg version since we save all images as .jpg
    const jpgKey = `${dir}/${name}.jpg`;
    
    console.log(`Deleting from S3: ${jpgKey}`);
    
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: jpgKey
    }));

    console.log(`🗑️  Deleted from S3: ${jpgKey}`);
  } catch (error) {
    console.error(`Error deleting from S3 ${s3Key}:`, error);
    throw error;
  }
}

// Legacy function name for backwards compatibility
async function mirrorFileToS3(fileId: string, s3Key: string) {
  return processImageDirectly(fileId, s3Key);
}

async function enqueueSqsJob(payload: {
  dropboxId: string;
  path: string;
  type: 'image' | 'video';
  userFolderPath: string;
  s3Key: string;
}) {
  if (!sqsClient || !process.env.SQS_QUEUE_URL) return;
  
  const command = new SendMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      priority: payload.type === 'image' ? 'normal' : 'low'
    })
  });
  
  await sqsClient.send(command);
  console.log(`✅ Queued to SQS: ${payload.s3Key}`);
}


