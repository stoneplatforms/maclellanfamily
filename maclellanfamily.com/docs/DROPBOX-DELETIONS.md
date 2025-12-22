# Dropbox Deletions & S3 Sync

## 🗑️ Automatic Deletion Sync

When you **delete a file in Dropbox**, the system now **automatically deletes it from S3** as well!

---

## How It Works

### The Flow

```
1. You delete image.jpg in Dropbox
              ↓
2. Dropbox detects deletion
              ↓
3. Dropbox sends webhook notification
              ↓
4. Your app receives webhook
              ↓
5. Fetches changes using cursor (includes deletions)
              ↓
6. Detects deletion in change list
              ↓
7. Deletes image.jpg from S3
              ↓
8. Image removed from website
```

---

## What Gets Deleted

### Image Files
When you delete an image from Dropbox, the system deletes:
- ✅ The compressed JPG from S3 (since we save all as .jpg)
- ✅ Removes from all API responses
- ✅ Disappears from website gallery

### Example
```
Dropbox: Delete /2017/christmas/photo.heic
              ↓
S3: Deletes 0 US/kevin/2017/christmas/photo.jpg
              ↓
Website: Photo removed from gallery
```

---

## Supported File Types

Deletions are detected and synced for:
- ✅ JPG/JPEG
- ✅ PNG
- ✅ GIF
- ✅ WebP
- ✅ HEIC/HEIF (iPhone photos)
- ⚠️ Videos (detected but not deleted if using SQS)

---

## Testing Deletion Sync

### Step 1: Upload a Test Image

Upload a test image to Dropbox:
```
/2017/christmas/test-delete-me.jpg
```

Wait for it to sync (check S3 or website).

### Step 2: Delete the Image

Delete `test-delete-me.jpg` from Dropbox.

### Step 3: Check Logs

Watch your terminal (where `npm run dev` is running):
```
🗑️  File deleted in Dropbox: /0 us/kevin/2017/christmas/test-delete-me.jpg
Deleting from S3: 0 US/kevin/2017/christmas/test-delete-me.jpg
🗑️  Deleted from S3: 0 US/kevin/2017/christmas/test-delete-me.jpg
✅ Deleted from S3: 0 US/kevin/2017/christmas/test-delete-me.jpg
```

### Step 4: Verify S3

Check S3 bucket - file should be gone:
```bash
aws s3 ls s3://your-bucket/0\ US/kevin/2017/christmas/
# Should NOT see test-delete-me.jpg
```

### Step 5: Check Website

Visit `/yearbooks/2017/christmas` - image should be gone from gallery.

---

## Timing & Sync

### How Fast?
- **Webhook triggered**: Within seconds of deletion
- **S3 deletion**: Within 1-2 seconds
- **Website update**: Next time page loads (images cached)

### Cursor-Based Detection
The system uses Dropbox's **cursor API** to track changes:
- ✅ Only fetches changed files (efficient)
- ✅ Includes additions, modifications, AND deletions
- ✅ No polling needed (webhook-triggered)

---

## Edge Cases

### 1. Multiple Files Deleted at Once

**Works!** All deletions are processed:
```
Delete 5 photos in Dropbox
    ↓
Webhook triggers once
    ↓
System fetches all changes
    ↓
All 5 photos deleted from S3
```

### 2. Folder Deletion

**Partially supported:**
- ❌ Deleting a folder doesn't automatically delete all contents from S3
- ✅ Individual file deletions within folder ARE detected
- 💡 **Workaround**: Delete files individually, then delete empty folder

### 3. Rename/Move

**Treated as delete + add:**
```
Rename photo.jpg → photo-renamed.jpg
    ↓
Dropbox reports:
  - Deleted: photo.jpg
  - Added: photo-renamed.jpg
    ↓
S3 actions:
  - Deletes photo.jpg
  - Uploads photo-renamed.jpg
```

Result: Old file removed, new file added ✅

### 4. Already Deleted Files

**Safe!** S3 delete is idempotent:
- Deleting non-existent file = no error
- System logs attempt and continues

---

## Manual Cleanup (If Needed)

