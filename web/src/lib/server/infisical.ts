import 'server-only';
import { InfisicalSDK } from '@infisical/sdk';
import { getVercelOidcToken } from '@vercel/oidc';
import { optionalEnv, notConfigured, type NotConfigured } from './env';
import { safeJson } from './net/safe-fetch';
import { clientEnvironmentName, defaultSubPrefix, githubAdminConfig, readSubPrefix } from './isolation/github-env';
import { isolationMode, type IsolationMode } from './isolation/mode';
import { buildProvisionPlan } from './isolation/plan';

/**
 * Infisical access for GEO Engine (docs/architecture/security.md §1).
 *
 * One Infisical project per client org (`beacon-<slug>`, env `prod`, one folder per integration).
 * Three machine identities, each used for one job only:
 *   provisioner  creates client projects (POST /api/admin/orgs)
 *   app-writer   write-only: upserts secrets from the intake route
 *   worker       LEGACY shared reader, used only when ISOLATION_MODE=shared (./isolation/mode.ts)
 *   reader-<slug> one per client: read-only on that client's project only, OIDC-bound to the GitHub environment
 *                client-<slug>; used only inside the per-client runner (isolation.md)
 *
 * Login: OIDC with the Vercel OIDC token (preferred, no static secret), else Universal Auth.
 * Env per identity (ROLE = PROVISIONER | APP_WRITER | WORKER):
 *   INFISICAL_<ROLE>_IDENTITY_ID                         -> OIDC login (needs VERCEL_OIDC_TOKEN at runtime)
 *   INFISICAL_<ROLE>_CLIENT_ID + INFISICAL_<ROLE>_CLIENT_SECRET -> Universal Auth fallback
 * Plus INFISICAL_SITE_URL (default https://app.infisical.com).
 *
 * Tokens are cached in memory per function instance until 60 s before expiry. Never logged/persisted.
 */

export type InfisicalRole = 'provisioner' | 'app-writer' | 'worker';

export const INFISICAL_ENV = 'prod';

/** Folder per onboarding step (security.md §1.1). Steps not listed cannot hold machine secrets. */
export const STEP_FOLDERS: Record<string, string> = {
  github: '/github',
  cms: '/cms',
  gsc: '/gsc',
  bing: '/bing',
  ga4: '/ga4',
  google_cloud: '/gcp',
  analytics_tools: '/analytics',
  cloud_storage: '/aws',
  cdn_crawlers: '/cloudflare',
  chat: '/slack',
  youtube: '/youtube',
};

const ROLE_ENV: Record<InfisicalRole, string> = {
  provisioner: 'PROVISIONER',
  'app-writer': 'APP_WRITER',
  worker: 'WORKER',
};

function siteUrl(): string {
  return (optionalEnv('INFISICAL_SITE_URL') ?? 'https://app.infisical.com').replace(/\/+$/, '');
}

function siteHost(): string {
  return new URL(siteUrl()).hostname;
}

export function infisicalConfigured(role: InfisicalRole): { ok: true } | NotConfigured {
  const p = `INFISICAL_${ROLE_ENV[role]}`;
  if (optionalEnv(`${p}_IDENTITY_ID`)) return { ok: true };
  if (optionalEnv(`${p}_CLIENT_ID`) && optionalEnv(`${p}_CLIENT_SECRET`)) return { ok: true };
  return notConfigured([`${p}_IDENTITY_ID (OIDC) or ${p}_CLIENT_ID + ${p}_CLIENT_SECRET`]);
}

type Cached = { token: string; expiresAt: number };
const tokenCache = new Map<InfisicalRole, Cached>();

