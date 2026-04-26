# Terraform: SQS + Lambda (Dropbox Sync) + MediaConvert

## Prereqs
- S3 bucket already created (e.g. `www.maclellanfamily.com` in `us-east-1`)
- MediaConvert IAM role (trust `mediaconvert.amazonaws.com`, S3 access to that bucket) + API endpoint from MediaConvert console
- Node 18+, Docker (to build a Linux `sharp` binary for Lambda)
- Terraform >= 1.5, `aws login` or `aws configure`

## Build Lambda zip (macOS / Linux, from repo root)

The zip must be `infra/terraform/build/maclellanfamily-sqs-consumer.zip` before `apply`.

```bash
cd infra/lambda/sqs-consumer
docker build -t lambda-sqs-builder .
container_id=$(docker create lambda-sqs-builder)
mkdir -p ../../terraform/build
docker cp "$container_id:/lambda.zip" ../../terraform/build/maclellanfamily-sqs-consumer.zip
docker rm "$container_id"
```

(Windows: use `build-linux.ps1` instead.)

## Configure
Copy `terraform.tfvars.example` to `terraform.tfvars` and set Dropbox + MediaConvert values (see file comments).

## Deploy

```bash
cd infra/terraform
terraform init
terraform apply
```

Outputs will include `sqs_queue_url`. Set that as `SQS_QUEUE_URL` in Vercel env, with `AWS_S3_REGION=us-east-1` and `AWS_S3_BUCKET=www.maclellanfamily.com`.

## Notes
- Ensure `MediaConvertAccessRole` allows read/write on your bucket and is trusted by `mediaconvert.amazonaws.com`.
- Rebuild and re-apply when Lambda code changes.

