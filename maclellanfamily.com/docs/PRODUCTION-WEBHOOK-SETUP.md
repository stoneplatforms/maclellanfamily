# Production Webhook Setup for maclellanfamily.com

## Webhook URL

⚠️ **IMPORTANT**: Use the **www** version to avoid 308 redirect errors!

For production site **maclellanfamily.com**, use this webhook URL in your Dropbox App Console:

```
https://www.maclellanfamily.com/api/dropbox/webhook
```

**Why www?** Your domain redirects from non-www to www. Dropbox doesn't follow redirects during webhook verification, causing a 308 Permanent Redirect error if you use the non-www URL.

## Setup Steps

1. **Go to Dropbox App Console**: https://www.dropbox.com/developers/apps
2. **Select your app** (works with both "0 US" and "Apps" folder structures)
3. **Go to Settings → Webhooks**
4. **Enter the webhook URL**: `https://www.maclellanfamily.com/api/dropbox/webhook` ⚠️ **Must use www!**
5. **Save** - Dropbox will send a GET request with `?challenge=` parameter to verify
6. **Verify success** - You should see "Webhook URL verified" in Dropbox console

## Environment Variables

Make sure these are set in your production environment (Vercel/Next.js):

```bash
# Dropbox API
DROPBOX_CLIENT_ID=your_app_key
DROPBOX_CLIENT_SECRET=your_app_secret
DROPBOX_REFRESH_TOKEN=your_refresh_token  # Use refresh token for production (auto-refreshes)

# Optional: Use access token if refresh token not available
# DROPBOX_ACCESS_TOKEN=sl.u.xxx...  # Short-lived, expires after ~4 hours
```

## How Refresh Token Works

The code automatically uses refresh tokens if `DROPBOX_ACCESS_TOKEN` is not set:

1. **Priority**: `DROPBOX_ACCESS_TOKEN` (if set) → `DROPBOX_REFRESH_TOKEN` (fallback)
2. **Refresh tokens** automatically refresh access tokens when they expire
3. **Better for production** - no manual token updates needed

## Testing

### For "0 US" Folder Structure:
1. Upload an image to `/0 US/kevin/2025/christmas/hey/image.jpg` in Dropbox
2. Check your server logs - should see webhook received
3. File should appear in S3 at `0 US/kevin/2025/christmas/hey/image.jpg` (compressed)
4. Check your yearbooks page - the image should appear automatically

### For "Apps" Folder Structure:
1. Upload an image to your Dropbox App Folder (e.g., `/Apps/stone-development/2025/image.jpg`)
2. Check your server logs - should see webhook received
3. File should appear in S3 at `Apps/stone-development/2025/image.jpg` (compressed)
4. Check your yearbooks page - the image should appear automatically

## Path Structure

The code now **automatically detects** your folder structure:

### 0 US Structure:
- **Dropbox**: `/0 US/kevin/2025/christmas/image.jpg`
- **S3**: `0 US/kevin/2025/christmas/image.jpg` (same structure, compressed)
- **API**: Uses `0 US/kevin/` as prefix

### Apps Structure:
- **Dropbox**: `/Apps/stone-development/2025/image.jpg` (App Folder apps see this as `/2025/image.jpg`)
- **S3**: `Apps/stone-development/2025/image.jpg` (full path preserved)
- **API**: Uses `Apps/stone-development/` as prefix

## Compression

✅ **Yes, all images are automatically compressed:**
- Original: Resized to max 2000px, JPEG quality 80
- Variants: 480px, 960px, 1600px widths (responsive sizes)
- All saved as `.jpg` format

