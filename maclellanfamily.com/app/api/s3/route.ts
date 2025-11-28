// /api/s3/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { adminAuth, adminDb } from '../../lib/firebase-admin';

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
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

export async function GET(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const decodedToken = await verifyAdminRole(authHeader);

    // Get user's folder path from Firestore
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userFolderPath = userData?.folderPath;

    if (!userFolderPath) {
      throw new Error('User folder path not configured');
    }

    // Clean and construct the S3 prefix
    const cleanUserPath = userFolderPath.startsWith('/') ? userFolderPath.slice(1) : userFolderPath;
    const prefix = `0 US/${cleanUserPath}/`;

    // List objects in the S3 bucket
    const command = new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET!,
      Prefix: prefix,
      Delimiter: '/'
    });

    const response = await s3Client.send(command);
    
    // Process folders (CommonPrefixes)
    const folders = response.CommonPrefixes?.map(prefix => {
      const name = prefix.Prefix!.split('/').slice(-2)[0];
      return {
        name,
        subFolders: []  // You can implement nested folders if needed
      };
    }).filter(folder => folder.name && folder.name !== '') || [];

    return NextResponse.json({ 
      folders 
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    console.error('S3 listing error:', error);
    
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
          { error: 'Failed to list S3 folders: ' + error.message },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch folders' },
      { status: 500 }
    );
  }
}