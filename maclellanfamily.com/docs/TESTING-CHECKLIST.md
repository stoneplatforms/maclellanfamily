# End-to-End Testing Checklist for Webhook & Image Sync

## Prerequisites

Before testing, ensure:
- [ ] Webhook URL updated in Dropbox to use `https://www.maclellanfamily.com/api/dropbox/webhook`
- [ ] Webhook status shows "Active" in Dropbox console
- [ ] Environment variables set in Vercel:
  - `DROPBOX_CLIENT_ID`
  - `DROPBOX_CLIENT_SECRET`
  - `DROPBOX_REFRESH_TOKEN` (or `DROPBOX_ACCESS_TOKEN`)
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_S3_BUCKET`
  - `AWS_S3_REGION`
- [ ] Latest code deployed to production

## Test 1: Webhook Verification

### Manual Test:
```bash
# Test webhook GET endpoint (simulates Dropbox verification)
curl -v "https://www.maclellanfamily.com/api/dropbox/webhook?challenge=test123"
```

**Expected Result:**
```
HTTP/1.1 200 OK
Content-Type: text/plain
test123
```

**❌ Fail if you see:**
- `308 Permanent Redirect` → Webhook URL wrong (should use www)
- `404 Not Found` → Deployment issue
- `500 Internal Server Error` → Check Vercel logs

## Test 2: Folder Structure Detection

### For "0 US" Structure:
1. Check your Firestore `users/{your-uid}` document
2. Verify `folderPath` field:
   ```json
   {
     "folderPath": "kevin",  // or "/kevin"
     "role": "admin"
   }
   ```
3. Expected S3 prefix: `0 US/kevin/`

### For "Apps" Structure:
1. Check your Firestore `users/{your-uid}` document
2. Verify `folderPath` field:
   ```json
   {
     "folderPath": "Apps/stone-development",  // or just "stone-development"
     "role": "admin"
   }
   ```
3. Expected S3 prefix: `Apps/stone-development/`

## Test 3: Image Upload & Webhook Trigger

### Step 1: Upload Test Image
Upload a test image to Dropbox:

**For 0 US structure:**
```
/0 US/kevin/test-folder/test-image.jpg
```

**For Apps structure:**
```
/test-folder/test-image.jpg (within your App Folder)
```

### Step 2: Check Vercel Logs
Within 10 seconds, check Vercel logs for:

```
✅ Expected log entries:
Webhook payload: { list_folder: { accounts: [...] } }
Webhook received: 1 account(s) in payload
Getting userFolderPath from users collection...
Using admin user: {uid}, folderPath: {path}
Processing webhook with folderPath: {path}, prefix: {prefix}
Cursor status: Found cursor, doing incremental sync
Found file: /test-folder/test-image.jpg
Processing image: {s3-key}
Processing image directly (no SQS): {s3-key}
✅ Successfully processed: {s3-key}
Processed {n} changed files from webhook
```

**❌ Fail if you see:**
- `Invalid webhook signature` → Check `DROPBOX_CLIENT_SECRET`
- `No admin users found` → Check Firestore `users/{uid}` has `role: "admin"`
- `No userFolderPath configured` → Check Firestore `users/{uid}` has `folderPath`
- `Failed to process image` → Check AWS credentials

## Test 4: S3 Verification

### Check S3 Bucket
Using AWS Console or CLI, verify files exist:

**Expected files:**
```
# For 0 US structure:
0 US/kevin/test-folder/test-image.jpg         (original, max 2000px)
0 US/kevin/test-folder/test-image_w480.jpg    (480px width)
0 US/kevin/test-folder/test-image_w960.jpg    (960px width)
0 US/kevin/test-folder/test-image_w1600.jpg   (1600px width)

# For Apps structure:
Apps/stone-development/test-folder/test-image.jpg
Apps/stone-development/test-folder/test-image_w480.jpg
Apps/stone-development/test-folder/test-image_w960.jpg
Apps/stone-development/test-folder/test-image_w1600.jpg
```

### CLI Check:
```bash
# For 0 US
aws s3 ls s3://your-bucket/0\ US/kevin/test-folder/

