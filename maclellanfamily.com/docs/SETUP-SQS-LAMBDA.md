# Quick Setup: SQS + Lambda for Large Files

## 🎯 Why Set This Up?

**Current Problem:**
- Vercel Pro has 60-second timeout
- Large images (50MB+) fail to process
- Batch uploads can overwhelm the serverless function
- You see `RequestTimeout` errors

**Solution:**
- AWS Lambda (no timeout limits, 15 minutes max per file)
- AWS SQS (queue management, handles batches)
- Parallel processing (100+ concurrent executions)
- Handles multi-GB files easily

---

## Prerequisites

- [x] AWS Account
- [x] Terraform installed (`brew install terraform` or download from terraform.io)
- [x] AWS CLI configured (`aws configure`)
- [x] Dropbox refresh token (from earlier setup)

---

## Step-by-Step Setup

### 1. Build Lambda Package

```bash
cd infra/lambda/sqs-consumer
npm install
npm run build
```

**Expected output:**
```
> build
> tsc

# Creates dist/index.js
```

### 2. Configure Terraform Variables

Create `infra/terraform/terraform.tfvars`:

```hcl
project                = "maclellanfamily"
aws_region             = "us-east-1"  # Or your preferred region
bucket_name            = "your-s3-bucket-name"
dropbox_client_id      = "your-dropbox-client-id"
dropbox_client_secret  = "your-dropbox-client-secret"
dropbox_refresh_token  = "your-dropbox-refresh-token"

# Optional: If you need video processing
mediaconvert_endpoint  = "https://your-mediaconvert-endpoint.amazonaws.com"
mediaconvert_role_arn  = "arn:aws:iam::123456789:role/your-mediaconvert-role"
```

**Find your values:**
- `bucket_name`: From your S3 console or `.env.local` (`AWS_S3_BUCKET`)
- `dropbox_client_id`: From `.env.local` (`DROPBOX_CLIENT_ID`)
- `dropbox_client_secret`: From `.env.local` (`DROPBOX_CLIENT_SECRET`)
- `dropbox_refresh_token`: From your `dropbox-tokens.json` or `.env.local`

### 3. Deploy Infrastructure

```bash
cd infra/terraform

# Initialize Terraform
terraform init

# Review what will be created
terraform plan

# Deploy (type 'yes' when prompted)
terraform apply
```

**What gets created:**
- ✅ SQS Queue (main)
- ✅ SQS Queue (dead letter queue for failures)
- ✅ Lambda Function (3GB RAM, 10GB storage, 15min timeout)
- ✅ IAM Role & Policies
- ✅ Event Source Mapping (SQS → Lambda)

**Expected output:**
```
Apply complete! Resources: 8 added, 0 changed, 0 destroyed.

Outputs:
lambda_function_name = "maclellanfamily-sqs-consumer"
lambda_log_group = "/aws/lambda/maclellanfamily-sqs-consumer"
sqs_dlq_url = "https://sqs.us-east-1.amazonaws.com/123456789/maclellanfamily-dropbox-sync-dlq"
sqs_queue_url = "https://sqs.us-east-1.amazonaws.com/123456789/maclellanfamily-dropbox-sync"
```

### 4. Update Next.js Environment

Copy the `sqs_queue_url` from Terraform output and add to `maclellanfamily.com/.env.local`:

```bash
# Add this line (replace with YOUR queue URL)
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/maclellanfamily-dropbox-sync
```

### 5. Restart Next.js Dev Server

```bash
# Stop current dev server (Ctrl+C)
# Start again
npm run dev
```

### 6. Deploy to Production

```bash
# Push changes to Git
git add .
git commit -m "Add SQS+Lambda for large file processing"
git push

# Or deploy directly
vercel --prod
```

**IMPORTANT:** Make sure to set `SQS_QUEUE_URL` in Vercel environment variables too!

```bash
# Via Vercel CLI
vercel env add SQS_QUEUE_URL
# Paste your queue URL when prompted

# Or via Vercel Dashboard:
# Settings → Environment Variables → Add
```

---

## Testing

### Test 1: Upload Single Image

1. Upload a test image to Dropbox (any size)
2. Check SQS queue depth:
   ```bash
   aws sqs get-queue-attributes \
     --queue-url https://sqs.us-east-1.amazonaws.com/123456789/maclellanfamily-dropbox-sync \
     --attribute-names ApproximateNumberOfMessages
   ```
   Should show `"ApproximateNumberOfMessages": "1"` then quickly drop to `"0"`

3. Check Lambda logs:
   ```bash
   aws logs tail /aws/lambda/maclellanfamily-sqs-consumer --follow
   ```
   
   **Expected logs:**
   ```
   📦 Processing 1 SQS messages
   🔄 Processing image: 0 US/kevin/test/photo.jpg
   ⏬ Downloading from Dropbox: ...
   📦 Downloaded: 8.5MB in 2341ms
   📐 Original: 4032x3024, format: jpeg
   🗜️ Compressed: 2.1MB (24.7% of original) in 4523ms
   ✅ Processed: 0 US/kevin/test/photo.jpg → 0 US/kevin/test/photo.jpg in 6912ms
   ✅ Success: 1, ❌ Failed: 0
   ```

4. Check S3:
   ```bash
   aws s3 ls s3://your-bucket/0\ US/kevin/test/
   ```
   Should see `photo.jpg`

5. Check website:
   - Visit `/yearbooks/test`
   - Image should appear

### Test 2: Upload Large Image (50MB+)

1. Upload a large image (50-100MB) to Dropbox
2. Watch Lambda logs (no timeout!)
3. Verify image appears on website

