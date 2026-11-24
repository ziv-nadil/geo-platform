import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db.types';
import { ENV, readEnv } from '../env';

/**
 * Service-role client. BYPASSES RLS. Use only in route handlers / workers, after the caller's
 * authorization has been checked (see ../auth.ts). Never import from client components.
 * Returns null when not configured.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  const env = readEnv(ENV.supabaseAdmin);
  if (!env.ok) return null;
  return createClient<Database>(env.values.NEXT_PUBLIC_SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
