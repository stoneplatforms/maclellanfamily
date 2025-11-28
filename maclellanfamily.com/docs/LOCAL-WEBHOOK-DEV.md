# Local Webhook Development Guide

## Problem
Dropbox webhooks require a **publicly accessible URL**, but `localhost:3000` is only accessible on your machine.

## Solution: Use a Tunnel Service

### Option 1: ngrok (Recommended) ⭐

**ngrok** creates a secure tunnel from a public URL to your localhost.

#### Installation

**Windows (PowerShell):**
```powershell
# Using Chocolatey
choco install ngrok

# Or download from https://ngrok.com/download
```

**Mac:**
```bash
brew install ngrok
```

**Or download directly:**
- Visit https://ngrok.com/download
- Extract and add to PATH

#### Setup

1. **Sign up for free account** at https://ngrok.com (optional but recommended)

2. **Get your authtoken** (if you signed up):
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

3. **Start your Next.js dev server:**
   ```bash
   npm run dev
   ```
   Your app runs on `http://localhost:3000`

4. **In a new terminal, start ngrok:**
   ```bash
   ngrok http 3000
   ```

5. **Copy the HTTPS URL** ngrok gives you:
   ```
   Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
   ```

6. **Use this URL in Dropbox webhook settings:**
   ```
   https://abc123.ngrok-free.app/api/dropbox/webhook
   ```

#### Pro Tips

- **Free tier**: URLs change each time you restart ngrok
- **Paid tier**: Can get static domain (e.g., `yourname.ngrok.io`)
- **Inspect requests**: Visit `http://127.0.0.1:4040` to see all webhook requests

### Option 2: Cloudflare Tunnel (Free, Static URL)

1. Install Cloudflare Tunnel:
   ```bash
   # Windows
   winget install --id Cloudflare.cloudflared
   
   # Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   ```

2. Run tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

3. Use the provided URL in Dropbox webhook settings

### Option 3: localtunnel (No Installation)

```bash
# Install globally
npm install -g localtunnel

# Start tunnel
lt --port 3000

# Use the provided URL (e.g., https://random-name.loca.lt)
```

## Quick Start Script

Add this to your `package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:tunnel": "concurrently \"npm run dev\" \"ngrok http 3000\""
  }
}
```

Then install concurrently:
```bash
npm install --save-dev concurrently
```

Run both dev server and ngrok:
```bash
npm run dev:tunnel
```

## Testing the Webhook Locally

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Start ngrok** (in another terminal):
   ```bash
   ngrok http 3000
   ```

3. **Copy the ngrok HTTPS URL** (e.g., `https://abc123.ngrok-free.app`)

4. **Set webhook URL in Dropbox App Console:**
   - Go to https://www.dropbox.com/developers/apps
   - Select your app
   - Go to **Webhooks** section
   - Enter: `https://abc123.ngrok-free.app/api/dropbox/webhook`
   - Click **Save**

5. **Dropbox will verify** - you should see a GET request in your terminal/ngrok inspector

6. **Test by uploading a file** to your Dropbox folder

7. **Check your terminal** - you should see:
   ```
   Webhook received: 1 account(s) with changes
   ```

## Environment Variables for Local Dev

Create a `.env.local` file in `maclellanfamily.com/`:

```bash
# Dropbox
DROPBOX_CLIENT_ID=your_app_key
DROPBOX_CLIENT_SECRET=your_app_secret
DROPBOX_REFRESH_TOKEN=your_refresh_token

# AWS (for S3 uploads)
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=your-bucket-name

# Optional: SQS for async processing
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/your-queue

# Firebase (your existing config)
FIREBASE_PROJECT_ID=your-project-id
# ... etc
```

## Troubleshooting

### ngrok URL keeps changing?
- **Free tier**: URLs change on restart (expected)
- **Solution**: Update Dropbox webhook URL each time, or use paid ngrok for static domain

### Webhook not receiving requests?
1. Check ngrok is running: `http://127.0.0.1:4040`
2. Verify webhook URL in Dropbox console matches ngrok URL exactly
3. Check your dev server logs for errors
4. Verify `DROPBOX_CLIENT_SECRET` is set correctly

### Signature verification failing?
- Make sure `DROPBOX_CLIENT_SECRET` in `.env.local` matches your Dropbox app secret
- Check ngrok inspector (`http://127.0.0.1:4040`) to see the actual request

### Can't access ngrok URL?
- Make sure ngrok is running
- Check firewall isn't blocking ngrok
- Try restarting ngrok

## Alternative: Use Production Webhook for Testing

If setting up tunnels is too complex, you can:
1. Deploy to Vercel (free tier works)
2. Use production webhook URL for testing
3. Check Vercel logs to see webhook requests

But local development with ngrok is much faster for iteration!

