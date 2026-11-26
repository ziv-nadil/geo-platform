/**
 * Per-client GitHub environments + OIDC subject binding (docs/architecture/isolation.md §0, §5 Phase 1).
 *
 * Dependency-free on purpose (no `server-only`, no `@/` aliases, no relative imports): it is imported by the app,
 * by vitest, and by `scripts/github-environments.ts` under `node --experimental-strip-types`.
 *
 * Trust chain: a job that declares `environment: client-<slug>` gets a GitHub OIDC token whose `sub` is
 * `<prefix>:environment:client-<slug>`. That client's Infisical identity trusts that exact subject and nothing else.
 */

export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_OIDC_DISCOVERY_URL = 'https://token.actions.githubusercontent.com';
export const INFISICAL_OIDC_AUDIENCE = 'infisical';
export const CLIENT_ENV_PREFIX = 'client-';
/** Only `main` may deploy into a client environment (deployment branch policy). */
export const CLIENT_ENV_BRANCH = 'main';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class IsolationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IsolationConfigError';
  }
}

export function assertSlug(slug: string): string {
  if (!SLUG_RE.test(slug)) throw new IsolationConfigError(`invalid org slug: ${JSON.stringify(slug)}`);
  return slug;
}

/** `client-<slug>`: the GitHub environment a client's jobs run in. */
export function clientEnvironmentName(slug: string): string {
  return `${CLIENT_ENV_PREFIX}${assertSlug(slug)}`;
}

/** Infisical identity name for a client's reader. */
export function readerIdentityName(slug: string): string {
  return `reader-${assertSlug(slug)}`;
}

/** Inverse of clientEnvironmentName; null for anything that is not exactly a client environment. */
export function slugFromEnvironment(env: string): string | null {
  if (!env.startsWith(CLIENT_ENV_PREFIX)) return null;
  const slug = env.slice(CLIENT_ENV_PREFIX.length);
  return SLUG_RE.test(slug) ? slug : null;
}

/** Default `sub` prefix for repos using GitHub's classic template: `repo:<owner>/<repo>`. */
export function defaultSubPrefix(repository: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new IsolationConfigError(`invalid repository: ${repository}`);
  return `repo:${repository}`;
}

/**
 * The exact OIDC subject a client's identity is bound to. `prefix` is what precedes `:environment:` in the repo's real
 * `sub` (read it from GET /repos/{owner}/{repo}/actions/oidc/customization/sub; repos created after 2026-07-15 use an
 * immutable id-based prefix). No wildcards, ever.
 */
export function oidcSubject(prefix: string, slug: string): string {
  if (!prefix || /[*?\s]/.test(prefix) || prefix.includes(':environment:')) throw new IsolationConfigError('invalid OIDC subject prefix');
  return `${prefix}:environment:${clientEnvironmentName(slug)}`;
}

/**
 * True only if `sub` is exactly the subject bound to `slug`. Used by the runner (defense in depth: Infisical already
 * enforces this) and by tests that prove a token for one client can never satisfy another client's binding.
 */
export function subjectMatchesOrg(sub: string, prefix: string, slug: string): boolean {
  try {
    return sub === oidcSubject(prefix, slug);
  } catch {
    return false;
  }
}

/** Environment variables (non-secret) placed on each client's GitHub environment. */
export function environmentVariables(o: { orgId: string; slug: string; readerIdentityId: string | null }): Record<string, string> {
  const vars: Record<string, string> = { ORG_ID: o.orgId, ORG_SLUG: assertSlug(o.slug) };
  if (o.readerIdentityId) vars.INFISICAL_IDENTITY_ID = o.readerIdentityId;
  return vars;
}

// ---------------------------------------------------------------------------
// GitHub REST (repo-admin token). Returns not_configured without GITHUB_ADMIN_TOKEN + GITHUB_REPOSITORY.
// ---------------------------------------------------------------------------
export type GithubConfig = { token: string; repository: string; apiUrl?: string; fetchImpl?: typeof fetch };
export type GhNotConfigured = { status: 'not_configured'; missing: string[] };
export type GhStep = { step: string; ok: boolean; detail?: string };

export function githubAdminConfig(env: Record<string, string | undefined> = process.env, fetchImpl?: typeof fetch): GithubConfig | GhNotConfigured {
  const token = env.GITHUB_ADMIN_TOKEN?.trim();
  const repository = env.GITHUB_REPOSITORY?.trim();
  const missing = [!token && 'GITHUB_ADMIN_TOKEN', !repository && 'GITHUB_REPOSITORY'].filter(Boolean) as string[];
  if (missing.length) return { status: 'not_configured', missing };
  return { token: token!, repository: repository!, fetchImpl };
}

