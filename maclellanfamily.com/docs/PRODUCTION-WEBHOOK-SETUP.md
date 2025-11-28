# Production Webhook Setup for maclellanfamily.com

## Webhook URL

For production site **maclellanfamily.com**, use this webhook URL in your Dropbox App Console:

```
https://maclellanfamily.com/api/dropbox/webhook
```

## Setup Steps

1. **Go to Dropbox App Console**: https://www.dropbox.com/developers/apps
2. **Select your app** (the one with "0 US" structure)
3. **Go to Settings → Webhooks**
4. **Enter the webhook URL**: `https://maclellanfamily.com/api/dropbox/webhook`
5. **Save** - Dropbox will verify the endpoint automatically

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

1. Upload an image to `/0 US/kevin/2025/christmas/hey/image.jpg` in Dropbox
2. Check your server logs - should see webhook received
3. File should appear in S3 at `0 US/kevin/2025/christmas/hey/image.jpg` (compressed)

## Path Structure

- **Dropbox**: `/0 US/kevin/2025/christmas/hey/image.jpg`
- **S3**: `0 US/kevin/2025/christmas/hey/image.jpg` (same structure, compressed)

## Compression

✅ **Yes, all images are automatically compressed:**
- Original: Resized to max 2000px, JPEG quality 80
- Variants: 480px, 960px, 1600px widths (responsive sizes)
- All saved as `.jpg` format

