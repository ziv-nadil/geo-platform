import 'server-only';
import { withService } from '../db';
import { safeFetch } from '../net/safe-fetch';
import {
  analyzeHtml, analyzeLlms, analyzePsi, analyzeRobots, analyzeSitemap, analyzeWaf, botUserAgent, BROWSER_UA, extractHtmlFacts, overallScore, parseSitemap,
  WAF_PROBE_BOTS, type AuditCheck, type ProbeResult,
} from './analyze';
import { buildFixes, detectPlatform, normalizePlatform, type Fix, type Platform } from './report';

export type GeoAudit = { id?: string; url: string; platform: Platform | null; score: number; checks: AuditCheck[]; fixes: Fix[]; createdAt?: string };

type Got = { status: number | null; body: string | null; headers: Record<string, string>; bytes: number; finalUrl: string | null; error?: string };

async function get(url: string, ua = BROWSER_UA, maxBytes = 2 * 1024 * 1024, timeoutMs = 12_000): Promise<Got> {
  try {
    const r = await safeFetch(url, { integration: 'scrape', method: 'GET', headers: { 'user-agent': ua, accept: 'text/html,text/plain,application/xml,*/*' }, maxBytes, timeoutMs });
    const body = await r.text();
    return { status: r.status, body, headers: Object.fromEntries(r.headers.entries()), bytes: Buffer.byteLength(body), finalUrl: r.url };
  } catch (e) {
    return { status: null, body: null, headers: {}, bytes: 0, finalUrl: null, error: e instanceof Error ? e.message : 'failed' };
  }
}