async function gh(cfg: GithubConfig, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = (cfg.apiUrl ?? 'https://api.github.com').replace(/\/+$/, '');
  const url = new URL(base + path);
  if (url.protocol !== 'https:' || url.hostname !== new URL(base).hostname) throw new IsolationConfigError('refusing non-GitHub URL');
  const f = cfg.fetchImpl ?? fetch;
  const res = await f(url, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${cfg.token}`,
      'x-github-api-version': '2022-11-28',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

const repoPath = (cfg: GithubConfig) => `/repos/${cfg.repository.split('/').map(encodeURIComponent).join('/')}`;

/** Reads the repo's real `sub` prefix. Falls back to `repo:<owner>/<repo>` when the repo uses the default template. */
export async function readSubPrefix(cfg: GithubConfig): Promise<string> {
  const r = await gh(cfg, 'GET', `${repoPath(cfg)}/actions/oidc/customization/sub`);
  const d = (r.data ?? {}) as { use_default?: boolean; include_claim_keys?: string[]; sub_prefix?: string };
  if (r.ok && typeof d.sub_prefix === 'string' && d.sub_prefix) return d.sub_prefix.replace(/:environment:.*$/, '');
  if (r.ok && d.use_default === false && Array.isArray(d.include_claim_keys) && d.include_claim_keys.length) {
    throw new IsolationConfigError(`repo uses a custom OIDC sub template (${d.include_claim_keys.join(',')}); set GITHUB_OIDC_SUB_PREFIX explicitly`);
  }
  return defaultSubPrefix(cfg.repository);
}

/**
 * Idempotently creates/updates `client-<slug>`: deployment branch policy `main` only, plus vars ORG_ID, ORG_SLUG,
 * INFISICAL_IDENTITY_ID. No secrets are ever written to the environment (the job logs in with OIDC).
 */
export async function ensureClientEnvironment(
  cfg: GithubConfig,
  o: { orgId: string; slug: string; readerIdentityId: string | null },
): Promise<{ status: 'ok' | 'partial'; environment: string; steps: GhStep[] }> {
  const env = clientEnvironmentName(o.slug);
  const envPath = `${repoPath(cfg)}/environments/${encodeURIComponent(env)}`;
  const steps: GhStep[] = [];

  const put = await gh(cfg, 'PUT', envPath, { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } });
  steps.push({ step: 'environment.upsert', ok: put.ok, detail: put.ok ? env : `HTTP ${put.status}` });
  if (!put.ok) return { status: 'partial', environment: env, steps };

  const pol = await gh(cfg, 'POST', `${envPath}/deployment-branch-policies`, { name: CLIENT_ENV_BRANCH, type: 'branch' });
  // 303/409/422 = policy already exists
  const polOk = pol.ok || pol.status === 303 || pol.status === 409 || pol.status === 422;
  steps.push({ step: 'environment.branch-policy', ok: polOk, detail: polOk ? CLIENT_ENV_BRANCH : `HTTP ${pol.status}` });

  for (const [name, value] of Object.entries(environmentVariables(o))) {
    let r = await gh(cfg, 'POST', `${envPath}/variables`, { name, value });
    if (!r.ok && (r.status === 409 || r.status === 422)) r = await gh(cfg, 'PATCH', `${envPath}/variables/${encodeURIComponent(name)}`, { name, value });
    steps.push({ step: `environment.var:${name}`, ok: r.ok, detail: r.ok ? undefined : `HTTP ${r.status}` });
  }
  if (!o.readerIdentityId) steps.push({ step: 'environment.var:INFISICAL_IDENTITY_ID', ok: false, detail: 'reader identity not created yet' });
  return { status: steps.every((s) => s.ok) ? 'ok' : 'partial', environment: env, steps };
}

/** Dispatches `client-job.yml` for one org. Needs a token with actions:write (GITHUB_DISPATCH_TOKEN). */
export async function dispatchClientJob(
  cfg: GithubConfig,
  o: { slug: string; jobType: string; jobId: string; workflow?: string; ref?: string },
): Promise<{ ok: boolean; status: number }> {
  const wf = encodeURIComponent(o.workflow ?? 'client-job.yml');
  const r = await gh(cfg, 'POST', `${repoPath(cfg)}/actions/workflows/${wf}/dispatches`, {
    ref: o.ref ?? CLIENT_ENV_BRANCH,
    inputs: { org_slug: assertSlug(o.slug), job_type: o.jobType, job_id: o.jobId },
  });
  return { ok: r.ok, status: r.status };
}
