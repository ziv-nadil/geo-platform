import 'server-only';
import { withService } from '../db';
import { safeFetch } from '../net/safe-fetch';
import { result, str, type Check, type Tester } from './types';

async function reachable(url: string): Promise<{ ok: boolean; status: number | null; finalHost: string | null; detail: string }> {
  try {
    const r = await safeFetch(url, { integration: 'scrape', method: 'GET', headers: { 'user-agent': 'GEOEngine-ConnectionTest/1.0' }, maxBytes: 2 * 1024 * 1024 });
    return { ok: r.ok, status: r.status, finalHost: new URL(r.url).hostname, detail: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, status: null, finalHost: null, detail: e instanceof Error ? e.message : 'unreachable' };
  }
}

const bareHost = (h: string) => h.replace(/^www\./, '').toLowerCase();

export const company: Tester = async (ctx) => {
  const site = str(ctx.data.website_url);
  if (!site) return result([], ['website_url']);
  const checks: Check[] = [];
  const missing: string[] = [];
  const r = await reachable(site);
  const sameDomain = r.finalHost ? bareHost(r.finalHost) === bareHost(new URL(site).hostname) : false;
  checks.push({ id: 'company_site_reachable', label: 'Website reachable', ok: r.ok && sameDomain, detail: r.ok && !sameDomain ? `redirects to ${r.finalHost}` : r.status === 403 ? 'HTTP 403: bot protection blocks us' : r.detail });

  const kinds = await withService((sql) => sql`select kind::text as kind, filename from public.brand_assets where org_id = ${ctx.orgId}`);
  const logos = kinds.filter((k) => k.kind === 'logo').length;
  checks.push({ id: 'company_assets_valid', label: 'Brand assets uploaded', ok: logos >= 2, detail: `${logos} logo file(s), ${kinds.length} asset(s) total` });
  if (logos < 2) missing.push('Logos for light and dark backgrounds');

  const socials = Object.entries(ctx.data).filter(([k, v]) => k.startsWith('social_') && str(v));
  if (socials.length) {
    const bad: string[] = [];
    for (const [k, v] of socials) {
      const host = new URL(String(v)).hostname;
      if (/linkedin\.com|instagram\.com/.test(host)) continue; // block unauthenticated checks: reported as not verifiable
      const s = await reachable(String(v));
      if (!s.ok) bad.push(`${k.replace('social_', '')} (${s.detail})`);
    }
    checks.push({ id: 'company_socials_resolve', label: 'Social profiles resolve', ok: bad.length === 0, detail: bad.length ? `not reachable: ${bad.join(', ')}` : `${socials.length} checked (LinkedIn/Instagram cannot be verified without login)` });
  }
  return result(checks, missing);
};

export const brandBook: Tester = async (ctx) => {
  const d = ctx.data;
  const icps = Array.isArray(d.icp_profiles) ? (d.icp_profiles as Record<string, unknown>[]) : [];
  const comps = Array.isArray(d.competitors) ? (d.competitors as Record<string, unknown>[]) : [];
  const problems: string[] = [];
  if (!str(d.company_description)) problems.push('company description');
  if (icps.length < 3) problems.push(`${icps.length}/3 ICP profiles`);
  icps.forEach((p, i) => { const n = Array.isArray(p.personas) ? p.personas.length : 0; if (n < 2) problems.push(`ICP ${i + 1} has ${n} persona(s)`); });
  if (comps.length < 5) problems.push(`${comps.length}/5 competitors`);
  if (!str(d.msg_one_liner)) problems.push('one-liner');
  if (!str(d.msg_main)) problems.push('main message');
  if (!str(d.voice_say) || !str(d.voice_dont_say)) problems.push('voice lists');
  const checks: Check[] = [{ id: 'brand_complete', label: 'Brand book complete', ok: problems.length === 0, detail: problems.length ? `incomplete: ${problems.join('; ')}` : 'all sections present' }];
  const urls = comps.map((c) => str(c.competitor_website)).filter((u): u is string => !!u);
  if (urls.length) {
    const down: string[] = [];
    for (const u of urls) { const r = await reachable(u); if (!r.ok) down.push(`${u} (${r.detail})`); }
    checks.push({ id: 'brand_competitors_reachable', label: 'Competitor sites reachable', ok: down.length === 0, detail: down.length ? down.join('; ') : `${urls.length} reachable` });
  }
  return result(checks, problems);
};

export const accessMethod: Tester = async (ctx) => {
  const m = str(ctx.data.access_method);
  if (!m) return result([], ['access_method']);
  const checks: Check[] = [{ id: 'access_method_recorded', label: 'Access method chosen', ok: m === 'agency_email' || m === 'domain_user', detail: m }];
  if (m === 'domain_user') {
    const email = str(ctx.data.domain_user_email);
    const site = str(ctx.allData.company?.website_url);
    const same = !!email && !!site && email.split('@')[1]?.toLowerCase() === bareHost(new URL(site).hostname);
    checks.push({ id: 'access_user_credentials_stored', label: 'Domain user recorded', ok: same, detail: same ? 'email domain matches the website' : 'email domain does not match the company website' });
    return result(checks, ['Password/TOTP are stored by GEO Engine staff in the -logins vault (not via the wizard)']);
  }
  return result(checks);
};

export const review: Tester = async (ctx) => {
  const rows = await withService((sql) => sql`
    select distinct on (step_id) step_id, status::text as status from public.integration_tests
    where org_id = ${ctx.orgId} order by step_id, created_at desc`);
  const failing = rows.filter((r) => r.status === 'fail').map((r) => r.step_id as string);
  const partial = rows.filter((r) => r.status === 'partial').map((r) => r.step_id as string);
  return result([{ id: 'review_all_required_green', label: 'All required tests pass', ok: failing.length === 0 && partial.length === 0,
    detail: `${rows.length} steps tested; failing: ${failing.join(', ') || 'none'}; partial (needs staff acceptance): ${partial.join(', ') || 'none'}` }], [...failing, ...partial].map((s) => `step ${s}`));
};
