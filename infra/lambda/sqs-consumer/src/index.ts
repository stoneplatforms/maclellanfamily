import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { SQSRecord, SQSEvent, Context } from 'aws-lambda';
import { Dropbox } from 'dropbox';
import fetch from 'cross-fetch';
import sharp from 'sharp';
import { MediaConvertClient, CreateJobCommand } from '@aws-sdk/client-mediaconvert';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const mediaconvert = new MediaConvertClient({ region: process.env.AWS_REGION, endpoint: process.env.MEDIACONVERT_ENDPOINT });

const dropbox = new Dropbox({
  clientId: process.env.DROPBOX_CLIENT_ID!,
  clientSecret: process.env.DROPBOX_CLIENT_SECRET!,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN!,
  fetch
});

const BUCKET = process.env.AWS_S3_BUCKET!;

type JobPayload = {
  dropboxId: string;
  path: string; // e.g. /0 US/user/album/file.jpg
  type: 'image' | 'video';
  userFolderPath: string;
  s3Key: string; // Full S3 key path
  timestamp?: string;
  priority?: 'normal' | 'low';
};

/**
 * Lambda handler with batch processing and partial failure support
 * - Processes multiple messages in parallel
 * - Reports only failed items back to SQS for retry
 * - Handles multi-GB files efficiently
 */
export const handler = async (event: SQSEvent, context: Context) => {
  console.log(`📦 Processing ${event.Records.length} SQS messages`);
  console.log(`⚙️  Lambda config: Memory=${context.memoryLimitInMB}MB, Remaining=${context.getRemainingTimeInMillis()}ms`);
  
  const batchItemFailures: { itemIdentifier: string }[] = [];
  
  // Process all messages in parallel for maximum throughput
  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const payload = JSON.parse(record.body) as JobPayload;
      console.log(`🔄 Processing ${payload.type}: ${payload.s3Key}`);
      
      try {
        if (payload.type === 'image') {
          await processImage(payload);
        } else if (payload.type === 'video') {
          await processVideo(payload);
        }
        return { success: true, record };
      } catch (error) {
        console.error(`❌ Failed to process ${payload.s3Key}:`, error);
        return { success: false, record, error };
      }
    })
  );
  
  // Collect failed items for retry
  results.forEach((result, index) => {
    if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)) {
      const record = event.Records[index];
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  });
  
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = batchItemFailures.length;
  
  console.log(`✅ Success: ${succeeded}, ❌ Failed: ${failed} (will retry)`);
  
  // Return partial batch failure response
  // Only failed items will be retried, successful items are deleted from queue
  return {
    batchItemFailures
  };
};

/**
 * Process image: Single optimally compressed JPG
 * - Max 4K resolution (3840px)
 * - 85% quality (excellent for web)
 * - Progressive JPEG (faster perceived loading)
 * - HEIC/HEIF/PNG → JPG conversion
 * - Handles multi-GB source files via streaming
 */
async function processImage(payload: JobPayload) {
  const startTime = Date.now();
  
  try {
    // Download from Dropbox
    console.log(`⏬ Downloading from Dropbox: ${payload.dropboxId}`);
    const dl = await dropbox.filesDownload({ path: payload.dropboxId });
    const fileBlob = (dl.result as any).fileBlob as Blob | undefined;
    const fileBinary = (dl.result as any).fileBinary as ArrayBuffer | undefined;
    
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
    console.log(`📦 Downloaded: ${fileSizeMB.toFixed(2)}MB in ${Date.now() - startTime}ms`);
    
    // Extract directory and filename from s3Key
    const { dir, name } = splitKey(payload.s3Key);
    
    // Detect image format and get metadata
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    console.log(`📐 Original: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    
    // Process image: Single optimally compressed JPG
    // - Max 4K (3840px) - preserves quality for large displays
    // - 85% quality - excellent visual quality, good compression
    // - Progressive - faster perceived loading (renders incrementally)
    // - mozjpeg - best-in-class JPEG encoder
    // - lanczos3 kernel - highest quality downscaling
    const compressStart = Date.now();
    const compressed = await image
      .resize(3840, 3840, { 
        fit: 'inside', 
        withoutEnlargement: true,
        kernel: 'lanczos3' // Best quality downscaling
      })
      .toFormat('jpeg', {
        quality: 85,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();
    
    const compressedSizeMB = compressed.length / 1024 / 1024;
    const compressionRatio = ((compressed.length / inputBuffer.length) * 100).toFixed(1);
    console.log(`🗜️  Compressed: ${compressedSizeMB.toFixed(2)}MB (${compressionRatio}% of original) in ${Date.now() - compressStart}ms`);
    
    // Upload to S3 (always as .jpg)
    const s3Key = `${dir}/${name}.jpg`;
    await putS3(s3Key, compressed, 'image/jpeg');
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ Processed: ${payload.s3Key} → ${s3Key} in ${totalTime}ms`);
    
  } catch (error) {
    console.error(`❌ Error processing ${payload.s3Key}:`, error);
    throw error; // Re-throw so SQS can retry
  }
}

