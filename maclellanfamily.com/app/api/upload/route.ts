import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Dropbox, DropboxResponseError } from 'dropbox';
import sharp from 'sharp';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../lib/firebase-admin';
import fetch from 'cross-fetch';

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const dropbox = new Dropbox({
  clientId: process.env.DROPBOX_CLIENT_ID!,
  clientSecret: process.env.DROPBOX_CLIENT_SECRET!,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN!,
  fetch: fetch
});

async function verifyAdminRole(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header');
  }

  const token = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    if (userData?.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }

    return decodedToken;
  } catch (error) {
    console.error('Auth verification failed:', error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    // Check authorization
    const authHeader = req.headers.get('authorization');
    const decodedToken = await verifyAdminRole(authHeader);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const folderPath = formData.get('folderPath') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Get user's folder path from Firestore
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userFolderPath = userData?.folderPath;

    if (!userFolderPath) {
      throw new Error('User folder path not configured');
    }

    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Compress image using sharp
    const compressedBuffer = await sharp(buffer)
      .resize(1200, 1200, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Clean and construct the complete paths
    const cleanUserPath = userFolderPath.startsWith('/') ? userFolderPath.slice(1) : userFolderPath;
    const cleanSelectedPath = folderPath.replace(/^\/+|\/+$/g, '');
    
    const s3Key = `0 US/${cleanUserPath}/${cleanSelectedPath}/${file.name}`;
    const dropboxPath = `/0 US/${cleanUserPath}/${cleanSelectedPath}/${file.name}`;
    
    console.log('Uploading to paths:', {
      s3: s3Key,
      dropbox: dropboxPath
    });

    // Upload compressed image to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: s3Key,
      Body: compressedBuffer,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable'
    }));

    // Create Dropbox folders if they don't exist
    try {
      const dropboxFolderPath = `/0 US/${cleanUserPath}/${cleanSelectedPath}`;
      await dropbox.filesCreateFolderV2({
        path: dropboxFolderPath,
        autorename: false
      });
    } catch (error) {
      // Ignore error if folder already exists
      if (error instanceof DropboxResponseError && error.status === 409) {
        // Folder already exists, continue
      } else {
        throw error;
      }
    }

    // Upload original image to Dropbox
    await dropbox.filesUpload({
      path: dropboxPath,
      contents: buffer,
      mode: { '.tag': 'overwrite' },
    });

    return NextResponse.json({
      message: 'File uploaded successfully',
      s3Path: s3Key,
      dropboxPath
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    if (error instanceof Error) {
      // Handle auth errors
      if (error.message.includes('Unauthorized') || error.message.includes('auth')) {
        return NextResponse.json(
          { error: error.message },
          { status: 401 }
        );
      }

      // Handle folder path errors
      if (error.message.includes('folder path not configured')) {
        return NextResponse.json(
          { error: 'User folder path not configured' },
          { status: 400 }
        );
      }

      // Handle S3 errors
      if (error.message.includes('S3') || error.message.includes('AWS')) {
        return NextResponse.json(
          { error: 'Failed to upload to S3: ' + error.message },
          { status: 500 }
        );
      }

      // Handle Dropbox errors
      if (error instanceof DropboxResponseError) {
        return NextResponse.json(
          { error: 'Dropbox error: ' + error.message },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Error uploading file' },
      { status: 500 }
    );
  }
}