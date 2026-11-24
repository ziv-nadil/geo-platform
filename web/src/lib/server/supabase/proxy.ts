import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/db.types';

/**
 * Session refresh helper for the app's `src/proxy.ts` (Next 16 renamed middleware to proxy).
 * The frontend owns src/proxy.ts; it can do:
 *
 *   import { updateSession } from '@/lib/server/supabase/proxy';
 *   export async function proxy(request: NextRequest) { return (await updateSession(request)).response; }
 *
 * When Supabase is not configured this is a no-op pass-through.
 */
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { response, userId: null };

  const supabase = createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() validates the JWT signature (asymmetric keys) / falls back to getUser().
  // Do not run code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return { response, userId: typeof sub === 'string' ? sub : null };
}