async function login(role: InfisicalRole): Promise<Cached> {
  const p = `INFISICAL_${ROLE_ENV[role]}`;
  const identityId = optionalEnv(`${p}_IDENTITY_ID`);
  const extraHosts = [siteHost()];

  if (identityId) {
    let jwt: string | undefined;
    try {
      jwt = await getVercelOidcToken();
    } catch {
      jwt = undefined;
    }
    if (jwt) return oidcLogin(identityId, jwt);
    // No OIDC token (local dev / non-Vercel): fall through to Universal Auth if configured.
  }

  const clientId = optionalEnv(`${p}_CLIENT_ID`);
  const clientSecret = optionalEnv(`${p}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) throw new InfisicalError('not_configured', `${p} credentials missing`);
  const res = await safeJson<{ accessToken: string; expiresIn: number }>(`${siteUrl()}/api/v1/auth/universal-auth/login`, {
    integration: 'infisical',
    extraHosts,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok || !res.data?.accessToken) throw new InfisicalError('login_failed', `Universal Auth login failed (${res.status})`);
  return { token: res.data.accessToken, expiresAt: Date.now() + res.data.expiresIn * 1000 };
}

export class InfisicalError extends Error {
  constructor(public readonly code: 'not_configured' | 'login_failed' | 'request_failed' | 'not_found', message: string) {
    super(message);
    this.name = 'InfisicalError';
  }
}

export async function getAccessToken(role: InfisicalRole): Promise<string> {
  const hit = tokenCache.get(role);
  if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.token;
  const fresh = await login(role);
  tokenCache.set(role, fresh);
  return fresh.token;
}

/** OIDC login for any identity with a caller-supplied JWT (the per-client runner passes its GitHub OIDC token). */
export async function oidcLogin(identityId: string, jwt: string): Promise<Cached> {
  const res = await safeJson<{ accessToken: string; expiresIn: number }>(`${siteUrl()}/api/v1/auth/oidc-auth/login`, {
    integration: 'infisical',
    extraHosts: [siteHost()],
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identityId, jwt }),
  });
  if (!res.ok || !res.data?.accessToken) throw new InfisicalError('login_failed', `OIDC login failed (${res.status})`);
  return { token: res.data.accessToken, expiresAt: Date.now() + res.data.expiresIn * 1000 };
}

export function infisicalSiteUrl(): string {
  return siteUrl();
}

/** SDK client for an already-obtained access token (per-client VaultSession). */
export function sdkWithToken(token: string): InfisicalSDK {
  return new InfisicalSDK({ siteUrl: siteUrl() }).auth().accessToken(token);
}

/** SDK client authenticated as `role`. */
export async function sdkAs(role: InfisicalRole): Promise<InfisicalSDK> {
  const token = await getAccessToken(role);
  return new InfisicalSDK({ siteUrl: siteUrl() }).auth().accessToken(token);
}

/** Raw REST call as `role` (for endpoints the SDK does not cover). */
export async function infisicalRest<T>(role: InfisicalRole, method: string, path: string, body?: unknown) {
  const token = await getAccessToken(role);
  return safeJson<T>(`${siteUrl()}${path}`, {
    integration: 'infisical',
    extraHosts: [siteHost()],
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Provisioning (beacon-provisioner) — security.md §1.3
// ---------------------------------------------------------------------------
export type ProvisionStep = { step: string; ok: boolean; detail?: string };

export async function provisionVault(org: { id: string; slug: string }, opts: { mode?: IsolationMode } = {}): Promise<
  | NotConfigured
  | { status: 'ok' | 'partial'; projectId: string; steps: ProvisionStep[]; isolation: IsolationRecord }
  | { status: 'failed'; steps: ProvisionStep[] }
> {
  const cfg = infisicalConfigured('provisioner');
  if (!('ok' in cfg)) return cfg;
  const steps: ProvisionStep[] = [];
  const slug = `beacon-${org.slug}`.slice(0, 36);

  // 1-2. create the project (SDK). Idempotency by slug is handled by the caller storing the id.
  let projectId: string;
  try {
    const sdk = await sdkAs('provisioner');
    const project = await sdk.projects().create({
      projectName: slug,
      slug,
      type: 'secret-manager',
      projectDescription: `org_id=${org.id}`,
    });
    projectId = project.id;
    steps.push({ step: 'project.create', ok: true });
  } catch (e) {
    steps.push({ step: 'project.create', ok: false, detail: errMsg(e) });
    return { status: 'failed', steps };
  }

  // 3. keep only `prod`
  try {
    const ws = await infisicalRest<{ workspace?: { environments?: { id: string; slug: string }[] } }>(
      'provisioner', 'GET', `/api/v1/workspace/${encodeURIComponent(projectId)}`);
    const envs = ws.data?.workspace?.environments ?? [];
    if (!envs.some((e) => e.slug === INFISICAL_ENV)) {
      const sdk = await sdkAs('provisioner');
      await sdk.environments().create({ projectId, name: 'Production', slug: INFISICAL_ENV });
    }
    for (const env of envs.filter((e) => e.slug !== INFISICAL_ENV)) {
      const del = await infisicalRest('provisioner', 'DELETE', `/api/v1/workspace/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(env.id)}`);
      steps.push({ step: `environment.delete:${env.slug}`, ok: del.ok, detail: del.ok ? undefined : `HTTP ${del.status}` });
    }
  } catch (e) {
    steps.push({ step: 'environments', ok: false, detail: errMsg(e) });
  }

  // 4. folder tree
  try {
    const sdk = await sdkAs('provisioner');
    for (const folder of new Set(Object.values(STEP_FOLDERS))) {
      await sdk.folders().create({ projectId, environment: INFISICAL_ENV, name: folder.slice(1), path: '/' });
    }
    steps.push({ step: 'folders.create', ok: true });
  } catch (e) {
    steps.push({ step: 'folders.create', ok: false, detail: errMsg(e) });
  }

  // 5-6. per-client reader identity (OIDC, bound to client-<slug>) + app-writer; legacy worker only in shared mode.
  const iso = await provisionReaderIdentity(org, projectId, opts);
  steps.push(...iso.steps);
  // The write-only "additional privilege" for app-writer is plan-dependent (security.md D3) and is
  // applied by a human until verified on our plan; recorded as a pending step.
  steps.push({ step: 'privilege.app-writer.write-only', ok: false, detail: 'manual: apply additional privilege (create/edit/describeSecret) in Infisical' });

  // 7. provisioner drops its own seat
  const selfId = optionalEnv('INFISICAL_PROVISIONER_MACHINE_IDENTITY_ID') ?? optionalEnv('INFISICAL_PROVISIONER_IDENTITY_ID');
  if (selfId) {
    const res = await infisicalRest('provisioner', 'DELETE',
      `/api/v2/workspace/${encodeURIComponent(projectId)}/identity-memberships/${encodeURIComponent(selfId)}`);
    steps.push({ step: 'identity.remove:provisioner', ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` });
  } else {
    steps.push({ step: 'identity.remove:provisioner', ok: false, detail: 'INFISICAL_PROVISIONER_MACHINE_IDENTITY_ID not set' });
  }

  return { status: steps.every((s) => s.ok) ? 'ok' : 'partial', projectId, steps, isolation: iso.isolation };
}

