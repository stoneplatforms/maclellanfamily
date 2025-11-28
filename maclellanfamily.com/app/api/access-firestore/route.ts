// route.ts
import { adminAuth, adminDb } from '../../lib/firebase-admin';

// Now you can use adminAuth and adminDb directly
// Example usage in your API route:
export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();
    
    // Verify the Firebase ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    // Access Firestore
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    
    return new Response(JSON.stringify({ 
      success: true,
      userData: userDoc.data()
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('API route error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Authentication failed' 
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}