# Multi-Person OAuth Workflow Guide

## 🤝 The Scenario

**You (Developer):**
- Have the Dropbox app credentials (Client ID, Client Secret)
- Created the app in Dropbox App Console
- Need to get a refresh token

**Them (Account Owner):**
- Own the Dropbox account with the photos
- Need to authorize YOUR app to access THEIR Dropbox
- Will send you the authorization code

---

## ✅ Yes, This is Totally Possible!

This is a **standard OAuth workflow**. Many apps work this way:
- Developer creates the app
- Users authorize the app
- App gets access to user's data

**In your case:**
- You created the Dropbox app
- The account owner authorizes it
- Your app gets access to their photos

---

## 📋 Step-by-Step Process

### Part 1: You (Developer) Prepare

1. **Run the Python script:**
   ```bash
   python get_dropbox_refresh_token.py
   ```

2. **Enter your credentials:**
   ```
   Enter your App Key (Client ID): YOUR_CLIENT_ID
   Enter your App Secret (Client Secret): YOUR_CLIENT_SECRET
   ```

3. **Copy the authorization URL** that the script generates:
   ```
   https://www.dropbox.com/oauth2/authorize?client_id=...&token_access_type=offline
   ```

4. **Send this URL to the account owner** via:
   - Email
   - Slack/Discord
   - Text message
   - Whatever works!

---

### Part 2: Them (Account Owner) Authorizes

**Instructions to send them:**

```
Hi! I need you to authorize my app to access your Dropbox account.

Please follow these steps:

1. Click this link: [PASTE_URL_HERE]

2. You'll be asked to log into your Dropbox account
   (if not already logged in)

3. You'll see a page saying:
   "MyApp would like to access files and folders in your Dropbox"

4. Click the "Allow" button

5. You'll be redirected to a page showing an authorization code

6. Send me the ENTIRE URL or just the "code" part

Example URL you'll see:
  http://localhost/?code=LONG_CODE_HERE

Just copy and send me the whole thing!
```

---

### Part 3: You Complete the Exchange

1. **Wait for them to send the code**
   - Script will be waiting at: `Enter the authorization code:`

2. **Paste the code** (or entire URL - script handles both)

3. **Script exchanges code for refresh token**
   - Uses YOUR credentials + THEIR code
   - Gets a refresh token for THEIR account

4. **Done!** 🎉
   - Token saved to files
   - Ready to use in your app

---

## 🔒 Security & Trust

### What They're Authorizing

When they click "Allow", they're giving YOUR app permission to:
- ✅ Read files in their Dropbox
- ✅ Access folders you specify (if using App Folder)
- ✅ Upload/download files

### What You Get

- Refresh token that lets your app access THEIR Dropbox
- Works until they revoke it
- Can be used by your app to sync their photos

### Trust Factor

**They need to trust YOU because:**
- You'll have access to their Dropbox files
- Your app can read/write their data
- They're giving you permission

**Best practices:**
- Only request the permissions you need
- Use App Folder (scoped access) if possible
- Be transparent about what your app does
- Give them a way to revoke access if needed

---

## 🎯 Why This Works

### OAuth Flow Explained

```
┌─────────────┐     1. Generate     ┌──────────────┐
│  Developer  │ ─────Auth URL────> │ Account Owner│
│    (You)    │                     │    (Them)    │
└─────────────┘                     └──────────────┘
       │                                    │
       │                             2. Click link
       │                             3. Login to THEIR account
       │                             4. Click "Allow"
       │                                    │
       │     5. Send auth code              │
       │ <─────────────────────────────────┘
       │
       │  6. Exchange code for token
       │     (using YOUR credentials
       │      + THEIR auth code)
       ▼
  ✅ Get refresh token
     for THEIR account
```

### Key Points

1. **Auth code is tied to THEIR account**
   - When they authorize, Dropbox knows it's their account
   - The code represents their consent

2. **YOUR credentials prove you're the app owner**
   - Client ID identifies your app
   - Client Secret proves you control the app

3. **Together = Access to their account**
   - Code + Credentials = Refresh Token
   - Token gives your app access to their Dropbox

---

## 💡 Common Questions

### Q: Can I use MY Dropbox account instead?

**A:** Yes! In that case:
- You are both the developer AND the account owner
- You click the link yourself
- You authorize your own app
- You get the token for your own account

### Q: Do they need the Client Secret?

**A:** No! They only need:
- ✅ The authorization URL
- ✅ Access to their Dropbox account

You keep the Client Secret private!

### Q: Can they revoke access later?

**A:** Yes! They can:
1. Go to Dropbox Settings → Security → Apps
2. Find your app
3. Click "Revoke"

Your refresh token will stop working.

### Q: Does the code expire?

**A:** Yes! Authorization codes expire quickly (usually 10 minutes).
- Get the code from them ASAP
- Use it right away
- If expired, they need to authorize again

### Q: Can I use the same code twice?

**A:** No! Each code works only once.
- One authorization = One code = One token
- Need a new token? They authorize again, new code

### Q: What if they're in a different country?

**A:** Totally fine! OAuth works worldwide.
- They authorize from anywhere
- You exchange the code from anywhere
- Geographic location doesn't matter

---

## 🧪 Test Scenario

Let's walk through a real example:

### Setup
- **You:** Developer in USA with Client ID/Secret
- **Them:** Account owner in Canada with photos

### Process

1. **You run:** `python get_dropbox_refresh_token.py`
2. **Script shows:** Auth URL
3. **You send them:** URL via email
4. **They open:** Link on their computer in Canada
5. **They login:** To their Dropbox account
6. **They authorize:** Click "Allow"
7. **They copy:** The authorization code
8. **They send you:** Code via email
9. **You paste:** Code into script
10. **Script exchanges:** Code + Your Credentials → Token
11. **Result:** You have a token for their Canadian Dropbox account!

---

## ⚠️ Troubleshooting

### "Invalid authorization code"

**Causes:**
- Code already used (only works once)
- Code expired (get new one)
- Extra spaces when copying (trim it)

**Fix:** Ask them to authorize again, get fresh code

### "Redirect URI mismatch"

**Cause:** Dropbox app settings issue

**Fix:**
1. Go to Dropbox App Console → Settings → OAuth 2
2. Add redirect URI: `http://localhost`
3. Try again

### "Invalid client credentials"

**Cause:** Wrong Client ID or Secret

**Fix:** Double-check credentials in Dropbox App Console

### "They don't see a code"

**Cause:** Redirect URI not set or different flow

**Fix:**
- Check their browser's address bar for `code=` parameter
- Or look for "Authorization Code" displayed on page
- They might need to copy from different location

---

## ✅ Success Checklist

After completing the flow, you should have:

- [x] Sent them the authorization URL
- [x] They logged into THEIR Dropbox
- [x] They clicked "Allow"
- [x] They sent you the authorization code
- [x] Script exchanged code for token
- [x] Files created:
  - `dropbox-tokens.json`
  - `dropbox-refresh-token.txt`
  - `dropbox-env-snippet.txt`
- [x] Token tested successfully
- [x] Updated `.env.local` with token
- [x] App can now access THEIR Dropbox!

---

## 🎉 Summary

**This multi-person OAuth workflow is:**
- ✅ **Standard practice** - How OAuth is meant to work
- ✅ **Secure** - They authorize on Dropbox's site
- ✅ **Flexible** - Works remotely, no physical access needed
- ✅ **Revocable** - They can revoke access anytime
- ✅ **Professional** - Used by millions of apps

**Perfect for your scenario where:**
- You maintain the app
- They own the photos
- You sync their Dropbox to your website
- Everyone wins! 🎊

