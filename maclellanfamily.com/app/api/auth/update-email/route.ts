import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '../../../lib/firebase-admin';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
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

    // Get the request body
    const body = await request.json();
    const { newEmail } = body;

    if (!newEmail) {
      return NextResponse.json(
        { error: 'New email is required' },
        { status: 400 }
      );
    }

    // Verify the token and get user info
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Get current user record
    const currentUser = await adminAuth.getUser(uid);
    
    if (!currentUser.emailVerified) {
      return NextResponse.json(
        { error: 'Current email must be verified before changing email' },
        { status: 400 }
      );
    }

    // Check if new email is already in use
    try {
      await adminAuth.getUserByEmail(newEmail);
      return NextResponse.json(
        { error: 'Email address is already in use by another account' },
        { status: 400 }
      );
    } catch (error) {
      // Email is not in use, which is what we want
      if (error && typeof error === 'object' && 'code' in error && error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Update the user's email using Admin SDK
    await adminAuth.updateUser(uid, {
      email: newEmail,
      emailVerified: false // New email needs to be verified
    });

    // Generate verification link for the new email
    const verificationLink = await adminAuth.generateEmailVerificationLink(newEmail);

    return NextResponse.json({
      success: true,
      message: 'Email updated successfully. Please verify your new email address.',
      verificationLink: verificationLink // Remove this in production - send via email instead
    });

  } catch (error) {
    console.error('Error updating email:', error);
    
    if (error && typeof error === 'object' && 'code' in error) {
      switch (error.code) {
        case 'auth/email-already-exists':
          return NextResponse.json(
            { error: 'Email address is already in use by another account' },
            { status: 400 }
          );
        case 'auth/invalid-email':
          return NextResponse.json(
            { error: 'Invalid email address format' },
            { status: 400 }
          );
        default:
          return NextResponse.json(
            { error: (error as unknown as Error).message || 'Failed to update email' },
            { status: 500 }
          );
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 