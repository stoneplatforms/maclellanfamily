# Quick Start: Fix Webhook & Get Images Working

## 🚨 Critical Fix Required

Your webhook is failing because of a **308 redirect**. Here's the 2-minute fix:

### Step 1: Update Dropbox Webhook URL (2 minutes)

1. Go to: https://www.dropbox.com/developers/apps
2. Click your app
3. Go to **Settings** → **Webhooks**
4. **Change URL from:**
   ```
   ❌ https://maclellanfamily.com/api/dropbox/webhook
   ```
   **To:**
   ```
   ✅ https://www.maclellanfamily.com/api/dropbox/webhook
   ```
5. Click **Add** or **Save**
6. Verify it shows "Active" status

**That's it!** The www is critical - Dropbox doesn't follow redirects.

---

## 🧪 Test It Works (5 minutes)

### Test 1: Verify Webhook
```bash
curl "https://www.maclellanfamily.com/api/dropbox/webhook?challenge=test"
```
**Should return:** `test` (not a redirect)

### Test 2: Upload Test Image
Upload an image to Dropbox:
- **If using "0 US" structure:** `/0 US/kevin/test/photo.jpg`
- **If using "Apps" structure:** `/test/photo.jpg` (in your app folder)

### Test 3: Check Results (wait 1-2 minutes)
1. Check Vercel logs - should see "Successfully processed"
2. Visit `https://www.maclellanfamily.com/yearbooks`
3. Should see "test" folder appear
4. Click it - should see your image

---

## ✅ What Was Fixed

### Issue 1: 308 Redirect Error
- **Problem:** Webhook URL redirected from non-www to www
- **Fix:** Use www URL directly

### Issue 2: Images Not Appearing
- **Problem:** API only looked in "0 US/" folder, not "Apps/"
- **Fix:** Auto-detect folder structure from Firestore

### Issue 3: Wrong S3 Paths
- **Problem:** Hardcoded "0 US" prefix
- **Fix:** Dynamic prefix based on user's folderPath

---

## 📁 Folder Structure

Your code now supports **both** structures automatically:

### Standard (Full Dropbox):
```
Firestore folderPath: "kevin"
Dropbox path: /0 US/kevin/2025/photo.jpg
S3 path: 0 US/kevin/2025/photo.jpg
```

### App Folder (Scoped):
```
Firestore folderPath: "Apps/stone-development"
Dropbox path: /2025/photo.jpg (you see)
S3 path: Apps/stone-development/2025/photo.jpg (actual)
```

---

## 🔍 Troubleshooting

### Still getting 308 errors?
- Make sure you're using `https://www.maclellanfamily.com` (with www)
- Clear old webhook in Dropbox console first
- Wait 1 minute, then re-add

### Images not appearing?
1. Check Vercel logs for errors
2. Verify Firestore `users/{your-uid}` has:
   - `role: "admin"`
   - `folderPath: "kevin"` (or your folder)
3. Check S3 bucket - are files there?

### Wrong folder?
Update `folderPath` in Firestore:
- **For 0 US:** Use `"kevin"` (not `"/0 US/kevin"`)
- **For Apps:** Use `"Apps/stone-development"` or `"stone-development"`

---

## 📚 Full Documentation

- `FIX-SUMMARY.md` - Complete overview of all fixes
- `WEBHOOK-REDIRECT-FIX.md` - Detailed 308 error guide
- `TESTING-CHECKLIST.md` - Comprehensive testing guide
- `ARCHITECTURE-DIAGRAM.md` - Visual flow diagrams
- `PRODUCTION-WEBHOOK-SETUP.md` - Production setup guide

---

## 🚀 Deploy Changes

```bash
cd maclellanfamily.com
git add .
git commit -m "Fix webhook redirect and folder structure detection"
git push
```

Vercel will auto-deploy in ~2 minutes.

---

## ✨ What Happens Now

1. You upload image to Dropbox
2. Dropbox sends webhook to your site (within seconds)
3. Your site downloads, compresses (4 variants), uploads to S3
4. Image appears on `/yearbooks` page automatically
5. Users see fast, responsive images

**Total time:** 1-2 minutes from upload to visible

---

## 💡 Pro Tips

### Compression
Every image gets 4 versions:
- `photo.jpg` - Original (max 2000px, quality 80)
- `photo_w480.jpg` - Mobile (480px wide)
- `photo_w960.jpg` - Tablet (960px wide)
- `photo_w1600.jpg` - Desktop (1600px wide)

Saves ~90% bandwidth!

### Incremental Sync
Only changed files are processed (not all files every time).
Uses Dropbox cursor stored in Firestore.

### Security
- Webhook signature verified (HMAC-SHA256)
- Firebase auth required for API
- S3 presigned URLs (1 hour expiry)
- Private S3 bucket

---

## 🆘 Need Help?

1. Check Vercel logs: `vercel logs --follow`
2. Check S3 bucket: `aws s3 ls s3://your-bucket/0\ US/`
3. Check Firestore: Firebase Console → Firestore
4. Check webhook status: Dropbox App Console

---

**Ready to go! Update that webhook URL and you're live.** 🎉

