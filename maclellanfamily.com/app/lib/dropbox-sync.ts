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

export interface SyncOptions {
  userFolderPath: string;
  pathPrefix?: string; // e.g., '0 US'
  recursive?: boolean;
}

/**
 * Process webhook-triggered changes - only processes files that changed since last sync
 * More efficient than full sync when webhook fires
 */
export async function processWebhookFiles(options: { userFolderPath: string; pathPrefix?: string }) {
  // Handle both /0 US/ and /Apps/ folder structures
  const cleanUser = options.userFolderPath.replace(/^\/+|\/+$/g, '');
  
  // Determine prefix based on folderPath
  // If folderPath starts with "Apps", use Apps structure, otherwise use 0 US
  let prefix: string;
  let dropboxBase: string;
  
  if (cleanUser.toLowerCase().startsWith('apps/') || cleanUser.toLowerCase().startsWith('apps')) {
    // App Folder structure: /Apps/stone-development/
    const appFolderName = cleanUser.replace(/^apps\/?/i, '');
    prefix = options.pathPrefix ?? 'Apps';
    
    // For App Folder apps, Dropbox API expects "" (empty string) as root, not "/"
    // But we need to preserve the full path structure for S3
    dropboxBase = ''; // App Folder apps use empty string "" as root
    console.log(`Detected Apps folder structure. App folder: ${appFolderName}, Dropbox API path: "" (empty string), S3 prefix: ${prefix}/${appFolderName}`);
  } else {
    // Standard structure: /0 US/{user}/
    prefix = options.pathPrefix ?? '0 US';
    dropboxBase = ensureLeadingSlash(`${prefix}/${cleanUser}`);
    console.log(`Detected standard structure. Dropbox base: ${dropboxBase}`);
  }

  // Load saved cursor from Firestore
  const cursorDocRef = adminDb.collection('integrations').doc('dropbox');
  const cursorDoc = await cursorDocRef.get();
  let cursor: string | undefined = cursorDoc.exists ? (cursorDoc.data()?.cursor as string | undefined) : undefined;

  console.log(`Cursor status: ${cursor ? 'Found cursor, doing incremental sync' : 'No cursor, doing full sync'}`);

  if (!cursor) {
    // No cursor means first sync - do full sync
    console.log('Starting full sync (no cursor found)...');
    return syncDropboxToS3({ 
      userFolderPath: options.userFolderPath, 
      pathPrefix: prefix, 
      recursive: true 
    });
  }

  // Get only changes since last cursor (incremental sync)
  let hasMore = true;
  let processedCount = 0;
  
  while (hasMore && cursor) {
    const cont = await dropbox.filesListFolderContinue({ cursor });
    
    // Process only changed entries (new/modified files)
    await processEntries(cont.result.entries, prefix, cleanUser);
    processedCount += cont.result.entries.length;
    
    cursor = cont.result.cursor;
    hasMore = cont.result.has_more;
  }

  // Persist latest cursor
  await cursorDocRef.set({ cursor }, { merge: true });
  
  console.log(`Processed ${processedCount} changed files from webhook`);
}

