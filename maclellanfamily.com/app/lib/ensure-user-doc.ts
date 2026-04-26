import { adminDb } from './firebase-admin';
import type { DocumentSnapshot } from 'firebase-admin/firestore';

/**
 * `users` collection shape (see Firestore / Settings):
 * - uid, email, name, role, folderPath (strings)
 * - dropboxSyncCursor (string, set by Dropbox sync when present)
 */
function defaultName(email?: string, displayName?: string | null): string {
  if (displayName?.trim()) return displayName.trim();
  if (email?.includes('@')) {
    const local = email.split('@')[0] ?? 'user';
    return local || 'user';
  }
  return 'user';
}

/** Dropbox/S3 subfolder under `0 US/` (single segment, no leading slash) */
function defaultFolderPath(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'user';
}

export type TokenUser = {
  uid: string;
  email?: string;
  displayName?: string | null;
};

/**
 * Create `users/{uid}` if missing, or merge missing/empty string fields to match
 * the family app schema. Does not clear non-empty `dropboxSyncCursor`.
 */
export async function ensureUserDocument(token: TokenUser): Promise<DocumentSnapshot> {
  const ref = adminDb.collection('users').doc(token.uid);
  const snap = await ref.get();
  const name = defaultName(token.email, token.displayName ?? null);
  const folder = defaultFolderPath(name);

  if (!snap.exists) {
    await ref.set({
      uid: token.uid,
      email: token.email ?? '',
      name,
      role: 'user',
      folderPath: folder,
    });
    return ref.get();
  }

  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const patch: Record<string, string> = {};

  const need = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

  if (need(d.uid) && token.uid) patch.uid = token.uid;
  if (need(d.email) && token.email) patch.email = token.email;
  if (need(d.name)) patch.name = name;
  if (need(d.role)) patch.role = 'user';
  if (need(d.folderPath)) patch.folderPath = folder;

  if (Object.keys(patch).length > 0) {
    await ref.set(patch, { merge: true });
  }

  return ref.get();
}
