# MaclellanFamily.com

Family photo gallery with automatic Dropbox → S3 sync.

## 📁 Project Structure

```
maclellanfamily/
├── maclellanfamily.com/          # Next.js web application
│   ├── app/                       # Next.js App Router
│   ├── docs/                      # Documentation
│   └── .env.local                 # Environment variables (create this!)
├── infra/                         # Infrastructure (Terraform, Lambda)
│   ├── lambda/                    # SQS consumer (optional)
│   └── terraform/                 # AWS infrastructure
├── get_dropbox_refresh_token.py  # 🔑 Token setup (Python) ⭐
├── get-dropbox-refresh-token.js  # 🔑 Token setup (Node.js)
└── DROPBOX-TOKEN-SETUP.md        # 📚 Token setup guide
```

## 🚀 Quick Start

### 1. Get Dropbox Refresh Token

**Run the token setup script:**

**Python (Recommended - Run from IDE):**
```bash
python get_dropbox_refresh_token.py
```

**OR Node.js:**
```bash
node get-dropbox-refresh-token.js
```

**Multi-Person Workflow:**
- ✅ YOU have the app credentials (Client ID, Secret)
- ✅ ANOTHER PERSON owns the Dropbox account
- ✅ They click the auth link you generate
- ✅ They send you the authorization code
- ✅ You complete the token exchange

Follow the prompts to get your refresh token. See [DROPBOX-TOKEN-SETUP.md](DROPBOX-TOKEN-SETUP.md) for detailed instructions.

### 2. Setup Next.js App

```bash
cd maclellanfamily.com
npm install
```

Create `.env.local` (copy from token script output):
```bash
DROPBOX_CLIENT_ID=your_client_id
DROPBOX_CLIENT_SECRET=your_client_secret
DROPBOX_REFRESH_TOKEN=your_refresh_token

AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=your_bucket_name
AWS_S3_REGION=us-east-2

# Firebase credentials...
```

### 3. Run Development Server

```bash
npm run dev
```

Visit: http://localhost:3000

## 📚 Documentation

- **[DROPBOX-TOKEN-SETUP.md](DROPBOX-TOKEN-SETUP.md)** - 🔑 Get Dropbox refresh token
- **[MULTI-PERSON-OAUTH-GUIDE.md](MULTI-PERSON-OAUTH-GUIDE.md)** - 🤝 Multi-person OAuth workflow
- **[maclellanfamily.com/README.md](maclellanfamily.com/README.md)** - 📖 Complete app documentation

## 🔧 Tools & Scripts

### `get_dropbox_refresh_token.py` ⭐ (Python)
Interactive script to get Dropbox refresh token (never expires!)

```bash
python get_dropbox_refresh_token.py
```

**Perfect for multi-person workflow:**
- Run from your IDE (F5 in VS Code/Cursor)
- Send auth link to Dropbox account owner
- They authorize and send you the code
- You complete the token exchange

### `get-dropbox-refresh-token.js` (Node.js Alternative)
```bash
node get-dropbox-refresh-token.js
```

**Both scripts output:**
- `dropbox-tokens.json` - All token info
- `dropbox-refresh-token.txt` - Just the refresh token
- `dropbox-env-snippet.txt` - Ready to paste in .env.local

## 🏗️ Architecture

**Flow:**
```
Dropbox upload
    ↓ (webhook)
Next.js API
    ↓ (process)
Compress image (4K, 85% quality)
    ↓ (upload)
S3 Bucket
    ↓ (display)
Next.js Frontend
```

See [maclellanfamily.com/docs/](maclellanfamily.com/docs/) for detailed architecture docs.

## 🎯 Features

- ✅ Dropbox → S3 automatic sync
- ✅ HEIC/PNG → JPG conversion
- ✅ 4K image compression (85% quality)
- ✅ Webhook-based (real-time)
- ✅ Firebase authentication
- ✅ Beautiful yearbook UI
- ✅ Responsive gallery

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Storage**: AWS S3
- **Auth**: Firebase Auth + Firestore
- **Integration**: Dropbox API (OAuth 2.0)
- **Image Processing**: Sharp
- **Deployment**: Vercel

## 📝 License

Private family project.