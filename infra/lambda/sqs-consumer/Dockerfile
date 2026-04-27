FROM node:22-slim AS builder

WORKDIR /build

# Install zip utility
RUN apt-get update && apt-get install -y zip && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies; `sharp` must be the linux-x64 glibc build for AWS Lambda, not
# a host-OS binary from a copied lockfile. Reinstall sharp explicitly for Lambda's runtime.
# @see https://sharp.pixelplumbing.com/install#cross-platform
RUN npm install --include=optional && \
    rm -rf node_modules/sharp && \
    npm install --os=linux --cpu=x64 sharp

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies to reduce package size
RUN npm prune --production

# Create the Lambda zip inside Docker (avoids Windows symlink issues)
RUN zip -r /lambda.zip dist node_modules -x "*.ts" -x "*.map"

