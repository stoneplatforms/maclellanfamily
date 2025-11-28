# Dropbox Webhook Setup Guide

## How Dropbox Webhooks Work

**Yes! Dropbox DOES have webhooks** that automatically notify your site when files are uploaded.

### The Complete Flow

```
1. User uploads image to Dropbox
   ↓
2. Dropbox detects the change
   ↓
3. Dropbox sends POST request to your webhook URL
   POST https://yoursite.com/api/dropbox/webhook
   Headers: X-Dropbox-Signature: <HMAC signature>
   Body: { list_folder: { accounts: ["account_id_123"] } }
   ↓
4. Your site verifies the signature (security check)
   ↓
5. Your site calls Dropbox API to get actual file changes
   ↓
6. Changed files are queued to SQS
   ↓
7. Lambda downloads from Dropbox → Compresses → Uploads to S3
   ↓
8. Website fetches from S3 via presigned URLs
```

## Setting Up Dropbox Webhooks

### Step 1: Create Dropbox App

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click "Create app"
3. Choose:
   - **API**: Scoped access
   - **Type**: Full Dropbox
   - **Name**: Your app name
4. Note your **App Key** (CLIENT_ID) and **App Secret** (CLIENT_SECRET)

### Step 2: Configure Webhook URL

1. In your Dropbox app settings, go to **Webhooks** section
2. Enter your webhook URL:
   ```
   https://yoursite.com/api/dropbox/webhook
   ```
3. Dropbox will send a GET request with `?challenge=...` parameter
4. Your endpoint responds with the challenge value (already implemented ✅)
5. Dropbox verifies and activates the webhook

### Step 3: Set Environment Variables

Make sure these are set in your Next.js environment:

```bash
DROPBOX_CLIENT_ID=your_app_key
DROPBOX_CLIENT_SECRET=your_app_secret  # Used for webhook signature verification
DROPBOX_REFRESH_TOKEN=your_refresh_token
```

### Step 4: Test the Webhook

1. Upload a file to your Dropbox folder
2. Check your server logs - you should see:
   ```
   Webhook received: 1 account(s) with changes
   ```
3. File should appear in S3 within a few seconds/minutes

## Security: Webhook Signature Verification

**Important:** Your webhook endpoint now verifies that requests are actually from Dropbox.

- Dropbox sends `X-Dropbox-Signature` header
- We compute HMAC-SHA256 of request body using `DROPBOX_CLIENT_SECRET`
- If signatures don't match → Request is rejected (401 Unauthorized)

This prevents malicious actors from sending fake webhook requests.

## How It's More Efficient

### Before (Manual Sync):
- You had to manually trigger sync
- Or run scheduled syncs (wasteful)
- Scanned ALL files every time

### After (Webhook-Based):
- ✅ **Automatic**: Triggers immediately when file uploaded
- ✅ **Efficient**: Only processes changed files
- ✅ **Real-time**: Images appear on site within minutes
- ✅ **Scalable**: Uses SQS + Lambda (no server needed)

## Troubleshooting

### Webhook not receiving requests?
1. Check webhook URL is publicly accessible (not localhost)
2. Verify webhook is enabled in Dropbox App Console
3. Check server logs for errors

### Files not appearing in S3?
1. Check SQS queue is configured (`SQS_QUEUE_URL` env var)
2. Check Lambda function logs in AWS CloudWatch
3. Verify `DROPBOX_REFRESH_TOKEN` is valid

### Signature verification failing?
1. Ensure `DROPBOX_CLIENT_SECRET` matches your app secret
2. Check webhook URL matches exactly what's in Dropbox console
3. Verify request is actually from Dropbox (check IP/logs)

## Manual Sync (Fallback)

If webhook fails, you can still trigger manual sync:

```bash
POST /api/dropbox/sync
Authorization: Bearer <firebase_token>
```

This does a full sync (less efficient but reliable).