### Test 3: Batch Upload (10+ images)

1. Upload 10-20 images at once to Dropbox
2. Check SQS queue depth (should spike then drop)
3. Check Lambda concurrency in AWS Console:
   - Lambda → Functions → maclellanfamily-sqs-consumer → Monitoring
   - Should see multiple concurrent executions
4. All images should appear on website within 1-2 minutes

---

## Monitoring

### Check Queue Depth (Current Upload Progress)

```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/maclellanfamily-dropbox-sync \
  --attribute-names All
```

**Key metrics:**
- `ApproximateNumberOfMessages`: Files waiting to be processed
- `ApproximateNumberOfMessagesNotVisible`: Files currently being processed
- `ApproximateAgeOfOldestMessage`: How long oldest message has been waiting

### Check Dead Letter Queue (Failed Files)

```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/maclellanfamily-dropbox-sync-dlq \
  --attribute-names ApproximateNumberOfMessages
```

**If > 0:** Files failed after 3 retries. Check Lambda logs for errors.

### View Lambda Logs

```bash
# Real-time logs
aws logs tail /aws/lambda/maclellanfamily-sqs-consumer --follow

# Last 1 hour of logs
aws logs tail /aws/lambda/maclellanfamily-sqs-consumer --since 1h

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/maclellanfamily-sqs-consumer \
  --filter-pattern "ERROR"
```

### CloudWatch Dashboard

**AWS Console:**
1. Go to CloudWatch
2. Create Dashboard
3. Add widgets:
   - Lambda Invocations
   - Lambda Errors
   - Lambda Duration
   - SQS NumberOfMessagesSent
   - SQS ApproximateNumberOfMessagesVisible

---

## Troubleshooting

### Issue: "SQS_QUEUE_URL is not defined"

**Fix:** Add `SQS_QUEUE_URL` to `.env.local` and restart `npm run dev`

### Issue: Images still timing out

**Check:**
1. Is `SQS_QUEUE_URL` set? (Check logs: "📨 Queueing to SQS")
2. Is Lambda deployed? (`terraform apply` successful?)
3. Is Lambda healthy? (Check CloudWatch logs)
4. Is SQS → Lambda mapping active? (Check AWS Console)

### Issue: Messages in DLQ

**Cause:** Files failed 3 times

**Debug:**
1. Check Lambda logs for specific error
2. Common causes:
   - Dropbox token expired (refresh token)
   - S3 permissions denied (check IAM policy)
   - File format unsupported (convert before upload)
   - Out of memory (increase Lambda memory in Terraform)

**Reprocess DLQ:**
```bash
# Get message from DLQ
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/.../maclellanfamily-dropbox-sync-dlq

# If issue is fixed, move back to main queue
aws sqs send-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/.../maclellanfamily-dropbox-sync \
  --message-body '{"dropboxId":"...","path":"...","type":"image","userFolderPath":"...","s3Key":"..."}'
```

### Issue: Lambda out of memory

**Fix:** Increase Lambda memory in `infra/terraform/main.tf`:

```hcl
resource "aws_lambda_function" "consumer" {
  # Change from 3008 to 10240 (10GB max)
  memory_size = 10240
}
```

Then: `terraform apply`

### Issue: Still getting timeouts with SQS

**Check:** Make sure you're NOT using the fallback direct processing

**In logs, look for:**
- ✅ Good: `📨 Queueing to SQS: ...`
- ❌ Bad: `⚠️ Processing directly (no SQS) - may timeout on large files`

**If seeing "Processing directly":**
1. Verify `SQS_QUEUE_URL` is set in environment
2. Restart Next.js (`npm run dev`)
3. Check logs again

---

## Cost Estimate

**For your use case (family photo uploads):**

| Scenario | Lambda Cost | SQS Cost | S3 Cost | **Total** |
|----------|-------------|----------|---------|-----------|
| 100 images/month | $0.15 | Free | $0.01 | **$0.16/month** |
| 1,000 images/month | $1.50 | Free | $0.13 | **$1.63/month** |
| 10,000 images/month | $15.00 | $0.01 | $1.30 | **$16.31/month** |

**Very affordable!** And no more timeouts.

---

## Updating Lambda Code

If you need to update the Lambda function:

```bash
# 1. Make changes to infra/lambda/sqs-consumer/src/index.ts
# 2. Rebuild
cd infra/lambda/sqs-consumer
npm run build

# 3. Redeploy
cd ../terraform
terraform apply
```

Terraform detects code changes and automatically updates Lambda!

---

## Cleanup (If Needed)

To remove all AWS resources:

```bash
cd infra/terraform
terraform destroy
```

**WARNING:** This deletes:
- SQS queues (and any queued messages)
- Lambda function
- IAM roles

It does NOT delete:
- S3 bucket (safe)
- Images in S3 (safe)

---

## Summary

**You now have:**

✅ AWS Lambda for processing images (no timeout limits)
✅ SQS for queue management (handles batches)
✅ Automatic retries (3 attempts)
✅ Dead letter queue (for failed files)
✅ Parallel processing (up to 100 concurrent)
✅ Multi-GB file support (10GB storage, 3GB RAM)

**Next time you upload:**
- Webhook → Queue to SQS (< 1s)
- Lambda processes async (no timeout)
- Images appear on website (within seconds)

**No more timeouts! 🚀**

---

## Further Reading

- **[LARGE-FILE-PROCESSING.md](LARGE-FILE-PROCESSING.md)** - Deep dive into architecture
- **[Terraform AWS Lambda Docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function)**
- **[AWS SQS Best Practices](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-best-practices.html)**

