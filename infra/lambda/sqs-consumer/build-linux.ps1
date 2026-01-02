# Build Lambda package with Linux binaries using Docker
# Run this BEFORE terraform apply

$ErrorActionPreference = "Stop"

Write-Host "Building Lambda with Linux binaries via Docker..." -ForegroundColor Cyan

# Get the script's directory and compute terraform build path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$infraDir = Split-Path -Parent (Split-Path -Parent $scriptDir)
$terraformBuildDir = Join-Path $infraDir "terraform\build"

Write-Host "Script dir: $scriptDir" -ForegroundColor Gray
Write-Host "Terraform build dir: $terraformBuildDir" -ForegroundColor Gray

# Build the Docker image
docker build -t lambda-builder $scriptDir

# Create a container (don't run it)
$containerId = docker create lambda-builder
Write-Host "Container ID: $containerId" -ForegroundColor Gray

# Ensure terraform build directory exists
if (-not (Test-Path $terraformBuildDir)) {
    New-Item -ItemType Directory -Path $terraformBuildDir -Force | Out-Null
}

# Copy the pre-built zip from the container (avoids Windows symlink issues)
$zipPath = Join-Path $terraformBuildDir "maclellanfamily-sqs-consumer.zip"
Write-Host "Extracting Lambda zip to: $zipPath" -ForegroundColor Yellow
docker cp "${containerId}:/lambda.zip" $zipPath

# Verify the file was created
if (Test-Path $zipPath) {
    $size = (Get-Item $zipPath).Length / 1MB
    Write-Host "Build complete! Lambda zip created ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "ERROR: Zip file was not created!" -ForegroundColor Red
    exit 1
}

# Cleanup container
docker rm $containerId | Out-Null

Write-Host "You can now run 'terraform apply' from the terraform folder." -ForegroundColor Green
