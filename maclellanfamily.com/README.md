This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Docs

Internal docs and plans live in `docs/`.

### 🚨 Quick Start (Webhook Fix)
- **[QUICK-START.md](docs/QUICK-START.md)** - 2-minute fix for webhook 308 error

### 📚 Setup & Configuration
- **[PRODUCTION-WEBHOOK-SETUP.md](docs/PRODUCTION-WEBHOOK-SETUP.md)** - Production webhook setup
- **[DROPBOX-WEBHOOK-SETUP.md](docs/DROPBOX-WEBHOOK-SETUP.md)** - General webhook guide
- **[ENV-EXAMPLES.md](docs/ENV-EXAMPLES.md)** - Environment variables
- **[GET-DROPBOX-REFRESH-TOKEN.md](docs/GET-DROPBOX-REFRESH-TOKEN.md)** - Get refresh token

### 🔧 Troubleshooting
- **[WEBHOOK-REDIRECT-FIX.md](docs/WEBHOOK-REDIRECT-FIX.md)** - Fix 308 redirect error
- **[YEARBOOK-ROUTES-FIX.md](docs/YEARBOOK-ROUTES-FIX.md)** - Fix "Year parameter required" error
- **[NEXTJS-15-PARAMS-FIX.md](docs/NEXTJS-15-PARAMS-FIX.md)** - Fix Next.js 15+ async params issue
- **[RESET-FIREBASE-AUTH.md](docs/RESET-FIREBASE-AUTH.md)** - Reset Firebase authentication
- **[FIX-SUMMARY.md](docs/FIX-SUMMARY.md)** - Complete fix overview
- **[TESTING-CHECKLIST.md](docs/TESTING-CHECKLIST.md)** - End-to-end testing

### 🏗️ Architecture
- **[ARCHITECTURE-DIAGRAM.md](docs/ARCHITECTURE-DIAGRAM.md)** - Visual flow diagrams
- **[IMAGE-COMPRESSION.md](docs/IMAGE-COMPRESSION.md)** - Image compression system (single optimized JPG)
- **[DROPBOX-DELETIONS.md](docs/DROPBOX-DELETIONS.md)** - Automatic deletion sync (Dropbox → S3)
- **[LARGE-FILE-PROCESSING.md](docs/LARGE-FILE-PROCESSING.md)** - Multi-GB files & batch processing (Lambda + SQS)
- **[CDN-and-Compression-Plan.md](docs/CDN-and-Compression-Plan.md)** - Performance optimization

### 🧪 Development
- **[LOCAL-WEBHOOK-DEV.md](docs/LOCAL-WEBHOOK-DEV.md)** - Test webhooks locally with ngrok

## Features

### Automatic Image Sync
- Upload images to Dropbox → Automatically compressed and synced to S3
- **Delete images in Dropbox → Automatically deleted from S3** 🗑️
- **Handles multi-GB files and batch uploads** 🚀
- Webhook-based (real-time, no polling)
- Single optimized JPG (max 4K, 85% quality, progressive, mozjpeg)
- HEIC/PNG → JPG conversion
- Supports both "0 US" and "Apps" folder structures
- **Lambda + SQS architecture:** No timeout limits, parallel processing

### Yearbooks Gallery
- Beautiful scrapbook-style UI
- Organized by folders (years, events, etc.)
- Responsive images with automatic size selection
- Secure access with Firebase authentication

### Image Compression
- Single optimized JPG per image
- Max resolution: 3840px (4K)
- Quality: 85% (excellent, progressive JPEG)
- HEIC/PNG/WebP → JPG conversion
- ~85% file size reduction
- Immutable caching (1 year)