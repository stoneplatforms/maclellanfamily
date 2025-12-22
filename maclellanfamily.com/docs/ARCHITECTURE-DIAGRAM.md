# Architecture Diagram: Dropbox → S3 → Frontend

## Complete Flow (After Fixes)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS IMAGE                               │
│                                                                          │
│  Dropbox App (0 US):        /0 US/kevin/2025/christmas/photo.jpg       │
│  Dropbox App (Apps):        /2025/christmas/photo.jpg                   │
│                             (stored as Apps/stone-development/...)       │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    DROPBOX DETECTS CHANGE                                │
│                                                                          │
│  • File uploaded/modified/deleted                                       │
│  • Dropbox webhook system triggered                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              DROPBOX SENDS WEBHOOK TO YOUR SITE                          │
│                                                                          │
│  POST https://www.maclellanfamily.com/api/dropbox/webhook               │
│  Headers:                                                                │
│    X-Dropbox-Signature: abc123...                                       │
│  Body:                                                                   │
│    { list_folder: { accounts: ["dbid:..."] } }                          │
│                                                                          │
│  ⚠️  CRITICAL: Must use www to avoid 308 redirect!                      │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│           WEBHOOK HANDLER (/api/dropbox/webhook/route.ts)               │
│                                                                          │
│  1. Verify HMAC signature (security check)                              │
│  2. Get userFolderPath from Firestore users/{uid}                       │
│  3. Auto-detect folder structure:                                       │
│     • If folderPath starts with "Apps" → prefix = "Apps"                │
│     • Otherwise → prefix = "0 US"                                       │
│  4. Call processWebhookFiles()                                          │
│  5. Respond "OK" immediately (must respond within 10 seconds)           │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│         PROCESS WEBHOOK FILES (lib/dropbox-sync.ts)                     │
│                                                                          │
│  1. Load cursor from Firestore integrations/dropbox                     │
│  2. Call Dropbox API: filesListFolderContinue({ cursor })               │
│  3. Get only changed files (incremental sync)                           │
│  4. For each changed file:                                              │
│     • Check if image or video                                           │
│     • Skip non-media files                                              │
│     • Process images directly (or queue to SQS if configured)           │
│  5. Update cursor in Firestore                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            PROCESS IMAGE DIRECTLY (lib/dropbox-sync.ts)                 │
│                                                                          │
│  1. Download image from Dropbox by file ID                              │
│  2. Use Sharp library to compress:                                      │
│     • Original: Max 2000px, JPEG quality 80                             │
│     • Variant 1: 480px width                                            │
│     • Variant 2: 960px width                                            │
│     • Variant 3: 1600px width                                           │
│  3. Upload all 4 variants to S3                                         │
│  4. Set Cache-Control: public, max-age=31536000, immutable              │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    S3 BUCKET (AWS)                                       │
│                                                                          │
│  Bucket: maclellanfamily-photos                                         │
│                                                                          │
│  Files created (0 US structure):                                        │
│    0 US/kevin/2025/christmas/photo.jpg          (original, ≤2000px)    │
│    0 US/kevin/2025/christmas/photo_w480.jpg     (480px)                │
│    0 US/kevin/2025/christmas/photo_w960.jpg     (960px)                │
│    0 US/kevin/2025/christmas/photo_w1600.jpg    (1600px)               │
│                                                                          │
│  Files created (Apps structure):                                        │
│    Apps/stone-development/2025/christmas/photo.jpg                      │
│    Apps/stone-development/2025/christmas/photo_w480.jpg                 │
│    Apps/stone-development/2025/christmas/photo_w960.jpg                 │
│    Apps/stone-development/2025/christmas/photo_w1600.jpg                │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              USER VISITS YEARBOOKS PAGE                                  │
│                                                                          │
│  Browser: https://www.maclellanfamily.com/yearbooks                     │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│           YEARBOOKS PAGE (app/yearbooks/page.tsx)                       │
│                                                                          │
│  1. Check Firebase auth                                                 │
│  2. Fetch folders: GET /api/yearbooks                                   │
│  3. Display yearbook spines with thumbnails                             │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│          YEARBOOKS API (/api/yearbooks/route.ts)                        │
│                                                                          │
│  1. Verify Firebase auth token                                          │
│  2. Get userFolderPath from Firestore                                   │
│  3. Auto-detect S3 prefix using getS3Prefix():                          │
│     • "kevin" → "0 US/kevin/"                                           │
│     • "Apps/stone-development" → "Apps/stone-development/"              │
│  4. List S3 folders with delimiter "/"                                  │
│  5. For each folder, get random image as thumbnail                      │
│  6. Generate presigned URLs (1 hour expiry)                             │
│  7. Return JSON: { folders: [...] }                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               FRONTEND DISPLAYS YEARBOOKS                                │
│                                                                          │
│  ┌──────┐  ┌──────┐  ┌──────┐                                          │
│  │ 2023 │  │ 2024 │  │ 2025 │  ← Yearbook spines                       │
│  └──────┘  └──────┘  └──────┘                                          │
│                                                                          │
│  User clicks "2025" yearbook                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│      YEARBOOK DETAIL PAGE (app/yearbooks/[year]/page.tsx)               │
│                                                                          │
│  1. Fetch images: GET /api/yearbooks?folder=2025                        │
│  2. Display images in gallery                                           │
│  3. Use responsive srcset for different screen sizes                    │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            IMAGES LOAD FROM S3 (Presigned URLs)                         │
│                                                                          │
│  <img                                                                    │
│    src="https://maclellanfamily-photos.s3.amazonaws.com/                │
│         0%20US/kevin/2025/christmas/photo.jpg?                          │
│         X-Amz-Algorithm=...&X-Amz-Credential=...&X-Amz-Signature=..."   │
│    srcset="                                                              │
│      .../photo_w480.jpg?... 480w,                                       │
│      .../photo_w960.jpg?... 960w,                                       │
│      .../photo_w1600.jpg?... 1600w"                                     │
│  />                                                                      │
│                                                                          │
│  Browser automatically selects best size based on screen width          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Folder Structure Detection Logic

