/**
 * Postgres access for the pipeline (service-level connection via DATABASE_URL; bypasses RLS, so
 * every query filters by org_id explicitly). Separate from lib/server/db.ts on purpose: the
 * pipeline runs only in cron route handlers.
 */
import postgres from 'postgres';

export type Sql = postgres.Sql;

let client: Sql | null = null;

export function getSql(): { ok: true; sql: Sql } | { ok: false; missing: string[] } {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return { ok: false, missing: ['DATABASE_URL'] };
  if (!client) {
    client = postgres(url, {
      max: Number(process.env.PIPELINE_DB_POOL ?? 5),
      idle_timeout: 20,
      connect_timeout: 15,
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      onnotice: () => {},
    });
  }
  return { ok: true, sql: client };
}

/** For tests. */
export function createSql(url: string): Sql {
  return postgres(url, { max: 3, prepare: false, onnotice: () => {} });
}
