provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  project       = var.project
  lambda_name   = "${var.project}-sqs-consumer"
  queue_name    = "${var.project}-dropbox-sync"
  bucket_name   = var.bucket_name
}

resource "aws_sqs_queue" "sync_dlq" {
  name                      = "${local.queue_name}-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "sync" {
  name                       = local.queue_name
  visibility_timeout_seconds = 900  # 15 minutes (must be >= Lambda timeout)
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20   # Long polling for efficiency
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.sync_dlq.arn
    maxReceiveCount     = 3 # Retry 3 times before moving to DLQ
  })
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "../lambda/sqs-consumer/dist"
  output_path = "./build/${local.lambda_name}.zip"
}

resource "aws_iam_role" "lambda_exec" {
  name = "${local.lambda_name}-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "basic_exec" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "access_policy" {
  name   = "${local.lambda_name}-access"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect : "Allow",
        Action : ["s3:PutObject", "s3:AbortMultipartUpload", "s3:CreateMultipartUpload", "s3:UploadPart", "s3:CompleteMultipartUpload"],
        Resource : ["arn:aws:s3:::${local.bucket_name}/*"]
      },
      {
        Effect : "Allow",
        Action : ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"],
        Resource : [aws_sqs_queue.sync.arn, aws_sqs_queue.sync_dlq.arn]
      },
      {
        Effect : "Allow",
        Action : ["mediaconvert:CreateJob"],
        Resource : "*"
      },
      {
        Effect : "Allow",
        Action : ["iam:PassRole"],
        Resource : var.mediaconvert_role_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_access" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.access_policy.arn
}

resource "aws_lambda_function" "consumer" {
  function_name = local.lambda_name
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs18.x"
  handler       = "index.handler"
  filename      = data.archive_file.lambda_zip.output_path
  
  # Performance Configuration for Multi-GB Files
  timeout       = 900      # 15 minutes max per execution
  memory_size   = 3008     # 3GB RAM (more memory = more CPU = faster processing)
  
  # Ephemeral Storage for Large Files
  # Default is 512MB, increase for multi-GB file processing
  ephemeral_storage {
    size = 10240  # 10GB temp storage for processing large files
  }
  
  # Reserved Concurrency (optional - prevents Lambda from consuming all account concurrency)
  # Uncomment to limit concurrent executions:
  # reserved_concurrent_executions = 10

  environment {
    variables = {
      AWS_REGION              = var.aws_region
      AWS_S3_BUCKET           = local.bucket_name
      DROPBOX_CLIENT_ID       = var.dropbox_client_id
      DROPBOX_CLIENT_SECRET   = var.dropbox_client_secret
      DROPBOX_REFRESH_TOKEN   = var.dropbox_refresh_token
      MEDIACONVERT_ENDPOINT   = var.mediaconvert_endpoint
      MEDIACONVERT_ROLE_ARN   = var.mediaconvert_role_arn
      NODE_OPTIONS            = "--max-old-space-size=2560" # Allow Node to use more heap
    }
  }
}

resource "aws_lambda_event_source_mapping" "sqs" {
  event_source_arn = aws_sqs_queue.sync.arn
  function_name    = aws_lambda_function.consumer.arn
  
  # Batch Processing Configuration
  batch_size                         = 10   # Process up to 10 images per Lambda invocation
  maximum_batching_window_in_seconds = 5    # Wait up to 5 seconds to accumulate batch
  
  # Partial Batch Responses (allows successful items to be deleted even if some fail)
  function_response_types = ["ReportBatchItemFailures"]
  
  # Scaling Configuration
  scaling_config {
    maximum_concurrency = 100  # Max 100 concurrent Lambda executions
  }
  
  enabled = true
}

output "sqs_queue_url" {
  value       = aws_sqs_queue.sync.id
  description = "Main SQS queue URL for image/video processing"
}

output "sqs_dlq_url" {
  value       = aws_sqs_queue.sync_dlq.id
  description = "Dead Letter Queue URL for failed messages (check here if images aren't processing)"
}

output "lambda_function_name" {
  value       = aws_lambda_function.consumer.function_name
  description = "Lambda function name for monitoring logs"
}

output "lambda_log_group" {
  value       = "/aws/lambda/${aws_lambda_function.consumer.function_name}"
  description = "CloudWatch log group for Lambda execution logs"
}