```typescript
function getS3Prefix(folderPath: string): string {
  const cleanPath = folderPath.startsWith('/') 
    ? folderPath.slice(1) 
    : folderPath;
  
  if (cleanPath.toLowerCase().startsWith('apps')) {
    // App Folder structure
    const appFolderName = cleanPath.replace(/^apps\/?/i, '');
    return `Apps/${appFolderName}/`;
    // Example: "Apps/stone-development" → "Apps/stone-development/"
  } else {
    // Standard structure
    return `0 US/${cleanPath}/`;
    // Example: "kevin" → "0 US/kevin/"
  }
}
```

---

## Firestore Data Structure

```
firestore/
├── users/
│   └── {uid}/
│       ├── email: "kevin@example.com"
│       ├── role: "admin"
│       └── folderPath: "kevin"  OR  "Apps/stone-development"
│
└── integrations/
    └── dropbox/
        ├── userFolderPath: "kevin"  (cached from users)
        └── cursor: "AAH..."  (for incremental sync)
```

---

## S3 Bucket Structure

```
s3://maclellanfamily-photos/

# Standard (0 US) Structure:
0 US/
└── kevin/
    ├── 2023/
    │   ├── summer/
    │   │   ├── beach.jpg
    │   │   ├── beach_w480.jpg
    │   │   ├── beach_w960.jpg
    │   │   └── beach_w1600.jpg
    │   └── winter/
    │       └── ...
    ├── 2024/
    │   └── ...
    └── 2025/
        └── christmas/
            ├── photo.jpg
            ├── photo_w480.jpg
            ├── photo_w960.jpg
            └── photo_w1600.jpg

# App Folder Structure:
Apps/
└── stone-development/
    ├── 2023/
    │   └── ...
    ├── 2024/
    │   └── ...
    └── 2025/
        └── christmas/
            ├── photo.jpg
            ├── photo_w480.jpg
            ├── photo_w960.jpg
            └── photo_w1600.jpg
```

---

## Security Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK SECURITY                              │
│                                                                  │
│  1. Dropbox sends X-Dropbox-Signature header                    │
│  2. Server computes HMAC-SHA256 of request body                 │
│     using DROPBOX_CLIENT_SECRET                                 │
│  3. Compare signatures (constant-time comparison)               │
│  4. If match → Process webhook                                  │
│  5. If no match → Return 401 Unauthorized                       │
│                                                                  │
│  This prevents malicious actors from triggering fake webhooks   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    API SECURITY                                  │
│                                                                  │
│  1. User logs in with Firebase Auth                             │
│  2. Frontend gets Firebase ID token                             │
│  3. API verifies token with Firebase Admin SDK                  │
│  4. Check user role in Firestore (must be "admin")              │
│  5. If valid → Return data                                      │
│  6. If invalid → Return 401 Unauthorized                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    S3 SECURITY                                   │
│                                                                  │
│  1. S3 bucket is private (not public)                           │
│  2. API generates presigned URLs (1 hour expiry)                │
│  3. URLs include AWS signature                                  │
│  4. Only authenticated users get presigned URLs                 │
│  5. URLs expire after 1 hour                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Performance Optimizations

