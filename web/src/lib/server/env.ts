import 'server-only';

/**
 * Server-side environment access. Nothing here is ever sent to the browser.
 *
 * Every integration degrades gracefully: when its env vars are missing, callers get
 * { status: 'not_configured', missing: [...] } instead of an exception.
 */

export type NotConfigured = { status: 'not_configured'; missing: string[] };

export function notConfigured(missing: string[]): NotConfigured {
  return { status: 'not_configured', missing };
}

/** Returns the values, or the list of missing names. Empty strings count as missing. */
export function readEnv<K extends string>(
  names: readonly K[],
): { ok: true; values: Record<K, string> } | { ok: false; missing: K[] } {
  const values = {} as Record<K, string>;
  const missing: K[] = [];
  for (const name of names) {
    const v = process.env[name];
    if (v === undefined || v.trim() === '') missing.push(name);
    else values[name] = v.trim();
  }
  return missing.length ? { ok: false, missing } : { ok: true, values };
}

export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

/** Env vars each server capability needs (documented in docs/ops and the backend report). */
export const ENV = {
  supabasePublic: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  supabaseAdmin: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  infisical: ['INFISICAL_CLIENT_ID', 'INFISICAL_CLIENT_SECRET'],
  stripe: ['STRIPE_SECRET_KEY'],
  stripeWebhook: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
} as const;
