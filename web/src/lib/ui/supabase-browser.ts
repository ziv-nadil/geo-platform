"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client, or null when the public env vars are not set (auth not configured). */
export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
