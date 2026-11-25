import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { agencyGoogleToken, bearer } from './google';
import { errDetail, result, str, type Check, type Tester } from './types';

export const test: Tester = async (ctx) => {
  const property = str(ctx.data.gsc_property);
  if (!property) return result([], ['gsc_property']);
  const t = await agencyGoogleToken();
  if ('missing' in t) return result([], t.missing, true);
  if ('error' in t) return result([{ id: 'gsc_property_visible', label: 'Property visible to us', ok: false, detail: t.error }]);
  const checks: Check[] = [];
  const missing: string[] = [];
  try {
    const sites = await safeJson<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>('https://www.googleapis.com/webmasters/v3/sites', { integration: 'google', headers: bearer(t.token) });
    const entry = sites.data?.siteEntry?.find((s) => s.siteUrl === property);
    checks.push({ id: 'gsc_property_visible', label: 'Property visible to us', ok: !!entry, detail: entry ? `${property} found` : sites.ok ? 'Property not in our list: user not added or wrong property type' : `HTTP ${sites.status}` });
    if (entry) {
      const owner = entry.permissionLevel === 'siteOwner';
      const label = { siteFullUser: 'Full', siteRestrictedUser: 'Restricted', siteUnverifiedUser: 'Unverified' }[entry.permissionLevel] ?? entry.permissionLevel;
      checks.push({ id: 'gsc_owner_level', label: 'Owner permission level', ok: owner, detail: owner ? 'Owner' : `GSC access is ${label}, not Owner` });
      if (!owner) missing.push('Owner permission in Search Console');
      const end = new Date(); const start = new Date(end.getTime() - 7 * 86_400_000);
      const q = await safeJson<{ rows?: unknown[] }>(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
        integration: 'google', method: 'POST', headers: { ...bearer(t.token), 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), dimensions: ['query'], rowLimit: 5 }) });
      const rows = q.data?.rows?.length ?? 0;
      checks.push({ id: 'gsc_data_flowing', label: 'Search data available', ok: q.ok && rows > 0, detail: q.ok ? `${rows} rows in the last 7 days` : `HTTP ${q.status}` });
    }
  } catch (e) {
    checks.push({ id: 'gsc_property_visible', label: 'Property visible to us', ok: false, detail: errDetail(e) });
  }
  return result(checks, missing);
};