async function psi(url: string): Promise<{ lcp: number | null; cls: number | null; inp: number | null; ttfb: number | null } | null> {
  const key = process.env.PAGESPEED_API_KEY?.trim();
  const q = new URLSearchParams({ url, strategy: 'mobile', category: 'performance' });
  if (key) q.set('key', key);
  try {
    const r = await safeFetch(`https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { integration: 'google', timeoutMs: 14_000, maxBytes: 4 * 1024 * 1024 });
    if (!r.ok) return null;
    const j = (await r.json()) as { loadingExperience?: { metrics?: Record<string, { percentile?: number }> }; lighthouseResult?: { audits?: Record<string, { numericValue?: number }> } };
    const f = j.loadingExperience?.metrics ?? {};
    const a = j.lighthouseResult?.audits ?? {};
    const num = (v: number | undefined | null) => (typeof v === 'number' ? v : null);
    const cls = f.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
    return {
      lcp: num(f.LARGEST_CONTENTFUL_PAINT_MS?.percentile) ?? num(a['largest-contentful-paint']?.numericValue),
      cls: cls !== undefined ? cls / 100 : num(a['cumulative-layout-shift']?.numericValue),
      inp: num(f.INTERACTION_TO_NEXT_PAINT?.percentile),
      ttfb: num(f.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile) ?? num(a['server-response-time']?.numericValue),
    };
  } catch {
    return null;
  }
}

const probe = async (name: string, url: string, ua: string): Promise<ProbeResult> => {
  const r = await get(url, ua, 1024 * 1024, 10_000);
  return { name, status: r.status, bytes: r.bytes, error: r.error };
};

/** Run every check against the live site. `platformHint` is the CMS the client selected in onboarding. */
export async function runGeoAudit(rawUrl: string, platformHint?: string | null): Promise<GeoAudit> {
  const origin = new URL(rawUrl).origin;
  const base = origin + '/';
  const [home, robotsRes, llmsRes, llmsFull] = await Promise.all([get(base), get(`${origin}/robots.txt`), get(`${origin}/llms.txt`), get(`${origin}/llms-full.txt`)]);
  const checks: AuditCheck[] = [];
  const { checks: rc, robots } = analyzeRobots(robotsRes.body, robotsRes.status);
  checks.push(...rc, ...analyzeLlms(llmsRes, llmsFull));

  const sitemapUrl = robots?.sitemaps[0] ?? `${origin}/sitemap.xml`;
  const sm = await get(sitemapUrl, BROWSER_UA, 5 * 1024 * 1024);
  let sample: string[] = [];
  let extraUrls = 0;
  if (sm.body && sm.status && sm.status < 400) {
    const parsed = parseSitemap(sm.body);
    let locs = parsed.locs;
    if (parsed.kind === 'index' && locs[0]) {
      const child = await get(locs.find((l) => /post|blog|article|page/i.test(l)) ?? locs[0]!, BROWSER_UA, 5 * 1024 * 1024);
      const c = child.body ? parseSitemap(child.body) : null;
      extraUrls = c?.locs.length ?? 0;
      locs = c?.locs ?? [];
      if (c) sm.body = sm.body.replace('</sitemapindex>', c.lastmods.map((d) => `<url><lastmod>${d.toISOString()}</lastmod></url>`).join('') + '</sitemapindex>');
    }
    sample = locs;
  }
  checks.push(...analyzeSitemap({ declared: !!robots?.sitemaps.length, url: sitemapUrl, status: sm.status, xml: sm.body, extraUrls }));

  const page = home.body ?? '';
  const homeUrl = home.finalUrl ?? base;
  const platform: Platform | null = normalizePlatform(platformHint) ?? detectPlatform(home.headers, page);
  if (home.status === null || home.status >= 400) {
    checks.push({ id: 'reachable', label: 'Homepage reachable', category: 'Crawl access', score: 0, status: 'fail', weight: 10, detail: `Homepage returned ${home.status ?? home.error ?? 'no response'}.` });
  } else {
    const http = origin.startsWith('https:') ? await safeFetch(origin.replace('https:', 'http:') + '/', { integration: 'scrape', allowHttp: true, maxRedirects: 0, timeoutMs: 8000, method: 'GET' }).then((r) => (r.status >= 300 && r.status < 400 ? (r.headers.get('location') ?? '').startsWith('https:') : false)).catch(() => null) : null;
    const hc = analyzeHtml(extractHtmlFacts(page, homeUrl, home.headers), homeUrl, { isHttps: new URL(homeUrl).protocol === 'https:', httpRedirectsToHttps: http });
    const articleUrl = sample.find((u) => /\/(blog|post|posts|article|articles|news|insights)\//i.test(u)) ?? (sample.length > 1 ? sample[1] : undefined);
    const art = articleUrl && articleUrl !== homeUrl ? await get(articleUrl) : null;
    if (art?.body && art.status && art.status < 400) {
      const ac = analyzeHtml(extractHtmlFacts(art.body, articleUrl!, art.headers), articleUrl!, { isHttps: true, httpRedirectsToHttps: null });
      for (const id of ['schema_content', 'headings', 'author_date', 'ssr']) {
        const i = hc.findIndex((c) => c.id === id);
        const a = ac.find((c) => c.id === id);
        if (i >= 0 && a) hc[i] = { ...a, detail: `${a.detail} (checked on ${articleUrl})` };
      }
    }
    checks.push(...hc);
  }

  const [bro, ...bots] = await Promise.all([probe('browser', base, BROWSER_UA), ...WAF_PROBE_BOTS.map((b) => probe(b, base, botUserAgent(b)))]);
  checks.push(analyzeWaf(bro!, bots));
  checks.push(...analyzePsi(await psi(homeUrl)));

  const fixes = buildFixes(checks, platform);
  return { url: origin, platform, score: overallScore(checks), checks, fixes };
}

export async function saveGeoAudit(orgId: string, a: GeoAudit, userId: string | null): Promise<GeoAudit> {
  const rows = await withService((sql) => sql`
    insert into public.geo_audits (org_id, url, platform, score, checks, fixes, triggered_by)
    values (${orgId}, ${a.url}, ${a.platform}, ${a.score}, ${sql.json(a.checks as never)}, ${sql.json(a.fixes as never)}, ${userId})
    returning id, created_at`);
  return { ...a, id: rows[0]!.id as string, createdAt: new Date(rows[0]!.created_at as string).toISOString() };
}

export async function latestGeoAudit(orgId: string): Promise<GeoAudit | null> {
  const rows = await withService((sql) => sql`select id, url, platform, score, checks, fixes, created_at from public.geo_audits where org_id = ${orgId} order by created_at desc limit 1`);
  const r = rows[0];
  return r ? { id: r.id as string, url: r.url as string, platform: r.platform as Platform | null, score: r.score as number, checks: r.checks as AuditCheck[], fixes: r.fixes as Fix[], createdAt: new Date(r.created_at as string).toISOString() } : null;
}

/** Audit the org's saved website, store and return the result. Platform comes from the CMS onboarding answer. */
export async function runAndSaveForOrg(orgId: string, userId: string | null): Promise<GeoAudit | { error: string }> {
  const rows = await withService((sql) => sql`select step_id, data from public.onboarding_progress where org_id = ${orgId} and step_id in ('company','cms')`);
  const by = Object.fromEntries(rows.map((r) => [r.step_id as string, (r.data ?? {}) as Record<string, unknown>]));
  const site = typeof by.company?.website_url === 'string' ? by.company.website_url.trim() : '';
  if (!site) return { error: 'Add your primary website in Company info first.' };
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`); } catch { return { error: 'The saved website URL is not valid.' }; }
  const a = await runGeoAudit(u.toString(), typeof by.cms?.cms_platform === 'string' ? by.cms.cms_platform : null);
  return saveGeoAudit(orgId, a, userId);
}
