# Image Compression System

## Overview

The system automatically compresses images uploaded to Dropbox and stores a single optimized JPG in S3. This provides optimal quality for 4K images while maintaining reasonable file sizes.

## How It Works

### 1. Upload to Dropbox
```
User uploads: IMG_1234.HEIC (12MB, 4000x3000)
                    ↓
         Dropbox Webhook Triggered
                    ↓
```

### 2. Automatic Processing
```
1. Download from Dropbox
2. Detect format (JPG, PNG, HEIC, etc.)
3. Compress to single optimized JPG:
   - Max dimension: 3840px (4K resolution)
   - Quality: 85% (excellent)
   - Format: Progressive JPEG (faster web loading)
   - Chroma: 4:4:4 (better color quality)
   - Compression: mozjpeg (best in class)
4. Upload to S3 as .jpg
```

### 3. Result
```
S3: 0 US/kevin/2017/christmas/IMG_1234.jpg
    Size: ~1.5MB (compressed from 12MB)
    Quality: Excellent (4K preserved)
```

## Compression Settings

### For 4K Images (3840x2160 or higher)
```typescript
sharp(inputBuffer)
  .resize(3840, 3840, { 
    fit: 'inside',              // Preserve aspect ratio
    withoutEnlargement: true,   // Don't upscale small images
    kernel: 'lanczos3'          // Best quality downscaling
  })
  .jpeg({ 
    quality: 85,                // High quality
    progressive: true,          // Progressive rendering
    mozjpeg: true,              // Best compression algorithm
    chromaSubsampling: '4:4:4'  // No color degradation
  })
```

### Compression Ratio
- **Input**: 12MB raw photo (4032x3024, iPhone)
- **Output**: 1.5MB optimized JPG (3840x2880, web-ready)
- **Savings**: ~87% size reduction
- **Quality**: Visually lossless

## Supported Formats

### Input Formats (Auto-Converted to JPG)
- ✅ **HEIC/HEIF** (iPhone/iOS photos) → JPG
- ✅ **PNG** → JPG
- ✅ **JPG/JPEG** → Optimized JPG
- ✅ **WebP** → JPG
- ✅ **GIF** → JPG (first frame)

### Output Format
- Always **JPG** (JPEG)
- Progressive encoding for web
- Optimized with mozjpeg

## File Naming

### Original File
```
Dropbox: /2017/christmas/screenshot 2025-12-21 200931.heic
```

### Processed File
```
S3: 0 US/kevin/2017/christmas/screenshot 2025-12-21 200931.jpg
```

**Note:** Extension is always `.jpg` regardless of input format.

## Quality Comparison

### Quality Levels
- **100%**: Uncompressed (huge files, no benefit for web)
- **95%**: Nearly lossless (still very large)
- **85%**: ✅ **Optimal** - excellent quality, reasonable size
- **80%**: Good quality, noticeable on close inspection
- **70%**: Visible compression artifacts

**We use 85%** - the sweet spot for 4K images.

## Performance

### Processing Time
| Image Size | Original Size | Processed Size | Time |
|------------|---------------|----------------|------|
| 4K (3840x2160) | 10MB | 1.5MB | ~2-3s |
| HD (1920x1080) | 4MB | 500KB | ~1-2s |
| Mobile (1080x1920) | 3MB | 400KB | ~1s |

### Bandwidth Savings
- **Before**: Load 10MB raw photo
- **After**: Load 1.5MB compressed JPG
- **Savings**: 85% less bandwidth
- **User Experience**: 6x faster loading

## Storage Structure

### S3 Bucket Layout
```
maclellanfamily.com/
├── 0 US/
│   └── kevin/
│       ├── 2017/
│       │   └── christmas/
│       │       ├── photo1.jpg
│       │       ├── photo2.jpg
│       │       └── photo3.jpg
│       └── 2018/
│           └── summer/
│               └── photo4.jpg
└── Apps/
    └── stone-development/
        └── 2024/
            └── vacation/
                └── photo5.jpg
```

## Frontend Display

### Gallery View
```typescript
<Image
  src={image.url}        // Single compressed JPG from S3
  alt="Photo"
  fill
  className="object-cover"
  sizes="100vw"          // Single size (no responsive variants)
  quality={90}           // Next.js quality setting
/>
```

### Full-Size Modal
```typescript
<Image
  src={image.url}        // Same single compressed JPG
  alt="Full size view"
  fill
  className="object-contain"
  sizes="100vw"
  priority
  unoptimized           // Don't re-compress (already optimized)
  quality={100}         // Display at full quality
/>
```