# For Apps
aws s3 ls s3://your-bucket/Apps/stone-development/test-folder/
```

## Test 5: Frontend Display

### Step 1: Visit Yearbooks Page
Navigate to: `https://www.maclellanfamily.com/yearbooks`

### Step 2: Verify Folder Appears
- [ ] "test-folder" appears as a yearbook spine
- [ ] Thumbnail loads (random image from folder)
- [ ] No console errors

### Step 3: Click Folder
Click on "test-folder" yearbook

### Step 4: Verify Images Load
- [ ] Test image appears in the gallery
- [ ] Image loads correctly (presigned URL)
- [ ] Responsive sizes work (check Network tab)
- [ ] No 403 errors (would indicate S3 permission issue)

## Test 6: Multiple Images

### Upload Multiple Images
Upload 3-5 images to the same folder:
```
/test-folder/image1.jpg
/test-folder/image2.jpg
/test-folder/image3.jpg
```

### Expected Behavior:
- [ ] Each upload triggers a separate webhook
- [ ] All images processed and uploaded to S3
- [ ] All images appear in yearbooks gallery
- [ ] Images sorted alphabetically

## Test 7: New Folder Creation

### Create New Folder in Dropbox
Upload image to a brand new folder:
```
/2025-christmas/family-photo.jpg
```

### Expected Behavior:
- [ ] Webhook triggered
- [ ] New folder appears on yearbooks page
- [ ] Thumbnail set to the uploaded image
- [ ] Clicking folder shows the image

## Test 8: Performance & Error Handling

### Large Image Upload
Upload a very large image (e.g., 10MB+, 5000x5000px):

**Expected:**
- [ ] Webhook processes successfully
- [ ] Image compressed to max 2000px
- [ ] File size reduced significantly
- [ ] All variants created
- [ ] Processing completes within 60 seconds (Vercel timeout)

### Non-Image File Upload
Upload a non-image file (e.g., PDF, TXT):

**Expected:**
- [ ] Webhook triggered
- [ ] File skipped (logged as "Skipping non-image/video")
- [ ] No errors thrown
- [ ] Other images still processed

### Deleted File 🗑️
Delete an image from Dropbox:

**Expected:**
- [ ] Webhook triggered
- [ ] File marked as deleted in change log
- [ ] **S3 file automatically deleted** ✅ (NEW!)
- [ ] Logs show deletion: `🗑️ Deleted from S3: {path}`
- [ ] Frontend no longer shows image (removed from gallery)

## Test 9: API Endpoints

### Test Yearbooks API
```bash
# Get folder list
curl -H "Authorization: Bearer {firebase-token}" \
  https://www.maclellanfamily.com/api/yearbooks

# Expected response:
{
  "folders": [
    {
      "name": "test-folder",
      "thumbnailUrl": "https://..."
    },
    {
      "name": "2025-christmas",
      "thumbnailUrl": "https://..."
    }
  ]
}
```

### Test Manual Sync
```bash
# Trigger manual sync (fallback)
curl -X POST \
  -H "Authorization: Bearer {firebase-token}" \
  https://www.maclellanfamily.com/api/dropbox/sync

# Expected response:
{
  "success": true
}
```

## Test 10: Deletion Sync 🗑️

### Purpose
Verify that deleting files in Dropbox automatically deletes them from S3.

### Step 1: Upload Test Image
Upload a test image specifically for deletion testing:
```
/test-folder/delete-me.jpg
```

Wait for it to sync and appear on website.

### Step 2: Verify Image Exists

**Check S3:**
```bash
aws s3 ls s3://your-bucket/0\ US/kevin/test-folder/
# Should see: delete-me.jpg
```

**Check Website:**
- Visit `/yearbooks/test-folder`
- Confirm `delete-me.jpg` is visible in gallery

### Step 3: Delete Image from Dropbox

