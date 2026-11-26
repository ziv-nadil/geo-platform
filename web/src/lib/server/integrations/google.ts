import 'server-only';
import { importPKCS8, SignJWT } from 'jose';
import { safeJson } from '../net/safe-fetch';

/** Access token for our agency Google identity (OAuth refresh token; GSC, GA4). */
export async function agencyGoogleToken(): Promise<{ token: string } | { missing: string[] } | { error: string }> {
  const need = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AGENCY_GOOGLE_REFRESH_TOKEN'];
  const missing = need.filter((n) => !process.env[n]);
  if (missing.length) return { missing };
  const res = await safeJson<{ access_token?: string; error?: string }>('https://oauth2.googleapis.com/token', {
    integration: 'google',
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.AGENCY_GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }).toString(),
  });
  return res.data?.access_token ? { token: res.data.access_token } : { error: `token exchange failed (${res.status} ${res.data?.error ?? ''})` };
}

/** Access token for a client's service account JSON key (JWT bearer grant). */
export async function serviceAccountToken(keyJson: string, scopes: string[]): Promise<{ token: string; clientEmail: string; projectId: string | null } | { error: string }> {
  let key: { client_email?: string; private_key?: string; project_id?: string };
  try {
    key = JSON.parse(keyJson);
  } catch {
    return { error: 'service account JSON is malformed' };
  }
  if (!key.client_email || !key.private_key) return { error: 'service account JSON lacks client_email/private_key' };
  try {
    const pk = await importPKCS8(key.private_key, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: scopes.join(' ') })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(key.client_email).setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now).setExpirationTime(now + 600).sign(pk);
    const res = await safeJson<{ access_token?: string; error_description?: string }>('https://oauth2.googleapis.com/token', {
      integration: 'google',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.data?.access_token) return { error: `key rejected (${res.status} ${res.data?.error_description ?? ''})` };
    return { token: res.data.access_token, clientEmail: key.client_email, projectId: key.project_id ?? null };
  } catch {
    return { error: 'could not sign with the private key' };
  }
}

export const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
