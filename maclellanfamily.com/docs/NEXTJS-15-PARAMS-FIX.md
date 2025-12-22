# Next.js 15/16 Breaking Change: Async Params

## The Issue

In **Next.js 15+**, route parameters (`params`) are now **Promises** that must be awaited. This is a breaking change that causes routes to fail if not updated.

### Error You'll See:

```
Error: Route "/api/yearbooks/[year]" used `params.year`. 
`params` is a Promise and must be unwrapped with `await` or `React.use()` 
before accessing its properties.
```

### Symptom:
- Page stuck on "Loading contents..." or "Loading..."
- API returns 400 Bad Request
- Console shows params error

---

## The Fix

### ❌ Old Code (Next.js 13/14):

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { year: string } }
) {
  const { year } = params;  // ❌ This no longer works in Next.js 15+
  // ...
}
```

### ✅ New Code (Next.js 15+):

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  const { year } = await params;  // ✅ Must await params!
  // ...
}
```

---

## Files Fixed

### 1. `/api/yearbooks/[year]/route.ts`

**Fixed:** Changed params type to `Promise<{ year: string }>` and added `await`

**Before:**
```typescript
{ params }: { params: { year: string } }
const { year } = params;
```

**After:**
```typescript
{ params }: { params: Promise<{ year: string }> }
const { year } = await params;
```

### 2. `/api/yearbooks/[year]/[time]/route.ts`

**Already correct** - This route was already using the async params pattern:
```typescript
context: { params: { year: Promise<string>; time: Promise<string> } }
const year = await context.params.year;
const time = await context.params.time;
```

---

## How to Check Other Routes

If you have other dynamic routes, check if they need updating:

### Search for Dynamic Routes:

```bash
# Find all route files with dynamic params
find app/api -name "route.ts" | xargs grep -l "\[.*\]"
```

### Look for This Pattern:

```typescript
// ❌ Needs fixing
{ params }: { params: { id: string } }

// ✅ Already correct
{ params }: { params: Promise<{ id: string }> }
```

---

## Why This Change?

Next.js made this change to:
1. **Enable streaming** - Params can be resolved asynchronously
2. **Better performance** - Routes can start processing before params are fully resolved
3. **Consistency** - Aligns with React Server Components async patterns

From the [Next.js docs](https://nextjs.org/docs/messages/sync-dynamic-apis):

> In Next.js 15, `params`, `searchParams`, and route segment config options 
> are now Promises. You must await them before accessing their values.

---

## Testing After Fix

### 1. Clear Next.js Cache

```bash
rm -rf .next
npm run dev
```

### 2. Test the Route

Visit: `http://localhost:3000/yearbooks/2017`

**Expected:**
- ✅ Page loads successfully
- ✅ Shows "Table of Contents" with folders
- ✅ No errors in console

**Before fix:**
- ❌ Stuck on "Loading contents..."
- ❌ Console error about params Promise
- ❌ API returns 400 error

### 3. Check API Response

Open DevTools → Network tab:
1. Click on `/api/yearbooks/2017` request
2. Should show **200 OK** status (not 400)
3. Response should contain `folders` array

---

## Other Next.js 15+ Changes to Watch For

### 1. `searchParams` is Also a Promise

```typescript
// ❌ Old
export default function Page({ searchParams }) {
  const page = searchParams.page;
}

// ✅ New
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const page = params.page;
}
```

### 2. `cookies()` and `headers()` Require Async

```typescript
// ❌ Old
import { cookies } from 'next/headers';
const cookieStore = cookies();

// ✅ New
import { cookies } from 'next/headers';
const cookieStore = await cookies();
```

### 3. Layout Params Also Async

```typescript
// ❌ Old
export default function Layout({ params, children }) {
  const { slug } = params;
}

// ✅ New
export default async function Layout({ params, children }) {
  const { slug } = await params;
}
```

---

## Migration Checklist

When upgrading to Next.js 15+:

- [ ] Update all dynamic route handlers to await `params`
- [ ] Update page components to await `searchParams`
- [ ] Update middleware to await `headers()` and `cookies()`
- [ ] Clear `.next` folder after changes
- [ ] Test all dynamic routes
- [ ] Check for console errors about Promises

---

## Related Issues

### Issue: Page Stuck Loading

**Cause:** API route not awaiting params, returns 400 error

**Fix:** Add `await params` to route handler

### Issue: "params is undefined"

**Cause:** Accessing params synchronously in Next.js 15+

**Fix:** Make function async and await params

### Issue: TypeScript Errors

**Cause:** TypeScript expects params to be synchronous object

**Fix:** Update type to `Promise<{ ... }>`

---

## Quick Reference

### API Route Pattern (Next.js 15+)

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Await params first
  const { id } = await params;
  
  // Then use the id
  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }
  
  // Rest of your logic...
}
```

### Page Pattern (Next.js 15+)

```typescript
export default async function Page({ 
  params,
  searchParams 
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Await both
  const { slug } = await params;
  const query = await searchParams;
  
  // Use them
  return <div>Slug: {slug}</div>;
}
```

---

## Summary

✅ **Fixed:** `/api/yearbooks/[year]/route.ts` now awaits params
✅ **Already OK:** `/api/yearbooks/[year]/[time]/route.ts` was already correct
✅ **Result:** Yearbook year pages now load properly

**Key Takeaway:** In Next.js 15+, always `await params` before using them!

---

## Further Reading

- [Next.js 15 Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading/version-15)
- [Async Request APIs](https://nextjs.org/docs/messages/sync-dynamic-apis)
- [Migration Codemod](https://nextjs.org/docs/app/building-your-application/upgrading/codemods)

