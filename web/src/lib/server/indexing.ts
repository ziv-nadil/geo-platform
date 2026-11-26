import 'server-only';
import { createHmac } from 'node:crypto';
import { withService } from './db';
import { safeFetch, safeJson } from './net/safe-fetch';
import { agencyGoogleToken, bearer } from './integrations/google';

/**
 * Indexing after publish. The Google Indexing API is NOT used (it only supports job-posting and livestream pages).
 *  - Sitemap refresh: Search Console API sitemaps.submit with the agency identity (Google, best effort).
 *  - IndexNow: Bing, Yandex and others. Key = HMAC(INDEXNOW_SECRET, orgId), served at /api/indexnow/<key>
 *    (and /<key>.txt on the client's host, which the client or our Git PR delivers; see docs/research/gsc-request-indexing.md).
 * Everything here is best effort: a failure never fails a publish.
 */
export function indexNowKey(orgId: string): string | null {
  const secret = process.env.INDEXNOW_SECRET;
  return secret ? createHmac('sha256', secret).update(orgId).digest('hex').slice(0, 32) : null;
}

export function isIndexNowKey(orgId: string, key: string): boolean {
  const k = indexNowKey(orgId);
  return !!k && k === key;
}

export async function submitIndexNow(orgId: string, urls: string[]): Promise<{ ok: boolean; detail: string }> {
  const key = indexNowKey(orgId);
  if (!key) return { ok: false, detail: 'INDEXNOW_SECRET not set' };
  const list = urls.filter((u) => /^https:\/\//.test(u));
  if (!list.length) return { ok: false, detail: 'no https urls' };
  const host = new URL(list[0]!).host;
  const same = list.filter((u) => new URL(u).host === host);
  try {
    const res = await safeFetch('https://api.indexnow.org/indexnow', {
      integration: 'bing', method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: same.slice(0, 10_000) }),
    });
    return { ok: res.status === 200 || res.status === 202, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 120) : 'network error' };
  }
}

export async function refreshSitemap(gscProperty: string, sitemapUrl: string): Promise<{ ok: boolean; detail: string }> {
  const t = await agencyGoogleToken();
  if (!('token' in t)) return { ok: false, detail: 'agency Google token unavailable' };
  const r = await safeJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscProperty)}/sitemaps/${encodeURIComponent(sitemapUrl)}`, { integration: 'google', method: 'PUT', headers: bearer(t.token) });
  return { ok: r.ok, detail: `HTTP ${r.status}` };
}

/** Call after a post is delivered. Never throws. */
export async function notifyPublished(orgId: string, postUrl: string): Promise<void> {
  try {
    const [g] = await withService((sql) => sql`select data->>'gsc_property' as p from public.onboarding_progress where org_id = ${orgId} and step_id = 'gsc'`);
    const gscProperty = (g?.p as string | undefined) || null;
    await submitIndexNow(orgId, [postUrl]);
    if (gscProperty) await refreshSitemap(gscProperty, `${new URL(postUrl).origin}/sitemap.xml`);
  } catch { /* best effort */ }
}
