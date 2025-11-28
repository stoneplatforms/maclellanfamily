import { NextRequest, NextResponse } from 'next/server';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { adminAuth, adminDb } from '../../../lib/firebase-admin';
import { DocumentSnapshot } from 'firebase-admin/firestore';

interface S3Item {
  type: 'folder' | 'file';
  path: string;
  name: string;
}

interface S3FileInfo {
  name: string;
  path: string;
  lastModified?: Date;
  size?: number;
}

interface BaseFolder {
  name: string;
  path: string;
}

interface RegularFolder extends BaseFolder {
  type: 'folder';
}

interface OtherFolder extends BaseFolder {
  type: 'other';
  itemCount: number;
}

type FolderItem = RegularFolder | OtherFolder;

// Initialize S3 Client with proper configuration
const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  },
  endpoint: `https://s3.${process.env.AWS_S3_REGION || 'us-east-1'}.amazonaws.com`,
  forcePathStyle: false
});

// Verify token with error handling
const verifyAuthToken = async (token: string) => {
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const tokenAge = Date.now() / 1000 - decodedToken.auth_time;
    
    if (tokenAge > 3600) {
      throw new Error('TOKEN_EXPIRED');
    }
    
    return decodedToken;
  } catch (error) {
    throw error;
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: { year: string } }
) {
  try {
    const { year } = params;

    if (!year) {
      return NextResponse.json(
        { 
          error: 'Bad Request',
          message: 'Year parameter is required'
        },
        { status: 400 }
      );
    }

    // Check auth header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          message: 'No authorization token provided'
        },
        { status: 401 }
      );
    }

    // Verify token
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await verifyAuthToken(token);
    } catch (error) {
      if (error instanceof Error && error.message === 'TOKEN_EXPIRED') {
        return NextResponse.json(
          {
            error: 'Token Expired',
            message: 'Please refresh your session',
            code: 'TOKEN_EXPIRED'
          },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        {
          error: 'Authentication Failed',
          message: error instanceof Error ? error.message : 'Auth verification failed',
          code: 'AUTH_ERROR'
        },
        { status: 401 }
      );
    }

    // Get user data
    const userId = decodedToken.uid;
    let userDoc: DocumentSnapshot;
    try {
      userDoc = await adminDb.collection('users').doc(userId).get();
    } catch (error) {
      throw error;
    }

    if (!userDoc.exists) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'User configuration not found'
        },
        { status: 404 }
      );
    }

    const folderPath = userDoc.data()?.folderPath;
    if (!folderPath) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'User folder path not configured'
        },
        { status: 404 }
      );
    }

    // List S3 contents
    const cleanPath = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath;
    const yearPrefix = `0 US/${cleanPath}/${year}/`;

    const command = new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET!,
      Prefix: yearPrefix,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);
    
    // Process folders and files
    const items: S3Item[] = [];
    
    // Process folders
    response.CommonPrefixes?.forEach(prefix => {
      if (!prefix.Prefix) return;
      const folderName = prefix.Prefix
        .replace(yearPrefix, '')
        .replace('/', '');
      
      if (!folderName || folderName === year) return;
      
      items.push({
        type: 'folder',
        path: prefix.Prefix,
        name: folderName
      });
    });

    // Process files
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const imageFiles: S3FileInfo[] = [];

    response.Contents?.forEach(item => {
      if (!item.Key) return;
      const fileName = item.Key.replace(yearPrefix, '');
      
      // Skip files inside folders
      if (fileName.includes('/')) return;
      
      // Check if it's an image
      const isImage = imageExtensions.some(ext => 
        fileName.toLowerCase().endsWith(ext)
      );
      
      if (isImage) {
        imageFiles.push({
          name: fileName,
          path: item.Key,
          lastModified: item.LastModified,
          size: item.Size
        });
      }
    });

    // Structure the response
    const folders: FolderItem[] = items
      .filter(item => item.type === 'folder')
      .map(item => ({
        name: item.name,
        path: item.path,
        type: 'folder' as const
      }));

    // Add "Other" category if there are images
    if (imageFiles.length > 0) {
      folders.push({
        name: 'other',
        path: yearPrefix,
        type: 'other' as const,
        itemCount: imageFiles.length
      });
    }

    return NextResponse.json(
      { 
        folders,
        otherFiles: imageFiles
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'ETag': `"${Date.now()}"`,
          'Vary': 'Authorization'
        }
      }
    );

  } catch (error) {
    console.error('Route handler error:', error);
    
    if (error instanceof Error && 
        (error.message.includes('DECODER') || 
         error.message.includes('metadata from plugin'))) {
      return NextResponse.json(
        {
          error: 'Service Error',
          message: 'Temporary service disruption. Please try again.',
          code: 'PLUGIN_ERROR'
        },
        { 
          status: 503,
          headers: {
            'Retry-After': '1'
          }
        }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}