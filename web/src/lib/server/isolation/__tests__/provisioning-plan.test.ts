import { describe, expect, it } from 'vitest';
import { buildProvisionPlan, READER_TOKEN_TTL_S, type PlanStep } from '../plan';
import { isolationMode } from '../mode';

const base = { orgId: '11111111-1111-1111-1111-111111111111', slug: 'acme', projectId: 'proj-acme', subPrefix: 'repo:ziv/geo-platform' };
const kinds = (steps: PlanStep[]) => steps.map((s) => ('identity' in s ? `${s.kind}:${s.identity}` : s.kind));

describe('provisioning plan (per_client)', () => {
  const plan = buildProvisionPlan({ ...base, mode: 'per_client' });

  it('creates a per-client reader identity with no org-level role', () => {
    const create = plan.steps.find((s) => s.kind === 'identity.create');
    expect(create).toEqual({ kind: 'identity.create', name: 'reader-acme', orgRole: 'no-access' });
  });

  it('binds OIDC auth to exactly this client environment', () => {
    const auth = plan.steps.find((s) => s.kind === 'identity.oidc-auth');
    expect(auth).toMatchObject({
      boundIssuer: 'https://token.actions.githubusercontent.com',
      boundAudiences: 'infisical',
      boundSubject: 'repo:ziv/geo-platform:environment:client-acme',
      boundClaims: { environment: 'client-acme' },
      accessTokenTTL: READER_TOKEN_TTL_S,
    });
    expect(plan.environment).toBe('client-acme');
  });

  it('grants the reader a read-only role on ONLY this project', () => {
    const memberships = plan.steps.filter((s) => s.kind === 'project.membership');
    const reader = memberships.filter((s) => 'identity' in s && s.identity === 'reader');
    expect(reader).toEqual([{ kind: 'project.membership', projectId: 'proj-acme', identity: 'reader', role: 'viewer' }]);
    expect(memberships.every((s) => s.kind === 'project.membership' && s.projectId === 'proj-acme')).toBe(true);
  });

  it('does not add the shared worker reader in per_client mode', () => {
    expect(kinds(plan.steps)).not.toContain('project.membership:worker');
    expect(kinds(plan.steps)).toEqual(['identity.create', 'identity.oidc-auth', 'project.membership:reader', 'project.membership:app-writer', 'github.environment']);
  });

  it('puts only non-secret ids on the GitHub environment', () => {
    const env = plan.steps.find((s) => s.kind === 'github.environment');
    expect(env).toMatchObject({ environment: 'client-acme', branch: 'main' });
    expect(Object.keys(env && 'vars' in env ? env.vars : {}).sort()).toEqual(['INFISICAL_IDENTITY_ID', 'ORG_ID', 'ORG_SLUG']);
  });

  it('keeps the legacy worker only in shared mode', () => {
    expect(kinds(buildProvisionPlan({ ...base, mode: 'shared' }).steps)).toContain('project.membership:worker');
  });

  it('is idempotent for backfill (existing reader identity is not re-created)', () => {
    const p = buildProvisionPlan({ ...base, mode: 'per_client', existingReaderIdentityId: 'id-1' });
    expect(kinds(p.steps)).not.toContain('identity.create');
  });

  it('refuses a writable reader role and bad slugs', () => {
    expect(() => buildProvisionPlan({ ...base, mode: 'per_client', readerRole: 'admin' })).toThrow(/read-only/);
    expect(() => buildProvisionPlan({ ...base, slug: 'Acme Corp', mode: 'per_client' })).toThrow(/invalid org slug/);
  });
});

describe('ISOLATION_MODE', () => {
  it('defaults to per_client in production, shared elsewhere, and fails closed on junk', () => {
    expect(isolationMode({ VERCEL_ENV: 'production' })).toBe('per_client');
    expect(isolationMode({ NODE_ENV: 'production' })).toBe('per_client');
    expect(isolationMode({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe('shared');
    expect(isolationMode({})).toBe('shared');
    expect(isolationMode({ ISOLATION_MODE: 'shared', VERCEL_ENV: 'production' })).toBe('shared');
    expect(isolationMode({ ISOLATION_MODE: 'yes please' })).toBe('per_client');
  });
});
