import 'server-only';
import { infisicalSiteUrl, oidcLogin } from '../infisical';
import { INFISICAL_OIDC_AUDIENCE, clientEnvironmentName } from './github-env';
import type { VaultSession } from './job-context';

/**
 * Runner side of the trust chain (isolation.md §0): GitHub OIDC token for audience `infisical` -> login as the client's
 * own identity (vars.INFISICAL_IDENTITY_ID of environment client-<slug>). Infisical checks the exact `sub`, so this
 * only succeeds inside that client's environment. Returns not_configured outside GitHub Actions.
 */
export async function githubOidcToken(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<
  { status: 'ok'; jwt: string } | { status: 'not_configured'; missing: string[] }
> {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL?.trim();
  const token = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN?.trim();
  if (!url || !token) return { status: 'not_configured', missing: ['ACTIONS_ID_TOKEN_REQUEST_URL/TOKEN (job needs permissions: id-token: write)'] };
  const u = new URL(url);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.actions.githubusercontent.com')) throw new Error('unexpected OIDC token endpoint');
  u.searchParams.set('audience', INFISICAL_OIDC_AUDIENCE);
  const res = await fetchImpl(u, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  const body = (await res.json().catch(() => null)) as { value?: string } | null;
  if (!res.ok || !body?.value) throw new Error(`GitHub OIDC token request failed (${res.status})`);
  return { status: 'ok', jwt: body.value };
}

/** Unverified read of a JWT's claims (the vault verifies the signature; we only use this for logging / self-checks). */
export function jwtClaims(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1];
  if (!part) return {};
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>; } catch { return {}; }
}

export async function openVaultSession(o: { orgId: string; slug: string; identityId: string | undefined }): Promise<
  { status: 'ok'; session: VaultSession } | { status: 'not_configured'; missing: string[] }
> {
  if (!o.identityId) return { status: 'not_configured', missing: ['INFISICAL_IDENTITY_ID (environment variable of client-<slug>)'] };
  const tok = await githubOidcToken();
  if (tok.status !== 'ok') return tok;
  const claims = jwtClaims(tok.jwt);
  // Self-check before even asking the vault: the token must come from this org's environment.
  if (claims.environment !== clientEnvironmentName(o.slug)) throw new Error(`OIDC token environment ${String(claims.environment)} is not ${clientEnvironmentName(o.slug)}`);
  const login = await oidcLogin(o.identityId, tok.jwt);
  return {
    status: 'ok',
    session: { orgId: o.orgId, accessToken: login.token, siteUrl: infisicalSiteUrl(), runnerSub: typeof claims.sub === 'string' ? claims.sub : null, expiresAt: login.expiresAt },
  };
}
