import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));

import { checkOrigin, mfaSatisfied } from '../auth';
import { currentClaims, devBypassAllowed } from '../db';

afterEach(() => vi.unstubAllEnvs());

describe('mfaSatisfied (route handlers mirror aal_ok + org_mfa_ok)', () => {
  it('blocks an aal1 session of a user who enrolled MFA', () => {
    expect(mfaSatisfied('aal1', true, false)).toBe(false);
  });
  it('blocks aal1 when the org requires MFA', () => {
    expect(mfaSatisfied('aal1', false, true)).toBe(false);
  });
  it('allows aal1 without a factor or org requirement, and any aal2', () => {
    expect(mfaSatisfied('aal1', false, false)).toBe(true);
    expect(mfaSatisfied('aal2', true, true)).toBe(true);
  });
});

describe('dev identity bypass is impossible outside local dev', () => {
  const local = () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('DEV_IMPERSONATE_USER_ID', '00000000-0000-4000-a000-000000000011');
    vi.stubEnv('DATABASE_URL', 'postgres://u@localhost:5432/beacon');
    vi.stubEnv('NODE_ENV', 'development');
  };
  it('works for local dev against a localhost database', async () => {
    local();
    expect(devBypassAllowed()).toBe(true);
    expect((await currentClaims())?.sub).toBe('00000000-0000-4000-a000-000000000011');
  });
  it('is off in production', async () => {
    local();
    vi.stubEnv('NODE_ENV', 'production');
    expect(await currentClaims()).toBeNull();
  });
  it('is off on any Vercel deployment', async () => {
    local();
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(await currentClaims()).toBeNull();
  });
  it('is off against a remote database', async () => {
    local();
    vi.stubEnv('DATABASE_URL', 'postgres://u@db.example.supabase.co:6543/postgres');
    expect(await currentClaims()).toBeNull();
  });
});

describe('checkOrigin (CSRF on state-changing routes)', () => {
  it('rejects a cross-site POST and accepts same-origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.beacon.example');
    const req = (origin: string | null) =>
      new Request('https://app.beacon.example/api/onboarding/x/test/y', { method: 'POST', headers: { host: 'app.beacon.example', ...(origin ? { origin } : {}) } });
    expect(checkOrigin(req('https://evil.example'))?.status).toBe(403);
    expect(checkOrigin(req(null))?.status).toBe(403);
    expect(checkOrigin(req('https://app.beacon.example'))).toBeNull();
  });
});