export async function syncDropboxToS3(options: SyncOptions) {
  const cleanUser = options.userFolderPath.replace(/^\/+|\/+$/g, '');
  
  // Determine prefix based on folderPath
  // If folderPath starts with "Apps", use Apps structure, otherwise use 0 US
  let prefix: string;
  let dropboxBase: string;
  
  if (cleanUser.toLowerCase().startsWith('apps/') || cleanUser.toLowerCase().startsWith('apps')) {
    // App Folder structure: /Apps/stone-development/
    const appFolderName = cleanUser.replace(/^apps\/?/i, '');
    prefix = options.pathPrefix ?? 'Apps';
    
    // For App Folder apps, Dropbox API expects "" (empty string) as root, not "/"
    // But we need to preserve the full path structure for S3
    dropboxBase = ''; // App Folder apps use empty string "" as root
    console.log(`Detected Apps folder structure. App folder: ${appFolderName}, Dropbox API path: "" (empty string), S3 prefix: ${prefix}/${appFolderName}`);
  } else {
    // Standard structure: /0 US/{user}/
    prefix = options.pathPrefix ?? '0 US';
    dropboxBase = ensureLeadingSlash(`${prefix}/${cleanUser}`);
  }

  // Determine if this is an App Folder app
  const isAppFolder = prefix.toLowerCase() === 'apps';
  
  // Load saved cursor from Firestore (for incremental listing)
  const cursorDocRef = adminDb.collection('integrations').doc('dropbox');
  const cursorDoc = await cursorDocRef.get();
  let cursor: string | undefined = cursorDoc.exists ? (cursorDoc.data()?.cursor as string | undefined) : undefined;

  // For App Folder apps, clear any existing cursor (might be from wrong path)
  // This ensures we start fresh with the correct empty string path
  if (isAppFolder && cursor) {
    console.log('Clearing existing cursor for App Folder app (ensuring fresh start)...');
    cursor = undefined;
    await cursorDocRef.set({ cursor: null }, { merge: true });
  }

  // If no cursor, start with filesListFolder
  if (!cursor) {
    // For App Folder apps, use empty string explicitly
    const apiPath = isAppFolder ? '' : (dropboxBase || '');
    console.log(`Starting fresh sync for path: "${apiPath}" (isAppFolder: ${isAppFolder}, dropboxBase: "${dropboxBase}")`);
    
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
      let listParams: any = {
        include_non_downloadable_files: false,
        recursive: options.recursive ?? true
      };
      
      if (isAppFolder) {
        // For App Folder apps, explicitly set empty string
        // Some SDK versions might need this as undefined instead
        listParams.path = '';
      } else {
        listParams.path = apiPath;
      }
      
      console.log('Calling filesListFolder - path type:', typeof listParams.path, 'value:', listParams.path === '' ? '(empty string)' : listParams.path);
      
      // For App Folder apps, explicitly pass empty string to avoid serialization issues
      let res;
      if (isAppFolder) {
        // Dropbox API requires empty string "" for App Folder root
        // Pass it explicitly to avoid SDK serialization issues
        console.log('Calling with explicit empty string for App Folder');
        res = await dropbox.filesListFolder({
          path: '',
          recursive: listParams.recursive,
          include_non_downloadable_files: false
        });
      } else {
        console.log('Full params:', JSON.stringify({
          ...listParams,
          path: listParams.path === '' ? '(empty string)' : listParams.path
        }, null, 2));
        res = await dropbox.filesListFolder(listParams);
      }
      
      console.log(`Successfully listed folder. Found ${res.result.entries.length} entries`);
      await processEntries(res.result.entries, prefix, cleanUser, isAppFolder);
      cursor = res.result.cursor;
    } catch (error: any) {
      console.error('Error in filesListFolder:', error);
      console.error('Error status:', error?.status);
      console.error('Error details:', JSON.stringify(error.error || error, null, 2));
      
      // If it's a path not found error, the app folder might not exist yet
      if (error?.error?.error?.['.tag'] === 'path' && error?.error?.error?.path?.['.tag'] === 'not_found') {
        console.log('App folder does not exist yet. This is normal for new App Folder apps.');
        return; // Exit gracefully - folder will be created when first file is uploaded
      }
      
      throw error;
    }
  }

  // Drain changes using filesListFolderContinue
  let hasMore = true;
  while (hasMore && cursor) {
    try {
      const cont = await dropbox.filesListFolderContinue({ cursor });
      await processEntries(cont.result.entries, prefix, cleanUser, isAppFolder);
      cursor = cont.result.cursor;
      hasMore = cont.result.has_more;
    } catch (error: any) {
      // Handle 409 error (cursor expired or invalid) - reset and start fresh
      if (error?.status === 409 || error?.error?.error?.['.tag'] === 'reset') {
        console.log('Cursor expired or invalid (409), resetting and starting fresh sync...');
        console.error('409 Error details:', JSON.stringify(error.error || error, null, 2));
        // Clear the cursor and start fresh
        cursor = undefined;
        await cursorDocRef.set({ cursor: null }, { merge: true });
        
        // Start fresh sync
        const res = await dropbox.filesListFolder({
          path: dropboxBase || '', // Ensure empty string for App Folder apps
          recursive: options.recursive ?? true,
          include_non_downloadable_files: false
        });
        console.log(`Fresh sync successful. Found ${res.result.entries.length} entries`);
        await processEntries(res.result.entries, prefix, cleanUser, isAppFolder);
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
  await cursorDocRef.set({ cursor }, { merge: true });
}

async function processEntries(entries: any[], prefix: string, cleanUser: string, isAppFolder: boolean = false) {
  console.log(`Processing ${entries.length} entries with prefix: ${prefix}, cleanUser: ${cleanUser}, isAppFolder: ${isAppFolder}`);
  
  // For App Folder apps, extract the app folder name from cleanUser
  const appFolderName = isAppFolder ? cleanUser.replace(/^apps\/?/i, '') : null;
  
  for (const entry of entries) {
    // Handle deleted files
    if (entry['.tag'] === 'deleted') {
      const pathLower: string = entry.path_lower;
      console.log(`🗑️  File deleted in Dropbox: ${pathLower}`);
      
      // Normalize path - same logic as file processing
      let relative = pathLower.replace(/^\/+/, '');
      
      if (isAppFolder && appFolderName) {
        relative = `Apps/${appFolderName}/${relative}`;
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
      
      // Handle Apps folder structure
      if (isAppFolder && appFolderName) {
        // For App Folder apps, paths are relative to app folder root
        // So "/folder/file.jpg" becomes "Apps/stone-development/folder/file.jpg" for S3
        relative = `Apps/${appFolderName}/${relative}`;
      } else if (prefix.toLowerCase() === 'apps') {
        // Keep Apps/ structure: Apps/stone-development/folder/file.jpg
        relative = relative.replace(/^apps\//i, 'Apps/');
      } else {
        // Handle 0 US structure
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


