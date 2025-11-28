// Server-side Firebase Client SDK helper
// This initializes Firebase Client SDK for use in API routes
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const;

// Initialize Firebase for server-side use
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

const existingApps = getApps();
if (existingApps.length > 0) {
  app = existingApps[0];
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

// Verify ID token using Firebase REST API (since we can't use client SDK verifyIdToken server-side)
export async function verifyIdToken(idToken: string): Promise<{ uid: string; email?: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Firebase API key not configured');
  }

  const response = await fetch(
    `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Invalid token');
  }

  const data = await response.json();
  if (!data.users || data.users.length === 0) {
    throw new Error('User not found');
  }

  const user = data.users[0];
  return {
    uid: user.localId,
    email: user.email,
  };
}

// Get user document from Firestore
export async function getUserDoc(userId: string) {
  const userDocRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userDocRef);
  
  if (!userDoc.exists()) {
    throw new Error('User document not found');
  }

  return userDoc;
}

export { auth, db };

