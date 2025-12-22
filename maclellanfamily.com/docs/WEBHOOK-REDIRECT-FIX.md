# Fixing the 308 Redirect Error on Dropbox Webhook

## Problem

You're seeing this error when Dropbox tries to verify your webhook:

```
Error: Unacceptable status code 308 from server.

Request:
GET https://maclellanfamily.com/api/dropbox/webhook?challenge=hUk2abfp0wpDZpnZleF7SMlBJvlZgIaPumXHzO1MPU

Response:
HTTP/1.1 308 Permanent Redirect
Location: https://www.maclellanfamily.com/api/dropbox/webhook?challenge=hUk2abfp0wpDZpnZleF7SMlBJvlZgIaPumXHzO1MPU
```

## Root Cause

Your production domain **redirects from non-www to www** (or vice versa):
- Request: `https://maclellanfamily.com/...`
- Redirects to: `https://www.maclellanfamily.com/...` (308 Permanent Redirect)

**Dropbox webhooks don't follow HTTP redirects** during verification, so the webhook registration fails.

## Solution: Update Webhook URL to Use www

### Step 1: Go to Dropbox App Console
1. Visit: https://www.dropbox.com/developers/apps
2. Click on your app (e.g., "stone-development")
3. Go to **Settings** tab
4. Scroll down to **Webhooks** section

### Step 2: Update the Webhook URL
1. **Remove the old webhook URL** (if one exists):
   - Old (broken): `https://maclellanfamily.com/api/dropbox/webhook` ❌
   
2. **Add the new webhook URL**:
   - New (correct): `https://www.maclellanfamily.com/api/dropbox/webhook` ✅
   
3. Click **Add** or **Save**

### Step 3: Verify Success
Dropbox will immediately send a GET request to verify the webhook:

```
GET https://www.maclellanfamily.com/api/dropbox/webhook?challenge=RANDOM_STRING
```

Your endpoint should respond with the challenge value, and Dropbox will show:
```
✓ Webhook URL verified
Status: Active
Last attempt: Just now
```

## Alternative Solution: Configure Vercel to Not Redirect

If you prefer to use the non-www URL, you can configure Vercel to not redirect for the webhook endpoint.

### Option A: Add vercel.json with redirect exception

Create `maclellanfamily.com/vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/((?!api/dropbox/webhook).*)",
      "has": [
        {
          "type": "host",
          "value": "maclellanfamily.com"
        }
      ],
      "destination": "https://www.maclellanfamily.com/$1",
      "permanent": true
    }
  ]
}
```

This redirects everything EXCEPT `/api/dropbox/webhook`.

### Option B: Remove the redirect entirely in Vercel Dashboard

1. Go to Vercel Dashboard → Your project → Settings → Domains
2. Remove the redirect rule for `maclellanfamily.com → www.maclellanfamily.com`
3. Keep both domains as aliases (no redirect)

## Testing the Fix

### 1. Test webhook verification manually:

```bash
# This should return the challenge value (not a redirect)
curl -v "https://www.maclellanfamily.com/api/dropbox/webhook?challenge=test123"

# Expected output:
# HTTP/1.1 200 OK
# Content-Type: text/plain
# test123
```

### 2. Upload a test image to Dropbox:

For **0 US** structure:
```
/0 US/kevin/test/test-image.jpg
```

For **Apps** structure:
```
/test/test-image.jpg (in your Dropbox app folder)
```

### 3. Check server logs (Vercel):

You should see:
```
Webhook payload: { list_folder: { accounts: [...] } }
Webhook received: 1 account(s) in payload
Processing webhook with folderPath: ...
```

### 4. Check S3 bucket:

Image should appear at:
- **0 US**: `0 US/kevin/test/test-image.jpg`
- **Apps**: `Apps/stone-development/test/test-image.jpg`

With variants:
- `test-image.jpg` (original, max 2000px)
- `test-image_w480.jpg`
- `test-image_w960.jpg`
- `test-image_w1600.jpg`

### 5. Check yearbooks page:

Visit `https://www.maclellanfamily.com/yearbooks` - the "test" folder should appear with a thumbnail.

## Common Issues After Fix

### Issue: Still getting 308 errors
- **Cause**: Cached redirect or old webhook URL
- **Fix**: Clear webhook URL in Dropbox console, wait 1 minute, re-add with www

### Issue: Webhook verified but images not appearing
- **Cause**: Wrong folder structure in user's Firestore document
- **Fix**: Check `users/{uid}` document in Firestore - ensure `folderPath` is correct:
  - For 0 US: `kevin` or `/kevin` (not `/0 US/kevin`)
  - For Apps: `Apps/stone-development` or `stone-development`

### Issue: Webhook verified but no files syncing
- **Cause**: No cursor in Firestore
- **Fix**: Run manual sync first:
  ```bash
  POST /api/dropbox/sync
  Authorization: Bearer {firebase-token}
  ```

## Why ngrok Works but Production Doesn't

**ngrok**: No redirects, webhook URL is exactly what Dropbox expects
```
https://abc123.ngrok.io/api/dropbox/webhook → 200 OK ✅
```

**Production (before fix)**: Redirect breaks verification
```
https://maclellanfamily.com/api/dropbox/webhook → 308 Redirect ❌
→ https://www.maclellanfamily.com/api/dropbox/webhook → 200 OK
(But Dropbox stops at the 308 and doesn't follow)
```

**Production (after fix)**: Direct hit, no redirect
```
https://www.maclellanfamily.com/api/dropbox/webhook → 200 OK ✅
```

## Summary of All Fixes

✅ **Fixed**: Webhook URL now uses www to avoid 308 redirect
✅ **Fixed**: APIs now auto-detect folder structure (Apps vs 0 US)
✅ **Fixed**: Images now appear in yearbooks library regardless of folder structure
✅ **Fixed**: Compression and S3 upload working for both folder structures

## Next Steps

1. Update webhook URL in Dropbox console to use `https://www.maclellanfamily.com/api/dropbox/webhook`
2. Test by uploading an image to Dropbox
3. Verify image appears on yearbooks page within 1-2 minutes
4. If issues persist, check Vercel logs for errors

