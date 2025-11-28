## Next.js (Vercel) Environment Variables

```
# ==== AWS (S3) ====
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...REPLACE
AWS_SECRET_ACCESS_KEY=REPLACE
AWS_S3_BUCKET=your-s3-bucket-name

# Optional: offload heavy sync to AWS via SQS
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/your-queue

# ==== Dropbox API ====
DROPBOX_CLIENT_ID=REPLACE
DROPBOX_CLIENT_SECRET=REPLACE
# Use either ACCESS_TOKEN (short-lived, expires) OR REFRESH_TOKEN (long-lived, auto-refreshes)
DROPBOX_ACCESS_TOKEN=REPLACE  # Option 1: Direct access token (from App Console)
DROPBOX_REFRESH_TOKEN=REPLACE  # Option 2: Refresh token (better for production)

# ==== Firebase Admin (server-side) ====
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
# Use literal \n for newlines when setting in Vercel
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nREPLACE\n-----END PRIVATE KEY-----\n"

# ==== Firebase Web (client-side; NEXT_PUBLIC_* are exposed to browser) ====
NEXT_PUBLIC_FIREBASE_API_KEY=REPLACE
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=REPLACE
NEXT_PUBLIC_FIREBASE_APP_ID=REPLACE
# Optional
# NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# ==== Next.js / Misc ====
NODE_ENV=production
```

## Lambda (SQS Consumer) Environment Variables

```
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-s3-bucket-name

# Dropbox
DROPBOX_CLIENT_ID=REPLACE
DROPBOX_CLIENT_SECRET=REPLACE
DROPBOX_REFRESH_TOKEN=REPLACE

# MediaConvert
MEDIACONVERT_ENDPOINT=https://abcd.mediaconvert.us-east-1.amazonaws.com
MEDIACONVERT_ROLE_ARN=arn:aws:iam::123456789012:role/MediaConvertAccessRole

# (SQS event source mapping connects the queue to the Lambda, so no SQS env var is required here.)
```


