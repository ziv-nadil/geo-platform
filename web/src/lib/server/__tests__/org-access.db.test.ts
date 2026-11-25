/**
 * requireOrgAccess against the database built by supabase/tests/local/run.sh (seed users).
 * Skipped unless TEST_DATABASE_URL is set, like worker.db.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const NW = '10000000-0000-4000-b000-000000000001';
const DANA = '00000000-0000-4000-a000-000000000011'; // Northwind owner

d('requireOrgAccess enforces MFA like the restrictive RLS policies', () => {
  let auth: typeof import('../auth');
  let db: typeof import('../db');
  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('DATABASE_SSL', 'disable');
    auth = await import('../auth');
    db = await import('../db');
  });
  afterAll(async () => {
    await db.withService((sql) => sql`delete from auth.mfa_factors where user_id = ${DANA}`);
    await db.getSql()?.end();
    vi.unstubAllEnvs();
  });

  const as = (aal: 'aal1' | 'aal2') => db.runAs({ sub: DANA, role: 'authenticated', aal }, () => auth.requireOrgAccess(NW, 'admin'));

  it('admits an owner without MFA at aal1', async () => {
    expect((await as('aal1')).ok).toBe(true);
  });

  it('rejects an aal1 session once the user enrolled a verified factor', async () => {
    await db.withService((sql) => sql`insert into auth.mfa_factors (user_id, status) values (${DANA}, 'verified')`);
    const r = await as('aal1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
    expect((await as('aal2')).ok).toBe(true);
  });
});
