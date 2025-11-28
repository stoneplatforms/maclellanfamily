## Goal

Add a CDN in front of S3 while keeping the current Dropbox → compress (sharp) → S3 ingestion, ensuring fast loads and automatic updates when the client adds files to Dropbox.

## Architecture Overview

- Source of truth: Client Dropbox folder (`/0 US/<userFolderPath>/...`).
- Ingestion: Serverless sync compresses and uploads to S3 using stable keys.
- Storage: S3 bucket, private to public via CloudFront Origin Access Control (OAC).
- Delivery: CloudFront distribution (optional custom domain + ACM cert).
- App: Next.js fetches and displays images using CloudFront URLs; no presigned S3 URLs needed.

## Bucket Layout

- `0 US/<userFolderPath>/<album>/<filename>` for original-compressed size.
- Optional responsive variants per image:
  - `.../<basename>_w480.jpg`
  - `.../<basename>_w960.jpg`
  - `.../<basename>_w1600.jpg`
  - Keep the original-compressed as `.../<basename>.jpg`.

## Caching Strategy

- On upload (PutObject), set headers:
  - `Cache-Control: public, max-age=31536000, immutable`
  - `Content-Type: image/jpeg` (or correct type)
- Avoid overwriting the same key. Use versioned or size-suffixed keys so CDN/browser cache stays valid without invalidations.

## CloudFront Setup

1. Create/choose distribution, origin = S3 bucket (Origin Access Control enabled).
2. Update S3 bucket policy to grant CloudFront OAC access only.
3. Cache behavior:
   - Path pattern: `0 US/*`
   - Viewer protocol policy: Redirect HTTP to HTTPS
   - Allowed methods: GET/HEAD
   - Cache policy: CachingOptimized (or custom) with long TTLs
   - Compress objects: On
4. Optional: Custom domain and ACM cert, then update DNS.

### CloudFront OAC steps

1. In CloudFront → Distributions → Create (or Edit your distribution)
2. Origin → Origin access → Choose “Origin access control (OAC)” and click “Create new OAC”
3. Signing behavior: “Sign requests” → Create
4. Save distribution changes
5. CloudFront will prompt to update your S3 bucket policy. Apply the policy below (or let the console update it automatically).

### S3 bucket policy for OAC

Replace `BUCKET_NAME`, `ACCOUNT_ID`, and `DISTRIBUTION_ID`. Scope `Resource` to your images prefix (`0 US/*`) or to the whole bucket (`/*`) if preferred.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontPrivateContentOAC",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/0 US/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

## Ingestion Changes (Serverless Sync)

- Continue compressing images with `sharp` during Dropbox sync.
- Add multiple width variants (480/960/1600) if enabling responsive images.
- Set `Cache-Control` and `Content-Type` on all `PutObject` calls.
- Keep existing key structure to match front-end album browsing.

Example headers:

```ts
await s3Client.send(new PutObjectCommand({
  Bucket: process.env.AWS_S3_BUCKET!,
  Key: s3Key,
  Body: buffer,
  ContentType: 'image/jpeg',
  CacheControl: 'public, max-age=31536000, immutable'
}));
```

## Frontend Changes

- Replace S3 presigned URLs with CloudFront URLs: `https://<cloudfront-domain>/0 US/<userFolderPath>/...`
- If using variants, render with `srcset`:

```html
<img
  src="https://cdn.example.com/0 US/user/album/photo_w960.jpg"
  srcset="
    https://cdn.example.com/0 US/user/album/photo_w480.jpg 480w,
    https://cdn.example.com/0 US/user/album/photo_w960.jpg 960w,
    https://cdn.example.com/0 US/user/album/photo_w1600.jpg 1600w"
  sizes="(max-width: 768px) 90vw, 1200px"
  loading="lazy"
  decoding="async"
  alt="Photo"
/>
```

## Security

- Prefer CloudFront + OAC; keep S3 bucket private.
- If access gating is needed, use CloudFront signed URLs/cookies instead of S3 presigned URLs for better caching.

## Rollout Steps

1. Provision CloudFront distribution and OAC; update S3 bucket policy.
2. Update sync code to set `Cache-Control` and to optionally emit variants.
3. Flip frontend to use CloudFront domain and (optionally) `srcset`.
4. Run a manual full sync once to populate headers and variants.
5. Validate performance, cache, and correctness in production.

## Vercel hosting notes

- Webhooks run in serverless functions. If you process deltas inline, keep execution under ~10s so Dropbox doesn’t retry.
- For larger deltas, trigger a background job (Vercel Queues/Background Functions) or run a scheduled sync via Vercel Cron hitting an internal admin endpoint secured with a secret header.
- If using a cron-secured endpoint, add a server-side secret check (e.g., `X-Internal-Secret`) instead of Firebase user auth for the cron call.

## Future Options

- Add on-the-fly transforms later with AWS Serverless Image Handler behind CloudFront.
- Add WebP/AVIF variants for modern browsers.
- Add background queue (SQS) if sync volume grows.

## Large Files Strategy (Photos/Videos in GBs)

When source assets are very large, avoid processing in Vercel functions. Use AWS for data plane, Vercel for control plane.

### Control plane (Vercel)
- Dropbox webhook receives change notifications and lists deltas only.
- For each changed file, enqueue a job to SQS (`DROPBOX_SYNC_QUEUE_URL`) with metadata: path, type (image/video), desired outputs.
- A small admin endpoint can also enqueue reprocessing.

### Data plane (AWS)
- Lambda consumer pulls jobs from SQS and performs streaming ingest and processing:
  - Obtain Dropbox temporary link for the file.
  - Stream download → S3 multipart upload (no buffering entire file in memory).
  - For images: use `sharp` in Lambda with streams to generate multiple sizes and store under versioned keys; set `Cache-Control`.
  - For videos: after original is in S3, start a MediaConvert job to output HLS to an `outputs/` prefix, and store poster frames.
- CloudFront serves images and HLS outputs.

### S3/CloudFront considerations
- Enable multipart uploads; use size-suffixed keys for images; never overwrite keys.
- Set long TTL headers on all objects.
- For videos, enable Range requests; HLS segments are naturally cacheable.

### Minimal SQS message shape (example)

```json
{
  "path": "/0 US/user/album/file.jpg",
  "dropboxId": "id:abcd...",
  "type": "image", // or "video"
  "userFolderPath": "user",
  "outputs": { "imageSizes": [480, 960, 1600] }
}
```

### Required env vars (add to Vercel/AWS)
- `SQS_QUEUE_URL` – target SQS queue for sync jobs
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `MEDIACONVERT_ENDPOINT` (from AWS console), optional until video processing is used
- Existing Dropbox and Firebase admin envs remain unchanged
  - `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET`, `DROPBOX_REFRESH_TOKEN`
  - `FIREBASE_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`

### Lambda outline (image path)
1. Read SQS message → get Dropbox temp link
2. Stream download to S3 original (multipart)
3. For each target size, stream sharp resize → PutObject with `Cache-Control: public, max-age=31536000, immutable`
4. Return success; SQS deletes the message

### Lambda outline (video path)
1. Stream to S3 original (multipart)
2. Start MediaConvert job template (HLS) to `outputs/<basename>/...`
3. Optionally generate poster images via a second job or thumbnails feature
4. Notify (optional) via SNS/SQS when complete


