# Yearbook Routes Fix - Folder Structure Detection

## Issue

When navigating to `/yearbooks/2017` (or any year), the page was throwing an error:

```
Error: Year parameter is required
```

Despite the year parameter being correctly passed in the URL.

## Root Cause

The yearbook detail routes were **hardcoded** to only use the `0 US/` folder structure:

```typescript
// ❌ OLD CODE (hardcoded)
const yearPrefix = `0 US/${cleanPath}/${year}/`;
```

This caused issues for:
1. Users with **App Folder** structure (`Apps/...`)
2. The API couldn't find folders because it was looking in the wrong S3 path

## Files Fixed

### 1. `/api/yearbooks/[year]/route.ts`
Lists folders within a specific year (e.g., `/yearbooks/2017` shows folders like "christmas", "summer", etc.)

**Before:**
```typescript
const yearPrefix = `0 US/${cleanPath}/${year}/`;
```

**After:**
```typescript
const s3Prefix = getS3Prefix(folderPath);
const yearPrefix = `${s3Prefix}${year}/`;
```

### 2. `/api/yearbooks/[year]/[time]/route.ts`
Lists images within a specific folder (e.g., `/yearbooks/2017/christmas`)

**Before:**
```typescript
const prefix = time === 'other' 
  ? `0 US/${cleanPath}/${year}/`
  : `0 US/${cleanPath}/${year}/${time}/`;
```

**After:**
```typescript
const s3Prefix = getS3Prefix(folderPath);
const prefix = time === 'other' 
  ? `${s3Prefix}${year}/`
  : `${s3Prefix}${year}/${time}/`;
```

## How It Works Now

The `getS3Prefix()` helper function automatically detects the folder structure:

```typescript
function getS3Prefix(folderPath: string): string {
  const cleanPath = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath;
  
  if (cleanPath.toLowerCase().startsWith('apps')) {
    // App Folder structure
    const appFolderName = cleanPath.replace(/^apps\/?/i, '');
    return `Apps/${appFolderName}/`;
  } else {
    // Standard structure
    return `0 US/${cleanPath}/`;
  }
}
```

### Examples

#### Standard Structure (0 US)
```
Firestore folderPath: "kevin"
S3 prefix: "0 US/kevin/"
Year URL: /yearbooks/2017
S3 path: 0 US/kevin/2017/
```

#### App Folder Structure (Apps)
```
Firestore folderPath: "Apps/stone-development"
S3 prefix: "Apps/stone-development/"
Year URL: /yearbooks/2017
S3 path: Apps/stone-development/2017/
```

## All Fixed Routes

Now **all** yearbook API routes support dynamic folder detection:

- ✅ `/api/yearbooks` - List all year folders
- ✅ `/api/yearbooks/[year]` - List folders within a year
- ✅ `/api/yearbooks/[year]/[time]` - List images in a folder
- ✅ `/api/s3` - S3 folder listing (admin)
- ✅ `/api/dropbox/sync` - Manual sync

## Testing

### Test 1: List Years
```bash
GET /api/yearbooks
Authorization: Bearer {token}

# Should return folders like: ["2017", "2018", "2019"]
```

### Test 2: List Folders in Year
```bash
GET /api/yearbooks/2017
Authorization: Bearer {token}

# Should return folders like:
# [
#   { name: "christmas", type: "folder" },
#   { name: "summer", type: "folder" },
#   { name: "other", type: "other", itemCount: 5 }
# ]
```

### Test 3: List Images in Folder
```bash
GET /api/yearbooks/2017/christmas
Authorization: Bearer {token}

# Should return presigned URLs for all images in that folder
```

## Browser Testing

1. Navigate to: `https://localhost:3000/yearbooks`
2. Click on any year (e.g., "2017")
3. Should see "Table of Contents" with folders
4. Click on any folder
5. Should see images in gallery

**No more "Year parameter is required" errors!** ✅

## Related Issues Fixed

This fix completes the folder structure detection across the entire app:

- 🔧 **Issue 1**: Webhook 308 redirect → Fixed (use www URL)
- 🔧 **Issue 2**: Main yearbooks page not showing folders → Fixed (dynamic prefix)
- 🔧 **Issue 3**: Year detail page throwing "Year parameter required" → **Fixed (this issue)**

## Summary

All yearbook routes now:
- ✅ Auto-detect folder structure (Apps vs 0 US)
- ✅ Work with both Dropbox app types (Full Access and App Folder)
- ✅ Use consistent `getS3Prefix()` helper function
- ✅ No hardcoded path assumptions

**The yearbooks feature should now work end-to-end!** 🎉

