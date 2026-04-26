import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../../lib/firebase-admin';
import { clearGlobalDropboxSyncCursor, isDropboxFullScopeSync, syncDropboxToS3 } from '../../../lib/dropbox-sync';

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
    const forceFull = (() => {
      const { searchParams } = new URL(request.url);
      const v = searchParams.get('forceFull')?.toLowerCase();
      return v === '1' || v === 'true' || v === 'yes';
    })();

    if (isDropboxFullScopeSync()) {
      if (forceFull) {
        await clearGlobalDropboxSyncCursor();
        console.log('Manual sync: full-scope, forced full re-list (cursor cleared)');
      } else {
        console.log('Manual sync: full-scope (incremental if cursor exists; use ?forceFull=1 to re-list all files from Dropbox)');
      }
      await syncDropboxToS3({ fullScope: true, recursive: true });
    } else {
      const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
      const userFolderPath = userDoc.data()?.folderPath as string | undefined;
      if (!userFolderPath) {
        return NextResponse.json({ error: 'User folder path not configured' }, { status: 400 });
      }

      const cleanPath = userFolderPath.replace(/^\/+|\/+$/g, '');
      const pathPrefix = cleanPath.toLowerCase().startsWith('apps') ? 'Apps' : '0 US';
      console.log(`Manual sync using prefix: ${pathPrefix}, folderPath: ${userFolderPath}`);

      await syncDropboxToS3({ userFolderPath, pathPrefix, recursive: true, syncUserId: decoded.uid });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes('Unauthorized') ? 401 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}


