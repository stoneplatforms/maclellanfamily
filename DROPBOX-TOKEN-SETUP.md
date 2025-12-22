# Dropbox Refresh Token Setup

## 🎯 Quick Start

### Option 1: Python (Recommended - Run from IDE) ⭐

```bash
python get_dropbox_refresh_token.py
```

### Option 2: Node.js

```bash
node get-dropbox-refresh-token.js
```

**What it does:**
1. ✅ Guides you through Dropbox OAuth flow
2. ✅ Gets a refresh token (never expires!)
3. ✅ Saves tokens to files
4. ✅ Generates .env snippet
5. ✅ Tests the refresh token

**Perfect for multi-person workflow:**
- ✅ YOU have the app credentials
- ✅ ANOTHER PERSON owns the Dropbox account
- ✅ They click the auth link and send you the code
- ✅ You complete the token exchange

---

## 📋 Prerequisites

Before running the script, you need:

### 1. Dropbox App Credentials

Go to: https://www.dropbox.com/developers/apps

1. Click your app (e.g., "stone-development")
2. Go to **Settings** tab
3. Note your:
   - **App key** (Client ID)
   - **App secret** (Client Secret)

### 2. Redirect URI (Optional)

If your app doesn't have a redirect URI set:
1. In Dropbox App Settings → OAuth 2 → Redirect URIs
2. Add: `http://localhost` (for this script)
3. Click **Add**

---

## 🚀 Step-by-Step Usage

### Step 1: Run the Script

**Python (from IDE):**
```bash
python get_dropbox_refresh_token.py
```

**OR Node.js:**
```bash
node get-dropbox-refresh-token.js
```

### Step 2: Enter Credentials

```
Enter your App Key (Client ID): YOUR_CLIENT_ID
Enter your App Secret (Client Secret): YOUR_CLIENT_SECRET
```

### Step 3: Send URL to Dropbox Account Owner

The script will generate a URL like:
```
https://www.dropbox.com/oauth2/authorize?client_id=...&response_type=code&token_access_type=offline
```

**📧 SEND THIS URL to the person who owns the Dropbox account:**

1. **They open the URL** in their browser
2. **They log into THEIR Dropbox account** (if not already logged in)
3. **They click "Allow"** to authorize your app
4. They'll see a page with an authorization code like:
   ```
   http://localhost/?code=AUTHORIZATION_CODE
   ```
   OR
   ```
   https://www.dropbox.com/1/oauth2/display_token?oauth_token=CODE_HERE
   ```
5. **They send you the code** (the part after `code=` or the entire URL)

### Step 4: Enter Authorization Code They Send You

```
Enter the authorization code: PASTE_CODE_HERE
```

**Note:** The code only works once and expires quickly, so use it right away!

### Step 5: Get Your Tokens!

The script will:
- ✅ Exchange code for refresh token
- ✅ Save to `dropbox-tokens.json`
- ✅ Save refresh token to `dropbox-refresh-token.txt`
- ✅ Create `dropbox-env-snippet.txt` with env vars
- ✅ Test the refresh token

---

## 📁 Files Created

### 1. `dropbox-tokens.json`
Complete token information (JSON format):
```json
{
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "access_token": "YOUR_ACCESS_TOKEN",
  "expires_in": 14400,
  "token_type": "bearer",
  "account_id": "...",
  "client_id": "...",
  "client_secret": "...",
  "created_at": "2025-12-21T..."
}
```

### 2. `dropbox-refresh-token.txt`
Just the refresh token (plain text):
```
YOUR_REFRESH_TOKEN_HERE
```

### 3. `dropbox-env-snippet.txt`
Ready to copy to `.env.local`:
```bash
DROPBOX_CLIENT_ID=...
DROPBOX_CLIENT_SECRET=...
DROPBOX_REFRESH_TOKEN=...
```

---

## 🔧 Update Your App

### Option 1: Manual Copy

1. Open `maclellanfamily.com/.env.local`
2. Add or update these lines:
   ```bash
   DROPBOX_CLIENT_ID=your_client_id
   DROPBOX_CLIENT_SECRET=your_client_secret
   DROPBOX_REFRESH_TOKEN=your_refresh_token
   ```
3. **Remove or comment out** `DROPBOX_ACCESS_TOKEN` (it expires!)
4. **Restart dev server**: `npm run dev`

### Option 2: Copy from Snippet

