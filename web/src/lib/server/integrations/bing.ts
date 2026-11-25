import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { errDetail, result, str, type Check, type Tester } from './types';

const BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

export const test: Tester = async (ctx) => {
  const site = str(ctx.data.bing_site_url);
  if (!site) return result([], ['bing_site_url']);
  const key = (await ctx.secret('bing_api_key')) ?? process.env.AGENCY_BING_API_KEY ?? null;
  if (!key) return result([], ['bing_api_key (stored) or AGENCY_BING_API_KEY'], true);
  const q = (m: string, extra = '') => `${BASE}/${m}?apikey=${encodeURIComponent(key)}${extra}`;
  const checks: Check[] = [];
  const missing: string[] = [];
  try {
    const sites = await safeJson<{ d?: { Url: string; IsVerified: boolean }[] }>(q('GetUserSites'), { integration: 'bing' });
    const norm = (u: string) => u.replace(/\/+$/, '').toLowerCase();
    const s = sites.data?.d?.find((x) => norm(x.Url) === norm(site));
    checks.push({ id: 'bing_site_listed', label: 'Site listed', ok: !!s?.IsVerified, detail: !sites.ok ? `API key rejected (HTTP ${sites.status})` : !s ? 'Site not in list' : s.IsVerified ? 'verified' : 'listed but not verified' });
    if (s) {
      const roles = await safeJson<{ d?: { Email?: string; Role?: number | string }[] }>(q('GetSiteRoles', `&siteUrl=${encodeURIComponent(site)}&includeAllSubdomains=false`), { integration: 'bing' });
      const agency = process.env.AGENCY_EMAIL?.toLowerCase();
      const mine = roles.data?.d?.find((r) => agency && r.Email?.toLowerCase() === agency);
      const admin = mine ? String(mine.Role) === '0' || /admin/i.test(String(mine.Role)) : false;
      if (!agency) missing.push('AGENCY_EMAIL (to locate our Bing role)');
      else checks.push({ id: 'bing_role_admin', label: 'Administrator role', ok: admin, detail: roles.ok ? (mine ? `role=${mine.Role}` : 'our email has no role on this site') : `HTTP ${roles.status}` });
      const quota = await safeJson<{ d?: { DailyQuota?: number; MonthlyQuota?: number } }>(q('GetUrlSubmissionQuota', `&siteUrl=${encodeURIComponent(site)}`), { integration: 'bing' });
      const d = quota.data?.d;
      checks.push({ id: 'bing_api_quota', label: 'API / URL submission works', ok: !!d && (d.DailyQuota ?? 0) > 0, detail: d ? `daily ${d.DailyQuota}, monthly ${d.MonthlyQuota}` : `HTTP ${quota.status}` });
    }
  } catch (e) {
    checks.push({ id: 'bing_site_listed', label: 'Site listed', ok: false, detail: errDetail(e) });
  }
  return result(checks, missing);
};