If deletions weren't syncing before this update, you might have orphaned files in S3.

### Option 1: Compare Dropbox vs S3

Use this script to find orphaned files:
```bash
# List files in Dropbox
# List files in S3
# Compare and find differences
```

### Option 2: Manual S3 Cleanup

Delete individual files:
```bash
aws s3 rm s3://your-bucket/0\ US/kevin/2017/christmas/old-photo.jpg
```

Delete entire folder:
```bash
aws s3 rm s3://your-bucket/0\ US/kevin/2017/christmas/ --recursive
```

---

## Logging

### What You'll See in Logs

**When file is deleted:**
```
🗑️  File deleted in Dropbox: /0 us/kevin/2017/christmas/photo.jpg
Deleting from S3: 0 US/kevin/2017/christmas/photo.jpg
🗑️  Deleted from S3: 0 US/kevin/2017/christmas/photo.jpg
✅ Deleted from S3: 0 US/kevin/2017/christmas/photo.jpg
```

**If deletion fails:**
```
❌ Failed to delete from S3: 0 US/kevin/2017/christmas/photo.jpg Error: ...
```

**Non-image file deleted (skipped):**
```
🗑️  File deleted in Dropbox: /0 us/kevin/2017/document.pdf
(No S3 deletion - not an image)
```

---

## Security & Permissions

### S3 Permissions Required

Your AWS credentials need:
```json
{
  "Action": [
    "s3:PutObject",     // Upload images ✅
    "s3:DeleteObject"   // Delete images ✅ (NEW)
  ],
  "Resource": "arn:aws:s3:::your-bucket/*"
}
```

Check your IAM policy includes `s3:DeleteObject`!

---

## Disabling Deletion Sync

If you want to keep files in S3 even when deleted from Dropbox:

### Option 1: Comment Out Deletion Code

In `dropbox-sync.ts`, comment out the deletion block:
```typescript
// Handle deleted files
/*
if (entry['.tag'] === 'deleted') {
  // ... deletion logic ...
}
*/
```

### Option 2: Add Flag

Create an environment variable:
```bash
SYNC_DELETIONS=false
```

Then modify code to check flag before deleting.

---

## Troubleshooting

### Issue: Files Not Deleting from S3

**Check:**
1. ✅ Webhook is working (check logs)
2. ✅ AWS credentials have `s3:DeleteObject` permission
3. ✅ File was actually an image (not video/document)
4. ✅ File path matches S3 key structure

**Fix:**
- Check terminal logs for error messages
- Verify S3 IAM policy
- Manually delete if needed

### Issue: Files Deleted but Still Showing on Website

**Cause:** Browser/CDN caching

**Fix:**
1. Hard refresh (Ctrl+Shift+R)
2. Clear browser cache
3. If using CloudFront, invalidate cache

### Issue: Folder Deleted but Files Remain

**Expected behavior!** Folder deletions don't trigger file deletions.

**Workaround:**
- Delete files individually first
- Then delete empty folder
- Or manually clean up S3

---

## Best Practices

### 1. Test First
Delete a test image and verify it's removed before deleting important photos.

### 2. Backup Strategy
Consider keeping backups since deletions are automatic:
- S3 Versioning (keeps deleted files)
- Separate backup bucket
- Dropbox's own trash (30-day retention)

### 3. Bulk Deletions
For deleting many files:
- Delete in smaller batches
- Monitor logs to ensure all sync
- Check S3 afterwards

---

## Summary

**Deletion sync is now automatic! ✅**

**What happens:**
- Delete in Dropbox → Deleted from S3
- Rename in Dropbox → Old deleted, new uploaded
- Move in Dropbox → Old deleted, new uploaded

**What doesn't happen:**
- Folder deletion → Files remain (delete individually)
- Videos (if using SQS) → May need manual cleanup

**Benefits:**
- ✅ Keep Dropbox and S3 in sync
- ✅ No orphaned files in S3
- ✅ Accurate website gallery
- ✅ Lower storage costs

**Remember:** Deletions are permanent! Files are removed from S3 immediately.

