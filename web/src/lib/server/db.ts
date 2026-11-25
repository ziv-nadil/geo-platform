import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import { createSupabaseServerClient } from './supabase/server';

/**
 * Direct Postgres access for server components and route handlers.
 *
 * DATABASE_URL
 *   local: printed by scripts/dev-db.sh (PG16 + Supabase compat stub + migrations + seed)
 *   prod:  Supabase pooler URL (transaction mode, port 6543), see docs/ops/runbook.md
 *
 * withRls(claims, fn) runs fn in a transaction as role `authenticated` with request.jwt.claims set,
 * exactly like PostgREST on Supabase, so every RLS policy applies. withService(...) bypasses RLS and
 * is reserved for platform-admin console queries (callers must check requirePlatformAdmin and audit).
 */

export type Sql = postgres.Sql;
export type TxSql = postgres.TransactionSql;

export type JwtClaims = {
  sub: string;
  role?: 'authenticated';
  aal?: 'aal1' | 'aal2';
  email?: string;
  [k: string]: unknown;
};

declare global {
  var __beaconSql: Sql | undefined;
}

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalThis.__beaconSql) {
    const isPooler = /pooler\.supabase\.com|:6543\b/.test(url);
    globalThis.__beaconSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: !isPooler, // Supavisor transaction mode does not support prepared statements
      ssl: process.env.DATABASE_SSL === 'disable' || ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname) ? false : 'require',
      types: { bigint: postgres.BigInt },
      transform: { undefined: null },
    });
  }
  return globalThis.__beaconSql;
}

export class DbNotConfigured extends Error {
  constructor() {
    super('DATABASE_URL is not set');
    this.name = 'DbNotConfigured';
  }
}

/** Run `fn` as the given user with RLS enforced. */
export async function withRls<T>(claims: JwtClaims, fn: (sql: TxSql) => Promise<T>): Promise<T> {
  const sql = getSql();
  if (!sql) throw new DbNotConfigured();
  const full = { role: 'authenticated', aal: 'aal1', ...claims };
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(full)}, true), set_config('request.jwt.claim.sub', ${full.sub}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  })) as T;
}

/** Bypasses RLS. Platform-admin console and server jobs only. */
export async function withService<T>(fn: (sql: TxSql) => Promise<T>): Promise<T> {
  const sql = getSql();
  if (!sql) throw new DbNotConfigured();
  return (await sql.begin(async (tx) => fn(tx))) as T;
}

// ---------------------------------------------------------------------------
// Caller identity for query functions
// ---------------------------------------------------------------------------
const override = new AsyncLocalStorage<JwtClaims>();

/** Scripts/tests: run query functions as a specific user (never used by request handlers). */
export function runAs<T>(claims: JwtClaims, fn: () => Promise<T>): Promise<T> {
  return override.run(claims, fn);
}

/**
 * Resolve the current caller's JWT claims:
 *   1. runAs() override (scripts)
 *   2. Supabase session via getClaims() (verified JWT; never getSession())
 *   3. local dev only: DEV_IMPERSONATE_USER_ID (+ DEV_IMPERSONATE_AAL) when Supabase Auth is not configured
 */
export async function currentClaims(): Promise<JwtClaims | null> {
  const o = override.getStore();
  if (o) return o;
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    const c = data?.claims as JwtClaims | undefined;
    return c?.sub ? { sub: c.sub, role: 'authenticated', aal: (c.aal as 'aal1' | 'aal2') ?? 'aal1', email: c.email as string | undefined } : null;
  }
  const dev = process.env.DEV_IMPERSONATE_USER_ID;
  if (dev && devBypassAllowed()) {
    return { sub: dev, role: 'authenticated', aal: process.env.DEV_IMPERSONATE_AAL === 'aal2' ? 'aal2' : 'aal1' };
  }
  return null;
}

/**
 * The dev identity bypass is never available in a deployed environment: it needs a non-production
 * NODE_ENV, no Vercel deployment marker, and a DATABASE_URL on localhost (same rule as lib/data.ts).
 */
export function devBypassAllowed(): boolean {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.VERCEL_ENV) return false;
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL ?? '').hostname);
  } catch {
    return false;
  }
}
