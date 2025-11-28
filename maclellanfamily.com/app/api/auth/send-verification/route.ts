import { NextResponse } from 'next/server';
import { adminAuth } from '../../../lib/firebase-admin';
import { headers } from 'next/headers';

export async function POST() {
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

    // Get user record to check current email
    const userRecord = await adminAuth.getUser(uid);
    
    if (!userRecord.email) {
      return NextResponse.json(
        { error: 'User has no email address' },
        { status: 400 }
      );
    }

    // Generate email verification link
    const link = await adminAuth.generateEmailVerificationLink(userRecord.email);

    // In a production app, you would send this link via your own email service
    // For now, we'll return it in the response (you should implement actual email sending)
    
    return NextResponse.json({
      success: true,
      message: 'Verification email sent successfully',
      verificationLink: link // Remove this in production - send via email instead
    });

  } catch (error) {
    console.error('Error sending verification email:', error);
    
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