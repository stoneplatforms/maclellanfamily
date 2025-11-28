import { NextResponse } from 'next/server';
import { adminAuth } from '../../../lib/firebase-admin';
import { headers } from 'next/headers';

export async function GET() {
  try {
    // Get the authorization header
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    // Verify the token and get user info
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Get user record to check verification status
    const userRecord = await adminAuth.getUser(uid);
    
    return NextResponse.json({
      success: true,
      emailVerified: userRecord.emailVerified,
      email: userRecord.email
    });

  } catch (error) {
    console.error('Error checking verification status:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 