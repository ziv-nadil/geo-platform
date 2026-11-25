import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { allowlistedFetch } from '../../engines/http';
import { readSecret } from '../secrets/broker';

export const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'];
export const YT_STEP = 'youtube';
export const YT_FIELD = 'youtube_refresh_token';

export const youtubeEnv = () => ({ id: process.env.YOUTUBE_CLIENT_ID?.trim() ?? '', secret: process.env.YOUTUBE_CLIENT_SECRET?.trim() ?? '' });
export function youtubeMissing(): string[] { const e = youtubeEnv(); return [e.id ? '' : 'YOUTUBE_CLIENT_ID', e.secret ? '' : 'YOUTUBE_CLIENT_SECRET'].filter(Boolean); }

const stateKey = () => new TextEncoder().encode(`yt-state:${process.env.YOUTUBE_CLIENT_SECRET ?? ''}`);
export const redirectUri = (origin: string) => `${origin.replace(/\/+$/, '')}/api/youtube/oauth/callback`;

export async function signState(orgId: string, userId: string): Promise<string> {
  return new SignJWT({ orgId, userId }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').setIssuedAt().sign(stateKey());
}
export async function verifyState(state: string): Promise<{ orgId: string; userId: string } | null> {
  try { const { payload } = await jwtVerify(state, stateKey(), { algorithms: ['HS256'] }); return typeof payload.orgId === 'string' && typeof payload.userId === 'string' ? { orgId: payload.orgId, userId: payload.userId } : null; } catch { return null; }
}

/** access_type=offline + prompt=consent so Google always returns a refresh token. */
export function authUrl(origin: string, state: string): string {
  const q = new URLSearchParams({ client_id: youtubeEnv().id, redirect_uri: redirectUri(origin), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'false', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

const tokenFetch = () => allowlistedFetch('youtube', { timeoutMs: 20_000 });
export class ReauthNeeded extends Error { constructor() { super('YouTube access was revoked or expired. Reconnect the channel.'); } }

export async function exchangeCode(origin: string, code: string): Promise<{ refreshToken: string; accessToken: string } | { error: string }> {
  const { id, secret } = youtubeEnv();
  const res = await tokenFetch()('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(origin), grant_type: 'authorization_code' }) });
  const j = (await res.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; error?: string };
  if (!res.ok || !j.access_token) return { error: `Google rejected the code (${j.error ?? res.status}).` };
  if (!j.refresh_token) return { error: 'Google returned no refresh token. Remove the app at myaccount.google.com/permissions and connect again.' };
  return { refreshToken: j.refresh_token, accessToken: j.access_token };
}

export async function accessTokenFor(refreshToken: string): Promise<string> {
  const { id, secret } = youtubeEnv();
  const res = await tokenFetch()('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: 'refresh_token' }) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (res.ok && j.access_token) return j.access_token;
  if (j.error === 'invalid_grant') throw new ReauthNeeded();
  throw new Error(`Google token refresh failed (${j.error ?? res.status}).`);
}

/** Access token for an org via the secrets broker (the refresh token never leaves this call). */
export async function orgAccessToken(orgId: string): Promise<{ status: 'ok'; token: string } | { status: 'not_configured'; missing: string[] } | { status: 'reauth' } | { status: 'error'; message: string }> {
  const miss = youtubeMissing(); if (miss.length) return { status: 'not_configured', missing: miss };
  const r = await readSecret({ orgId, purpose: 'job', worker: 'youtube-engine' }, { stepId: YT_STEP, fieldId: YT_FIELD });
  if (r.status === 'not_configured') return r;
  if (r.status === 'missing_secret') return { status: 'reauth' };
  if (r.status === 'error') return { status: 'error', message: r.message };
  try { return { status: 'ok', token: await accessTokenFor(r.value) }; }
  catch (e) { return e instanceof ReauthNeeded ? { status: 'reauth' } : { status: 'error', message: e instanceof Error ? e.message : 'token refresh failed' }; }
}

export async function myChannel(accessToken: string): Promise<{ id: string; title: string } | null> {
  const res = await allowlistedFetch('youtube', { timeoutMs: 20_000 })('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const j = (await res.json()) as { items?: { id: string; snippet?: { title?: string } }[] };
  const c = j.items?.[0];
  return c ? { id: c.id, title: c.snippet?.title ?? c.id } : null;
}
