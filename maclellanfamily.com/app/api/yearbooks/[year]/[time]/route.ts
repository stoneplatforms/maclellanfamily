import { NextRequest, NextResponse } from 'next/server';
import { ListObjectsV2Command, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

interface ImageResponse {
  key: string;
  url: string;
  lastModified?: string;
}

// Initialize Firebase Admin with retry logic
const initializeFirebaseAdmin = () => {
  if (getApps().length) return;
  
  try {
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
};

// Ensure Firebase Admin is initialized
initializeFirebaseAdmin();

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
    const decodedToken = await getAuth().verifyIdToken(token);
    const tokenAge = Date.now() / 1000 - decodedToken.auth_time;
    
    if (tokenAge > 3600) {
      throw new Error('TOKEN_EXPIRED');
    }
    
    return decodedToken;
  } catch (error) {
    if (error instanceof Error && error.message === 'TOKEN_EXPIRED') {
      throw error;
    }
    
    if (error instanceof Error && error.message.includes('app/no-app')) {
      initializeFirebaseAdmin();
      return await getAuth().verifyIdToken(token);
    }
    
    throw error;
  }
};

export async function GET(
  request: NextRequest,
  context: { params: { year: Promise<string>; time: Promise<string> } }
) {
  const year = await context.params.year;
  const time = await context.params.time;
  
  if (!year || !time) {
    return NextResponse.json(
      { 
        error: 'Bad Request',
        message: 'Year and time parameters are required'
      },
      { status: 400 }
    );
  }

  try {
    // Check authorization header
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
          message: error instanceof Error ? error.message : 'Auth verification failed'
        },
        { status: 401 }
      );
    }

    // Get user data
    const db = getFirestore();
    let userDoc;
    try {
      userDoc = await db.collection('users').doc(decodedToken.uid).get();
    } catch (error) {
      if (error instanceof Error && error.message.includes('app/no-app')) {
        initializeFirebaseAdmin();
        userDoc = await db.collection('users').doc(decodedToken.uid).get();
      } else {
        throw error;
      }
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

    // Construct the S3 path
    const cleanPath = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath;
    const prefix = time === 'other' 
      ? `0 US/${cleanPath}/${year}/`
      : `0 US/${cleanPath}/${year}/${time}/`;

    // List objects in the folder
    const command = new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET!,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);

    // Generate signed URLs for each image
    const images = await Promise.all(
      (response.Contents || [])
        .filter(item => {
          if (!item.Key) return false;
          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(item.Key);
          if (time === 'other') {
            const itemPath = item.Key.replace(prefix, '');
            return isImage && !itemPath.includes('/');
          }
          return isImage;
        })
        .map(async (item): Promise<ImageResponse> => {
          const getObjectCommand = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: item.Key,
          });

          const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
            expiresIn: 3600,
          });

          return {
            key: item.Key!,
            url: signedUrl,
            lastModified: item.LastModified?.toISOString(),
          };
        })
    );

    // Return sorted images with cache control headers
    return NextResponse.json(
      {
        images: images.sort((a, b) => 
          (new Date(b.lastModified || 0).getTime()) - 
          (new Date(a.lastModified || 0).getTime())
        )
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