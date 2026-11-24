import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db.types';
import { ENV, readEnv } from '../env';

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Per-request Supabase client acting as the signed-in user (RLS applies).
 * Returns null when Supabase env vars are missing so callers can answer `not_configured`.
 * Create a new client for every request; never share one across requests.
 */
export async function createSupabaseServerClient(): Promise<TypedSupabaseClient | null> {
  const env = readEnv(ENV.supabasePublic);
  if (!env.ok) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.values.NEXT_PUBLIC_SUPABASE_URL,
    env.values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Cache headers passed by Supabase are applied by the proxy (updateSession).
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component: cookies are read-only there. The proxy refreshes sessions.
          }
        },
      },
    },
  );
}
