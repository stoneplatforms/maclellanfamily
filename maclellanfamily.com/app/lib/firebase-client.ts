// /lib/firebase-client.ts
import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const;

// Singleton pattern - ensure Firebase only initializes once
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let persistenceSet = false;

// Check if Firebase is already initialized (from previous import)
const existingApps = getApps();
if (existingApps.length > 0) {
  // Firebase already initialized - reuse existing instance
  app = existingApps[0];
  auth = getAuth(app);
  db = getFirestore(app);
  console.log('Firebase: Reusing existing app instance');
} else {
  // Initialize Firebase for the first time (synchronously)
  console.log('Firebase: Initializing Firebase app (first time)...');
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Set persistence (only once, asynchronously - doesn't block)
  if (!persistenceSet) {
    persistenceSet = true;
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        console.log('Firebase: Persistence set to LOCAL');
      })
      .catch((error) => {
        console.error('Firebase: Error setting persistence:', error);
        persistenceSet = false; // Allow retry on error
      });
  }
  
  console.log('Firebase: Initialized successfully');
}

// Export the initialized instances
export { auth, db, onAuthStateChanged };

// Export types
export type { Auth, Firestore };