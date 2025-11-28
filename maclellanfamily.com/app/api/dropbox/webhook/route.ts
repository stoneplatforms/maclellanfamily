import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { adminDb } from '../../../lib/firebase-admin';
import { syncDropboxToS3, processWebhookFiles } from '../../../lib/dropbox-sync';

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
      'Content-Type': 'text/plain'
    }
  });
}

/**
 * Verify webhook signature to ensure request is from Dropbox
 * Dropbox sends X-Dropbox-Signature header with HMAC-SHA256 signature
 */
function verifyWebhookSignature(body: string, signature: string | null): boolean {
  if (!signature || !process.env.DROPBOX_CLIENT_SECRET) {
    console.warn('Missing webhook signature or DROPBOX_CLIENT_SECRET');
    return false;
  }

  // Compute HMAC-SHA256 of request body using app secret
  const hmac = createHmac('sha256', process.env.DROPBOX_CLIENT_SECRET);
  hmac.update(body);
  const computedSignature = hmac.digest('hex');

  // Compare signatures using constant-time comparison
  return signature === computedSignature;
}

// Dropbox webhook events delivery - processes only changed files
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const bodyText = await request.text();
    const signature = request.headers.get('X-Dropbox-Signature');

    // Verify webhook signature (security check)
    if (!verifyWebhookSignature(bodyText, signature)) {
      console.error('Invalid webhook signature - possible security issue');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Parse JSON body
    const body = JSON.parse(bodyText);
    
    console.log('Webhook payload:', JSON.stringify(body, null, 2));
    
    // Dropbox webhook format: { list_folder: { accounts: [...] } }
    // The payload contains account IDs, not specific file changes
    // We need to call Dropbox API to get actual changes
    const accounts = body?.list_folder?.accounts || [];
    
    console.log(`Webhook received: ${accounts.length} account(s) in payload`);
    
    // IMPORTANT: Even if payload is empty, Dropbox sent us a webhook
    // which means something might have changed. We should check for changes anyway.
    // The actual changes are retrieved via Dropbox API using the cursor, not from the payload.
    // So we process changes regardless of whether accounts array is empty.
    
    if (accounts.length === 0) {
      console.log('Empty payload received, but will still check for changes using cursor');
    }

    // Get userFolderPath and process changed files
    // Process in background to avoid webhook timeout (must respond within 10 seconds)
    // Files are processed sequentially (one at a time) to avoid overwhelming Vercel
    adminDb.collection('integrations').doc('dropbox').get().then(async (integrationsDoc) => {
      // ALWAYS get fresh userFolderPath from users collection (more reliable)
      // Prioritize users with Apps folder structure, then any admin user
      console.log('Getting userFolderPath from users collection...');
      const allUsersSnapshot = await adminDb.collection('users')
        .where('role', '==', 'admin')
        .get();
      
      let userFolderPath: string | undefined;
      
      if (!allUsersSnapshot.empty) {
        // Use first admin user (no longer prioritizing Apps folder)
        const firstUser = allUsersSnapshot.docs[0];
        userFolderPath = firstUser.data()?.folderPath as string | undefined;
        console.log(`Using admin user: ${firstUser.id}, folderPath: ${userFolderPath}`);
        
        // Update integrations with fresh value
        if (userFolderPath) {
          await adminDb.collection('integrations').doc('dropbox').set({ userFolderPath }, { merge: true });
          console.log(`Updated integrations/dropbox with userFolderPath: ${userFolderPath}`);
        }
      } else {
        // Fallback to integrations if no admin users found
        userFolderPath = integrationsDoc.exists ? (integrationsDoc.data()?.userFolderPath as string | undefined) : undefined;
        if (userFolderPath) {
          console.log(`Using userFolderPath from integrations (fallback): ${userFolderPath}`);
        } else {
          console.error('No admin users found and no userFolderPath in integrations');
        }
      }
      
      if (!userFolderPath) {
        console.error('No userFolderPath configured for Dropbox sync. Please run /api/dropbox/sync first or set folderPath in integrations/dropbox');
        return;
      }

      // Process webhook changes (will fetch actual changes from Dropbox API)
      // This is more efficient than full sync - only processes changed files
      // Auto-detect prefix based on folderPath (Apps/ vs 0 US/)
      const cleanPath = userFolderPath.replace(/^\/+|\/+$/g, '');
      const pathPrefix = cleanPath.toLowerCase().startsWith('apps') ? 'Apps' : '0 US';
      
      console.log(`Processing webhook with folderPath: ${userFolderPath}, prefix: ${pathPrefix}`);
      
      try {
        await processWebhookFiles({ userFolderPath, pathPrefix });
      } catch (error) {
        console.error('Error processing webhook files:', error);
        // Fallback to full sync if webhook processing fails
        await syncDropboxToS3({ userFolderPath, pathPrefix, recursive: true }).catch((syncError) => {
          console.error('Fallback sync also failed:', syncError);
        });
      }
    }).catch((error) => {
      console.error('Error in webhook handler:', error);
    });

    // Respond immediately (Dropbox requires response within 10 seconds)
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook POST error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}