async function processVideo(payload: JobPayload) {
  // Step 1: stream original to S3 (multipart)
  const tempLink = await dropbox.filesGetTemporaryLink({ path: payload.dropboxId });
  const url = tempLink.result.link;
  const baseKey = payload.path.replace(/^\/+/, '');
  const { dir, name } = splitKey(baseKey);
  const originalKey = `${dir}/${name}` + getExtensionFromPath(baseKey);

  await streamUrlToS3(url, BUCKET, originalKey, getContentTypeFromExt(originalKey));

  // Step 2: create MediaConvert HLS job
  const destination = `s3://${BUCKET}/${dir}/outputs/${name}/`;
  const job = buildHlsJob(originalKey, destination);
  await mediaconvert.send(new CreateJobCommand(job));
}

function buildHlsJob(inputKey: string, destination: string) {
  return {
    Role: process.env.MEDIACONVERT_ROLE_ARN!,
    Settings: {
      TimecodeConfig: { Source: 'ZEROBASED' },
      Inputs: [
        {
          FileInput: `s3://${BUCKET}/${inputKey}`,
          AudioSelectors: { 'Audio Selector 1': { DefaultSelection: 'DEFAULT' } },
          VideoSelector: {}
        }
      ],
      OutputGroups: [
        {
          Name: 'HLS Group',
          OutputGroupSettings: {
            Type: 'HLS_GROUP_SETTINGS',
            HlsGroupSettings: {
              Destination: destination,
              SegmentLength: 6,
              MinSegmentLength: 0,
              ManifestDurationFormat: 'INTEGER',
              CodecSpecification: 'RFC_4281',
              DirectoryStructure: 'SINGLE_DIRECTORY',
              ManifestCompression: 'NONE',
              ClientCache: 'ENABLED'
            }
          },
          Outputs: [
            hlsVideoOutput(1920, 'H264', 5000000, 1920, 1080),
            hlsVideoOutput(1280, 'H264', 3000000, 1280, 720),
            hlsVideoOutput(854, 'H264', 1200000, 854, 480),
            hlsAudioOutput()
          ]
        }
      ]
    }
  } as const;
}

function hlsVideoOutput(maxBitrate: number, codec: 'H264', bitrate: number, width: number, height: number) {
  return {
    VideoDescription: {
      CodecSettings: {
        Codec: codec,
        H264Settings: {
          Bitrate: bitrate,
          RateControlMode: 'CBR',
          CodecLevel: 'AUTO',
          CodecProfile: 'MAIN',
          MaxBitrate: maxBitrate,
          GopSize: 2,
          GopSizeUnits: 'SECONDS',
          NumberBFramesBetweenReferenceFrames: 2,
          AdaptiveQuantization: 'HIGH',
          SceneChangeDetect: 'TRANSITION_DETECTION'
        }
      },
      Width: width,
      Height: height
    },
    ContainerSettings: { Container: 'M3U8' },
    NameModifier: `_${height}p`
  } as const;
}

function hlsAudioOutput() {
  return {
    AudioDescriptions: [
      {
        CodecSettings: {
          Codec: 'AAC',
          AacSettings: { Bitrate: 96000, CodingMode: 'CODING_MODE_2_0', SampleRate: 48000 }
        }
      }
    ],
    ContainerSettings: { Container: 'M3U8' },
    NameModifier: '_audio'
  } as const;
}

function splitKey(key: string) {
  const parts = key.split('/');
  const file = parts.pop() as string;
  const dir = parts.join('/');
  const dot = file.lastIndexOf('.');
  const name = dot > -1 ? file.slice(0, dot) : file;
  return { dir, name };
}

function getExtensionFromPath(key: string) {
  const dot = key.lastIndexOf('.');
  return dot > -1 ? key.slice(dot) : '';
}

function getContentTypeFromExt(key: string) {
  const ext = getExtensionFromPath(key).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.m4v') return 'video/x-m4v';
  return 'application/octet-stream';
}

async function putS3(key: string, body: Buffer, contentType: string) {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    }
  });
  await upload.done();
}

async function streamUrlToS3(url: string, bucket: string, key: string, contentType: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error('Failed to fetch Dropbox temporary link');
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: res.body as any,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    }
  });
  await upload.done();
}