```bash
# Copy the env snippet content
cat dropbox-env-snippet.txt

# Paste into maclellanfamily.com/.env.local
```

---

## ✅ Verify It Works

### Test 1: Check Terminal Logs

Start your dev server and check logs:
```bash
cd maclellanfamily.com
npm run dev
```

You should see:
```
Dropbox connection verified. Account: your@email.com
```

### Test 2: Upload Test Image

1. Upload an image to Dropbox
2. Check terminal - should see webhook triggered
3. Image should appear in yearbooks

### Test 3: Manual Test

Run the test at the end of the script:
```
Do you want to test the refresh token now? (y/n): y
```

Should show:
```
✅ Success! Refresh token works!
New access token: sl.u.ABC123...
Your refresh token is valid and ready to use! 🎉
```

---

## 🔄 Access Token vs Refresh Token

### Access Token ❌
- **Expires**: After ~4 hours
- **Use**: Temporary testing
- **Problem**: Need to regenerate constantly

### Refresh Token ✅
- **Expires**: Never! (until revoked)
- **Use**: Production
- **Benefit**: Auto-refreshes access tokens

**Your app automatically uses refresh tokens when:**
```typescript
// In dropbox-sync.ts
const dropbox = process.env.DROPBOX_ACCESS_TOKEN
  ? new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN })
  : new Dropbox({  // ← Uses this if no access token
      clientId: process.env.DROPBOX_CLIENT_ID,
      clientSecret: process.env.DROPBOX_CLIENT_SECRET,
      refreshToken: process.env.DROPBOX_REFRESH_TOKEN
    });
```

---

## 🛠️ Troubleshooting

### Issue: "Invalid authorization code"

**Cause**: Code expired or already used

**Fix**: 
1. Get a new authorization code (re-run Step 3)
2. Codes expire quickly - use within 1 minute

### Issue: "No refresh token in response"

**Cause**: Missing `token_access_type=offline` in auth URL

**Fix**:
1. The script adds this automatically
2. Make sure you used the URL from the script

### Issue: "Invalid client credentials"

**Cause**: Wrong Client ID or Secret

**Fix**:
1. Go to Dropbox App Console → Settings
2. Copy the **exact** App Key and Secret
3. Re-run the script

### Issue: "Redirect URI mismatch"

**Cause**: Dropbox redirect URI not configured

**Fix**:
1. Go to Dropbox App → Settings → OAuth 2 → Redirect URIs
2. Add: `http://localhost`
3. Click **Add**, then try again

---

## 🔒 Security

### Keep These Secret! 🤫

**Never commit these files:**
- ✅ Added to `.gitignore`:
  - `dropbox-tokens.json`
  - `dropbox-refresh-token.txt`
  - `dropbox-env-snippet.txt`
  - `accesstoken.txt`

**Never share:**
- Client Secret
- Refresh Token
- Access Token

**Safe to share:**
- Client ID (public)
- Account ID (public)

---

## 🔄 Regenerate Tokens

If you need new tokens:

1. **Revoke old token** (optional):
   - Go to Dropbox Account → Settings → Security → Apps
   - Find your app, click **Revoke**

2. **Run script again**:
   ```bash
   node get-dropbox-refresh-token.js
   ```

3. **Update .env.local** with new tokens

---

## 📚 Resources

- **Dropbox OAuth Guide**: https://www.dropbox.com/developers/reference/oauth-guide
- **App Console**: https://www.dropbox.com/developers/apps
- **API Explorer**: https://dropbox.github.io/dropbox-api-v2-explorer/

---

## ℹ️ How OAuth Works

```
1. User (you) clicks authorization URL
              ↓
2. Dropbox shows "Allow access?" page
              ↓
3. User clicks "Allow"
              ↓
4. Dropbox redirects to: http://localhost/?code=ABC123
              ↓
5. Script exchanges code for refresh token
              ↓
6. Refresh token saved (never expires!)
              ↓
7. App uses refresh token to get fresh access tokens
```

---

## 🎉 Success Checklist

After running the script, you should have:

- [x] `dropbox-tokens.json` created
- [x] `dropbox-refresh-token.txt` created
- [x] `dropbox-env-snippet.txt` created
- [x] Updated `maclellanfamily.com/.env.local`
- [x] Removed/commented `DROPBOX_ACCESS_TOKEN`
- [x] Restarted dev server
- [x] Tested webhook (upload image)
- [x] Images appear in yearbooks

**All done!** Your app now uses refresh tokens that never expire! 🚀