export type IsolationRecord = { readerIdentityId: string | null; environment: string; boundSubject: string | null; mode: IsolationMode };

/** Sub prefix: explicit env, else the repo's customization endpoint (admin token), else `repo:<GITHUB_REPOSITORY>`. */
export async function resolveSubPrefix(): Promise<string | null> {
  const explicit = optionalEnv('GITHUB_OIDC_SUB_PREFIX');
  if (explicit) return explicit;
  const gh = githubAdminConfig();
  if (!('status' in gh)) {
    try { return await readSubPrefix(gh); } catch { /* fall through */ }
  }
  const repo = optionalEnv('GITHUB_REPOSITORY');
  return repo ? defaultSubPrefix(repo) : null;
}

/**
 * Executes the identity part of buildProvisionPlan (isolation.md §5 step 4) as beacon-provisioner. Idempotent when
 * opts.existingReaderIdentityId is passed (backfill). Stores nothing itself; the caller persists `isolation`.
 */
export async function provisionReaderIdentity(
  org: { id: string; slug: string },
  projectId: string,
  opts: { existingReaderIdentityId?: string | null; mode?: IsolationMode } = {},
): Promise<{ steps: ProvisionStep[]; isolation: IsolationRecord }> {
  const mode = opts.mode ?? isolationMode();
  const steps: ProvisionStep[] = [];
  const environment = clientEnvironmentName(org.slug);
  const subPrefix = await resolveSubPrefix();
  if (!subPrefix) {
    steps.push({ step: 'reader.plan', ok: false, detail: 'GITHUB_REPOSITORY or GITHUB_OIDC_SUB_PREFIX not set' });
    return { steps, isolation: { readerIdentityId: opts.existingReaderIdentityId ?? null, environment, boundSubject: null, mode } };
  }
  const plan = buildProvisionPlan({
    orgId: org.id, slug: org.slug, projectId, subPrefix, mode,
    readerRole: optionalEnv('INFISICAL_CLIENT_READER_PROJECT_ROLE'),
    appWriterRole: optionalEnv('INFISICAL_APP_WRITER_PROJECT_ROLE'),
    workerRole: optionalEnv('INFISICAL_WORKER_PROJECT_ROLE'),
    existingReaderIdentityId: opts.existingReaderIdentityId,
  });
  let readerId = opts.existingReaderIdentityId ?? null;

  for (const st of plan.steps) {
    if (st.kind === 'identity.create') {
      const orgIdInf = optionalEnv('INFISICAL_ORG_ID');
      if (!orgIdInf) { steps.push({ step: 'reader.create', ok: false, detail: 'INFISICAL_ORG_ID not set' }); break; }
      const r = await infisicalRest<{ identity?: { id: string } }>('provisioner', 'POST', '/api/v1/identities', { name: st.name, organizationId: orgIdInf, role: st.orgRole });
      readerId = r.ok ? r.data?.identity?.id ?? null : null;
      steps.push({ step: 'reader.create', ok: !!readerId, detail: readerId ? st.name : `HTTP ${r.status}` });
      if (!readerId) break;
    } else if (st.kind === 'identity.oidc-auth') {
      const { kind: _k, ...body } = st;
      void _k;
      let r = await infisicalRest('provisioner', 'POST', `/api/v1/auth/oidc-auth/identities/${encodeURIComponent(readerId!)}`, body);
      if (!r.ok && (r.status === 400 || r.status === 409)) r = await infisicalRest('provisioner', 'PATCH', `/api/v1/auth/oidc-auth/identities/${encodeURIComponent(readerId!)}`, body);
      steps.push({ step: 'reader.oidc-auth', ok: r.ok, detail: r.ok ? `sub=${st.boundSubject}` : `HTTP ${r.status}` });
    } else if (st.kind === 'project.membership') {
      const identityId = st.identity === 'reader' ? readerId
        : st.identity === 'app-writer' ? optionalEnv('INFISICAL_APP_WRITER_MACHINE_IDENTITY_ID') ?? optionalEnv('INFISICAL_APP_WRITER_IDENTITY_ID')
        : optionalEnv('INFISICAL_WORKER_MACHINE_IDENTITY_ID') ?? optionalEnv('INFISICAL_WORKER_IDENTITY_ID');
      const label = st.identity === 'reader' ? 'reader' : st.identity;
      if (!identityId) { steps.push({ step: `identity.add:${label}`, ok: false, detail: 'identity id not set' }); continue; }
      const r = await infisicalRest('provisioner', 'POST',
        `/api/v2/workspace/${encodeURIComponent(st.projectId)}/identity-memberships/${encodeURIComponent(identityId)}`, { role: st.role });
      const ok = r.ok || r.status === 409;
      steps.push({ step: `identity.add:${label}`, ok, detail: ok ? `role=${st.role}` : `HTTP ${r.status}` });
    }
    // github.environment is executed by the caller (ensureClientEnvironment) once readerId is known.
  }
  return { steps, isolation: { readerIdentityId: readerId, environment, boundSubject: plan.boundSubject, mode } };
}

