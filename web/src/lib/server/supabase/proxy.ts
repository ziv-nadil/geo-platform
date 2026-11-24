import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/db.types';

/**
 * Session refresh helper for the app's `src/proxy.ts` (Next 16 renamed middleware to proxy).
 * The frontend owns src/proxy.ts. Suggested use (matcher must exclude static assets and
 * /api/stripe/webhook, security.md §4):
 *
 *   import { updateSession } from '@/lib/server/supabase/proxy';
 *   export async function proxy(request: NextRequest) { return (await updateSession(request)).response; }
 *
 * Uses getClaims() (JWT verified), never getSession(). Applies the cache headers Supabase passes
 * to setAll so a CDN never caches a response carrying a refreshed session.
 * When Supabase is not configured this is a pass-through.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; userId: string | null; aal: string | null }> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response, userId: null, aal: null };

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Do not run code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  const aal = (data?.claims as { aal?: string } | undefined)?.aal ?? null;
  return { response, userId: typeof sub === 'string' ? sub : null, aal };
}
