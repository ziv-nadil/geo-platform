import 'server-only';
import { currentClaims, dbConfigured, withRls, type JwtClaims, type TxSql } from '../db';
import type { Filters, QueryResult } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run a user-scoped (RLS) query. */
export async function userQuery<T>(fn: (sql: TxSql, claims: JwtClaims) => Promise<T>): Promise<QueryResult<T>> {
  if (!dbConfigured()) return { ok: false, reason: 'not_configured', missing: ['DATABASE_URL'] };
  const claims = await currentClaims();
  if (!claims) return { ok: false, reason: 'unauthenticated' };
  return { ok: true, data: await withRls(claims, (sql) => fn(sql, claims)) };
}

/** Org-scoped query: invalid ids and orgs the caller cannot read return 'forbidden'. */
export async function orgQuery<T>(orgId: string, fn: (sql: TxSql, claims: JwtClaims) => Promise<T>): Promise<QueryResult<T>> {
  if (!UUID_RE.test(orgId)) return { ok: false, reason: 'forbidden' };
  if (!dbConfigured()) return { ok: false, reason: 'not_configured', missing: ['DATABASE_URL'] };
  const claims = await currentClaims();
  if (!claims) return { ok: false, reason: 'unauthenticated' };
  return withRls(claims, async (sql) => {
    const [visible] = await sql`select exists (select 1 from public.organizations where id = ${orgId}) as ok`;
    if (!visible?.ok) return { ok: false, reason: 'forbidden' } as const;
    return { ok: true, data: await fn(sql, claims) } as const;
  });
}

export function window(filters: Filters = {}) {
  const days = Math.min(365, Math.max(1, Math.floor(filters.days ?? 30)));
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (days - 1)));
  const prevFrom = new Date(from.getTime() - days * 86_400_000);
  return {
    days,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    prevFrom: prevFrom.toISOString().slice(0, 10),
    engines: filters.engines && filters.engines.length ? filters.engines : null,
    topicId: filters.topicId && UUID_RE.test(filters.topicId) ? filters.topicId : null,
  };
}

export const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
export const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v));
export const day = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
