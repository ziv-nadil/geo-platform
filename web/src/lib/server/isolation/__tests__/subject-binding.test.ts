import { describe, expect, it, vi } from 'vitest';
import {
  clientEnvironmentName, defaultSubPrefix, dispatchClientJob, ensureClientEnvironment, githubAdminConfig, oidcSubject,
  readSubPrefix, slugFromEnvironment, subjectMatchesOrg,
} from '../github-env';

const PREFIX = 'repo:ziv/geo-platform';

describe('OIDC subject binding', () => {
  it('builds the exact per-environment subject', () => {
    expect(clientEnvironmentName('acme')).toBe('client-acme');
    expect(oidcSubject(PREFIX, 'acme')).toBe('repo:ziv/geo-platform:environment:client-acme');
    expect(defaultSubPrefix('ziv/geo-platform')).toBe(PREFIX);
  });

  it("never lets one client's token satisfy another client's binding", () => {
    const acmeSub = oidcSubject(PREFIX, 'acme');
    expect(subjectMatchesOrg(acmeSub, PREFIX, 'acme')).toBe(true);
    expect(subjectMatchesOrg(acmeSub, PREFIX, 'beta')).toBe(false);
    expect(subjectMatchesOrg(oidcSubject(PREFIX, 'acme-2'), PREFIX, 'acme')).toBe(false);
    expect(subjectMatchesOrg(`${acmeSub}-2`, PREFIX, 'acme')).toBe(false);
    expect(subjectMatchesOrg('repo:ziv/geo-platform:ref:refs/heads/main', PREFIX, 'acme')).toBe(false);
    expect(subjectMatchesOrg('repo:evil/geo-platform:environment:client-acme', PREFIX, 'acme')).toBe(false);
  });

  it('rejects wildcard or malformed prefixes and slugs', () => {
    expect(() => oidcSubject('repo:ziv/*', 'acme')).toThrow();
    expect(() => oidcSubject(`${PREFIX}:environment:client-x`, 'acme')).toThrow();
    expect(() => oidcSubject(PREFIX, 'acme:environment:client-beta')).toThrow();
    expect(() => clientEnvironmentName('-bad')).toThrow();
  });

  it('maps environment names back to slugs strictly', () => {
    expect(slugFromEnvironment('client-acme')).toBe('acme');
    expect(slugFromEnvironment('production')).toBeNull();
    expect(slugFromEnvironment('client-')).toBeNull();
  });
});

type Call = { method: string; path: string; body: unknown };
function fakeGithub(responses: Record<string, number> = {}) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    calls.push({ method, path: u.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const status = responses[`${method} ${u.pathname}`] ?? 200;
    const body = u.pathname.endsWith('/oidc/customization/sub') ? { use_default: true } : {};
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, cfg: { token: 't', repository: 'ziv/geo-platform', fetchImpl } };
}

describe('GitHub environments (REST)', () => {
  it('is not_configured without an admin token', () => {
    expect(githubAdminConfig({})).toEqual({ status: 'not_configured', missing: ['GITHUB_ADMIN_TOKEN', 'GITHUB_REPOSITORY'] });
  });

  it('creates client-<slug> with a main-only branch policy and only non-secret vars', async () => {
    const { calls, cfg } = fakeGithub();
    const r = await ensureClientEnvironment(cfg, { orgId: 'o-1', slug: 'acme', readerIdentityId: 'rid-1' });
    expect(r.status).toBe('ok');
    expect(calls[0]).toEqual({ method: 'PUT', path: '/repos/ziv/geo-platform/environments/client-acme', body: { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } } });
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/repos/ziv/geo-platform/environments/client-acme/deployment-branch-policies', body: { name: 'main', type: 'branch' } });
    const vars = calls.filter((c) => c.path.endsWith('/variables')).map((c) => c.body);
    expect(vars).toEqual([{ name: 'ORG_ID', value: 'o-1' }, { name: 'ORG_SLUG', value: 'acme' }, { name: 'INFISICAL_IDENTITY_ID', value: 'rid-1' }]);
    expect(calls.some((c) => c.path.includes('/secrets'))).toBe(false);
  });

  it('updates existing variables (idempotent re-run)', async () => {
    const { calls, cfg } = fakeGithub({ 'POST /repos/ziv/geo-platform/environments/client-acme/variables': 409 });
    const r = await ensureClientEnvironment(cfg, { orgId: 'o-1', slug: 'acme', readerIdentityId: 'rid-1' });
    expect(r.status).toBe('ok');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(3);
  });

  it('reports partial when the reader identity is missing', async () => {
    const { cfg } = fakeGithub();
    const r = await ensureClientEnvironment(cfg, { orgId: 'o-1', slug: 'acme', readerIdentityId: null });
    expect(r.status).toBe('partial');
  });

  it('reads the default sub prefix and dispatches one org per run', async () => {
    const { calls, cfg } = fakeGithub({ 'POST /repos/ziv/geo-platform/actions/workflows/client-job.yml/dispatches': 204 });
    expect(await readSubPrefix(cfg)).toBe(PREFIX);
    const d = await dispatchClientJob(cfg, { slug: 'acme', jobType: 'content', jobId: 'j1' });
    expect(d.ok).toBe(true);
    expect(calls.at(-1)?.body).toEqual({ ref: 'main', inputs: { org_slug: 'acme', job_type: 'content', job_id: 'j1' } });
  });
});
