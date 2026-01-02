FROM node:18-slim AS builder

WORKDIR /build

# Install zip utility
RUN apt-get update && apt-get install -y zip && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ALL dependencies including sharp for Linux
# Use node:18-slim (Debian/glibc) to match AWS Lambda runtime
RUN npm install --include=optional

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies to reduce package size
RUN npm prune --production

# Create the Lambda zip inside Docker (avoids Windows symlink issues)
RUN zip -r /lambda.zip dist node_modules -x "*.ts" -x "*.map"