### Image Compression
- **Original images**: Often 5-10MB, 4000x3000px
- **Compressed original**: ~500KB, max 2000px, JPEG quality 80
- **Variants**: 
  - 480px: ~50KB (mobile)
  - 960px: ~150KB (tablet)
  - 1600px: ~300KB (desktop)
- **Total savings**: ~90% reduction in bandwidth

### Incremental Sync (Cursor-Based)
- **Without cursor**: Scans ALL files every time (slow)
- **With cursor**: Only fetches changed files (fast)
- **How it works**: 
  1. First sync: Get all files + cursor
  2. Save cursor to Firestore
  3. Next sync: Use cursor to get only changes
  4. Update cursor

### Presigned URLs
- **Without presigned URLs**: Need to proxy all images through API (slow)
- **With presigned URLs**: Browser loads directly from S3 (fast)
- **Caching**: S3 Cache-Control header = 1 year (immutable)

### Responsive Images
- **Without srcset**: Always loads full-size image (wasteful)
- **With srcset**: Browser picks optimal size based on screen
- **Example**: 
  - Mobile (375px): Loads 480px variant (~50KB)
  - Desktop (1920px): Loads 1600px variant (~300KB)

---

## Error Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK ERRORS                                │
│                                                                  │
│  • Invalid signature → 401 Unauthorized                         │
│  • Cursor expired → Reset cursor, do full sync                  │
│  • Dropbox API error → Log error, return 500                    │
│  • Image processing error → Log error, continue with next       │
│  • Vercel timeout (10s) → Process in background                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    API ERRORS                                    │
│                                                                  │
│  • No auth token → 401 Unauthorized                             │
│  • Invalid token → 401 Unauthorized                             │
│  • Not admin → 401 Unauthorized                                 │
│  • No folderPath → 400 Bad Request                              │
│  • S3 error → 500 Internal Server Error                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND ERRORS                               │
│                                                                  │
│  • Not logged in → Redirect to /                                │
│  • API error → Show error message                               │
│  • Image load error → Show placeholder                          │
│  • Network error → Show retry button                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Monitoring & Debugging

### Vercel Logs
```bash
# View real-time logs
vercel logs --follow

# Look for:
✅ "Webhook received: 1 account(s)"
✅ "Successfully processed: {s3-key}"
❌ "Invalid webhook signature"
❌ "Failed to process image"
```

### S3 Bucket Check
```bash
# List files
aws s3 ls s3://maclellanfamily-photos/0\ US/kevin/ --recursive

# Check file size
aws s3 ls s3://maclellanfamily-photos/0\ US/kevin/2025/ --human-readable
```

### Firestore Check
```
1. Go to Firebase Console
2. Navigate to Firestore Database
3. Check collections:
   - users/{uid} → Verify folderPath and role
   - integrations/dropbox → Verify cursor exists
```

### Browser DevTools
```
1. Open Network tab
2. Filter: XHR
3. Look for:
   - /api/yearbooks → Should return folders array
   - S3 presigned URLs → Should return 200 OK
   - Check response times
```

---

## Scaling Considerations

### Current Setup (Direct Processing)
- ✅ Good for: Small to medium usage (< 100 images/day)
- ⚠️ Limitations: Vercel timeout (10s free, 60s Pro)
- ⚠️ Large images may timeout

### Future Setup (SQS + Lambda)
- ✅ Good for: High volume (1000+ images/day)
- ✅ No timeout limits
- ✅ Parallel processing
- ✅ Video support (FFmpeg)
- 💰 Costs: ~$0.01 per 1000 images

### CDN Setup (CloudFront)
- ✅ Faster image delivery worldwide
- ✅ Reduced S3 bandwidth costs
- ✅ Edge caching
- 💰 Costs: ~$0.085 per GB

---

**All systems operational! Ready for production use.** 🚀

