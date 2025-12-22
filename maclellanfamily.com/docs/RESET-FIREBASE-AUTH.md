# Reset Firebase Authentication

## Quick Reset Methods

### Method 1: Browser DevTools (Fastest)

1. Open browser DevTools (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Expand **Local Storage**
4. Click on `http://localhost:3000` (or your domain)
5. Find keys starting with `firebase:` and delete them
6. Refresh the page - you'll be logged out

### Method 2: Logout Button

If you're logged in and able to access the NavBar:
1. Click the **Logout** button in the navigation
2. You'll be redirected to the login page
3. Log back in with your credentials

### Method 3: Clear All Site Data

**Chrome:**
1. Open DevTools (F12)
2. Go to **Application** tab
3. In the left sidebar, find **Storage**
4. Click **Clear site data** button
5. Refresh the page

**Firefox:**
1. Open DevTools (F12)
2. Go to **Storage** tab
3. Right-click on the domain
4. Select **Delete All**
5. Refresh the page

### Method 4: Programmatic Logout (Terminal)

Open browser console (F12 → Console tab) and run:

```javascript
// Force logout and clear Firebase auth
auth.signOut().then(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = '/';
});
```

---

## When to Reset Firebase Auth

### 1. Token Expired Errors
If you see errors like:
- "Token expired"
- "Invalid token"
- "Authentication failed"

**Solution:** Logout and login again to get fresh token

### 2. Stuck Loading States
If a page is stuck loading:
1. Check browser console for errors
2. If you see Firebase auth errors, reset auth
3. Refresh the page

### 3. 401 Unauthorized Errors
If API calls return 401:
- Your token might be expired
- Logout and login again
- Firebase tokens expire after 1 hour

### 4. After Changing Firebase Config
If you've updated Firebase credentials in `.env.local`:
1. Stop dev server
2. Clear browser cache/localStorage
3. Restart dev server
4. Login again

---

## Prevent Token Expiration Issues

### Auto-Refresh Token

The app already includes auto-refresh logic, but if you're experiencing issues, you can manually refresh:

```typescript
// In browser console
const user = auth.currentUser;
if (user) {
  user.getIdToken(true).then(token => {
    console.log('Refreshed token:', token);
  });
}
```

### Check Current Auth State

```javascript
// In browser console
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('Logged in as:', user.email);
    user.getIdToken().then(token => {
      console.log('Current token:', token);
    });
  } else {
    console.log('Not logged in');
  }
});
```

---

## Troubleshooting

### Issue: "Firebase app already initialized"

**Cause:** Multiple Firebase initializations (usually during hot reload in development)

**Solution:**
1. Refresh the page (Ctrl+R or Cmd+R)
2. If persists, hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. If still persists, restart dev server

### Issue: "No user found" after login

**Cause:** User document not created in Firestore

**Solution:**
1. Check Firestore console: `users/{your-uid}`
2. Ensure document exists with:
   ```json
   {
     "email": "your@email.com",
     "role": "admin",
     "folderPath": "kevin"  // or your folder
   }
   ```
3. If missing, create it manually in Firebase Console

### Issue: "Folder path not configured"

**Cause:** User document missing `folderPath` field

**Solution:**
1. Go to Firebase Console → Firestore
2. Find your user document: `users/{your-uid}`
3. Add field: `folderPath` = `"kevin"` (or your folder name)
4. Logout and login again

---

## Development Tips

### Hot Reload Issues

If you experience Firebase issues after code changes:
1. **Stop dev server** (Ctrl+C)
2. **Clear `.next` folder:** `rm -rf .next` (or delete manually)
3. **Restart:** `npm run dev`
4. **Hard refresh browser:** Ctrl+Shift+R

### Firebase Persistence

Firebase auth is persisted in `localStorage` by default:

```typescript
// Current setting in firebase-client.ts
await setPersistence(auth, browserLocalPersistence);
```

This means:
- ✅ Auth survives page refresh
- ✅ Auth survives browser restart
- ❌ Need to manually logout to clear

---

## Quick Commands

### Clear Everything and Start Fresh

```bash
# Terminal
npm run dev  # Stop with Ctrl+C first
rm -rf .next
npm run dev

# Browser Console
localStorage.clear();
sessionStorage.clear();
window.location.href = '/';
```

### Force Fresh Token

```javascript
// Browser Console
auth.currentUser.getIdToken(true).then(token => {
  console.log('Fresh token obtained');
  window.location.reload();
});
```

---

## API Token Debugging

### Check Token in API Request

Open DevTools → Network tab:
1. Filter by "XHR" or "Fetch"
2. Click on any `/api/` request
3. Go to **Headers** tab
4. Look for `Authorization: Bearer ...`
5. Copy token and decode at [jwt.io](https://jwt.io)

### Token Contains:
- `uid`: User ID
- `email`: User email
- `auth_time`: When token was issued
- `exp`: When token expires (usually 1 hour)

If `exp` (expiration) is in the past, you need a fresh token.

---

## Summary

**Quick reset:** Logout → Login
**Deep reset:** Clear localStorage → Refresh → Login
**Nuclear option:** Clear `.next` → Restart server → Clear browser data → Login

**Remember:** Tokens expire after 1 hour. If you're getting auth errors, just logout and login again!