Delete `delete-me.jpg` from Dropbox.

### Step 4: Check Logs

Watch terminal (where `npm run dev` is running):

**Expected logs:**
```
🗑️  File deleted in Dropbox: /0 us/kevin/test-folder/delete-me.jpg
Deleting from S3: 0 US/kevin/test-folder/delete-me.jpg
🗑️  Deleted from S3: 0 US/kevin/test-folder/delete-me.jpg
✅ Deleted from S3: 0 US/kevin/test-folder/delete-me.jpg
```

### Step 5: Verify Deletion in S3

**Check S3:**
```bash
aws s3 ls s3://your-bucket/0\ US/kevin/test-folder/
# Should NOT see: delete-me.jpg
```

### Step 6: Verify Website

**Refresh gallery page:**
- Visit `/yearbooks/test-folder`
- Confirm `delete-me.jpg` is NO LONGER visible
- No broken image placeholders

### Edge Case Tests

#### Test Multiple Deletions
1. Upload 3 test images: `test1.jpg`, `test2.jpg`, `test3.jpg`
2. Wait for sync
3. Delete all 3 at once
4. Verify all 3 deleted from S3
5. Verify all 3 removed from website

#### Test Rename (Delete + Add)
1. Upload `original.jpg`
2. Wait for sync
3. Rename to `renamed.jpg` in Dropbox
4. Verify `original.jpg` deleted from S3
5. Verify `renamed.jpg` uploaded to S3
6. Website shows only `renamed.jpg`

#### Test Non-Image Deletion
1. Upload `document.pdf`
2. Delete `document.pdf`
3. Verify webhook triggered
4. Verify log says "Skipping non-image/video" (not deleted)

### Checklist

- [ ] Single image deletion works
- [ ] Multiple image deletions work
- [ ] Logs show deletion messages
- [ ] S3 file deleted within 2 seconds
- [ ] Website no longer shows deleted image
- [ ] Rename = old deleted + new uploaded
- [ ] Non-image deletions logged but ignored

## Troubleshooting

### Issue: Webhook not triggering
- Check Dropbox webhook status (should be "Active")
- Verify webhook URL uses www
- Check Vercel function logs for errors
- Test webhook manually with curl

### Issue: Images not appearing on frontend
- Check S3 bucket - are files there?
- Check S3 prefix matches folder structure
- Check browser console for errors
- Verify Firebase auth token is valid

### Issue: Images compressed but wrong location
- Check `folderPath` in Firestore
- Verify prefix detection logic (Apps vs 0 US)
- Check S3 bucket for files in wrong location
- Run manual sync to fix

### Issue: Timeout errors (Vercel)
- Check image size (very large images may timeout)
- Consider using SQS + Lambda for large files
- Check Vercel function logs for timeout
- Upgrade Vercel plan (Pro = 60s timeout)

### Issue: Deletions not syncing to S3 🗑️
- Check webhook is triggering (Dropbox console status)
- Verify AWS credentials have `s3:DeleteObject` permission
- Check logs for deletion messages: `🗑️ Deleted from S3`
- Confirm file was an image (not video/document)
- Hard refresh browser (Ctrl+Shift+R) to clear cache
- Check S3 directly: `aws s3 ls s3://bucket/path/`
- See `DROPBOX-DELETIONS.md` for detailed troubleshooting

## Success Criteria

All tests pass if:
- ✅ Webhook verifies successfully (no 308 errors)
- ✅ Images uploaded to Dropbox appear in S3 within 2 minutes
- ✅ Images compressed and variants created
- ✅ Correct S3 folder structure (Apps or 0 US)
- ✅ Images appear on yearbooks page automatically
- ✅ No errors in Vercel logs
- ✅ No 403/404 errors on frontend

## Next Steps After Successful Testing

1. Delete test folder/images
2. Upload real family photos
3. Monitor webhook logs for first few uploads
4. Set up CloudWatch alerts for Lambda errors (if using SQS)
5. Consider CDN (CloudFront) for faster image delivery

