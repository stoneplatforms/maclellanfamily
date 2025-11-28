// /lib/firebase-admin.ts
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Function to properly format the private key
function getFormattedPrivateKey() {
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is missing');
  }

  // Remove any quotes and add actual newlines
  return privateKey
    .replace(/\\n/g, '\n')      // Replace literal \n with actual newlines
    .replace(/^"/, '')          // Remove leading quote if present
    .replace(/"$/, '')          // Remove trailing quote if present
    .trim();                    // Remove any extra whitespace
}

function initializeFirebaseAdmin() {
  if (!getApps().length) {
    try {
      const privateKey = getFormattedPrivateKey();
      console.log('Initializing Firebase Admin with project:', process.env.FIREBASE_PROJECT_ID);

      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey
        }),
      });

      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Firebase Admin initialization error:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }
}

// Initialize Firebase Admin when this module is imported
initializeFirebaseAdmin();

// Export the admin instances
export const adminAuth = getAuth();
export const adminDb = getFirestore();