// ---------------------------------------------------------------------------
// Write (beacon-app-writer, write-only): upsert one secret
// ---------------------------------------------------------------------------
export async function upsertSecret(args: {
  projectId: string;
  secretPath: string;
  secretName: string;
  value: string;
  stepId: string;
}): Promise<NotConfigured | { status: 'stored'; version: number | null }> {
  const cfg = infisicalConfigured('app-writer');
  if (!('ok' in cfg)) return cfg;
  const sdk = await sdkAs('app-writer');
  const base = {
    projectId: args.projectId,
    environment: INFISICAL_ENV,
    secretPath: args.secretPath,
    secretComment: `step:${args.stepId} granted-by:client`,
  };
  try {
    const created = await sdk.secrets().createSecret(args.secretName, { ...base, secretValue: args.value });
    return { status: 'stored', version: created.secret.version ?? null };
  } catch (e) {
    // Already exists -> edit (write-only identities cannot read, so we don't check first).
    const status = (e as { statusCode?: number }).statusCode;
    if (status !== undefined && status !== 400 && status !== 409) throw new InfisicalError('request_failed', `create failed (${status})`);
    const updated = await sdk.secrets().updateSecret(args.secretName, { ...base, secretValue: args.value });
    return { status: 'stored', version: updated.secret.version ?? null };
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'statusCode' in e) return `HTTP ${(e as { statusCode: number }).statusCode}`;
  return e instanceof Error ? e.message.slice(0, 200) : 'error';
}