## Why This Approach?

### ✅ Advantages
1. **Simple**: One file per image (easy to manage)
2. **High Quality**: 4K resolution preserved
3. **Fast Loading**: ~85% smaller than originals
4. **Format Consistency**: All images are JPG
5. **HEIC Support**: iPhone photos work automatically
6. **Low Storage**: Single variant vs multiple

### 🎯 Perfect For
- Family photo galleries
- High-quality yearbooks
- Desktop/laptop viewing
- Modern internet speeds
- Personal/small-scale use

### ❌ Not Ideal For (But Fine)
- Mobile-first apps (would benefit from smaller variants)
- Bandwidth-critical applications
- Very slow connections (<1 Mbps)

## Customization

### Change Maximum Resolution
```typescript
// Current: 3840px (4K)
.resize(3840, 3840, { fit: 'inside' })

// HD: 1920px
.resize(1920, 1920, { fit: 'inside' })

// 5K: 5120px
.resize(5120, 5120, { fit: 'inside' })
```

### Change Quality
```typescript
// Current: 85%
.jpeg({ quality: 85 })

// Higher quality, larger files: 90%
.jpeg({ quality: 90 })

// Smaller files, lower quality: 80%
.jpeg({ quality: 80 })
```

### Change Format
```typescript
// Current: JPEG
.jpeg({ quality: 85, progressive: true })

// WebP (better compression, not universally supported)
.webp({ quality: 85 })

// PNG (lossless, huge files)
.png({ compressionLevel: 9 })
```

## Monitoring

### Check Compression Logs
```bash
# In your npm run dev terminal, look for:
Processing .heic image: IMG_1234.heic
Original image: 4032x3024, format: heic, size: 12.45MB
Compressed to: 1.52MB (12.2% of original)
✅ Processed image: 0 US/kevin/2017/christmas/IMG_1234.heic → IMG_1234.jpg
```

### Verify S3 Files
```bash
# Check what's in S3
aws s3 ls s3://your-bucket/0\ US/kevin/2017/christmas/ --human-readable

# Expected output:
# 2025-12-21 20:09:31    1.5 MiB photo1.jpg
# 2025-12-21 20:10:15    2.1 MiB photo2.jpg
# 2025-12-21 20:11:03    1.8 MiB photo3.jpg
```

## Troubleshooting

### Issue: Images Look Blurry
**Cause**: Quality setting too low or max resolution too small

**Fix**: Increase quality or max resolution:
```typescript
.resize(3840, 3840, { fit: 'inside' })  // Increase to 5120 for 5K
.jpeg({ quality: 90 })                   // Increase from 85 to 90
```

### Issue: Files Too Large
**Cause**: Quality setting too high or max resolution too large

**Fix**: Decrease quality or max resolution:
```typescript
.resize(2560, 2560, { fit: 'inside' })  // Decrease from 3840
.jpeg({ quality: 80 })                   // Decrease from 85 to 80
```

### Issue: HEIC Not Converting
**Cause**: Sharp library missing HEIC codec

**Fix**: Install libvips with HEIC support:
```bash
# macOS
brew install vips

# Ubuntu/Debian
apt-get install libvips libheif-dev
```

### Issue: Slow Processing
**Cause**: Large images or slow server

**Fix**: 
1. Use SQS + Lambda for processing (offload from Next.js)
2. Reduce max resolution (3840 → 2560)
3. Upgrade server resources

## Performance Tips

### 1. Use CDN (CloudFront)
Add CloudFront in front of S3 for faster global delivery:
- Edge caching
- Lower latency worldwide
- Reduced S3 bandwidth costs

### 2. Lazy Loading
Images load progressively as user scrolls:
```typescript
<Image
  src={image.url}
  loading="lazy"  // Add this
  ...
/>
```

### 3. Image Placeholder
Show blurred placeholder while loading:
```typescript
<Image
  src={image.url}
  placeholder="blur"
  blurDataURL={blurDataUrl}
  ...
/>
```

## Summary

**Current System:**
- ✅ Single compressed JPG per image
- ✅ 4K resolution (3840px max)
- ✅ 85% quality (excellent)
- ✅ HEIC/PNG/WebP → JPG conversion
- ✅ ~85% file size reduction
- ✅ Progressive JPEG (fast web loading)
- ✅ Simple and maintainable

**Result:** High-quality images with reasonable file sizes, perfect for family photo galleries! 📸✨

