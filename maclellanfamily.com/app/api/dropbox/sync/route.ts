import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../../lib/firebase-admin';
import { syncDropboxToS3 } from '../../../lib/dropbox-sync';

async function verifyAdminRole(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header');
  }
  const token = authHeader.split('Bearer ')[1];
  const decodedToken = await adminAuth.verifyIdToken(token);
  const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required');
  }
  return decodedToken;
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyAdminRole(request.headers.get('authorization'));
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const userFolderPath = userDoc.data()?.folderPath as string | undefined;
    if (!userFolderPath) {
      return NextResponse.json({ error: 'User folder path not configured' }, { status: 400 });
    }

    // Persist userFolderPath for webhook-triggered syncs
    await adminDb.collection('integrations').doc('dropbox').set({ userFolderPath }, { merge: true });

    await syncDropboxToS3({ userFolderPath, pathPrefix: '0 US', recursive: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes('Unauthorized') ? 401 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}


