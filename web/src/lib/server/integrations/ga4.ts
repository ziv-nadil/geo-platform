import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { agencyGoogleToken, bearer } from './google';
import { errDetail, result, str, type Check, type Tester } from './types';

export const test: Tester = async (ctx) => {
  const pid = str(ctx.data.ga4_property_id);
  const keyEvent = str(ctx.data.ga4_key_event);
  if (!pid || !/^\d+$/.test(pid)) return result([], ['ga4_property_id (digits)']);
  const t = await agencyGoogleToken();
  if ('missing' in t) return result([], t.missing, true);
  if ('error' in t) return result([{ id: 'ga4_property_access', label: 'Property accessible', ok: false, detail: t.error }]);
  const h = bearer(t.token);
  const checks: Check[] = [];
  const missing: string[] = [];
  try {
    const acc = await safeJson<{ accountSummaries?: { propertySummaries?: { property: string }[] }[] }>('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', { integration: 'google', headers: h });
    const found = !!acc.data?.accountSummaries?.some((a) => a.propertySummaries?.some((p) => p.property === `properties/${pid}`));
    checks.push({ id: 'ga4_property_access', label: 'Property accessible', ok: found, detail: found ? `properties/${pid}` : acc.ok ? 'Not shared with us or wrong ID' : `HTTP ${acc.status}` });
    if (!found) return result(checks, ['GA4 access for our agency identity']);

    const agencyEmail = process.env.AGENCY_GOOGLE_EMAIL;
    const ab = await safeJson<{ accessBindings?: { user?: string; roles?: string[] }[] }>(`https://analyticsadmin.googleapis.com/v1alpha/properties/${pid}/accessBindings`, { integration: 'google', headers: h });
    if (!agencyEmail) missing.push('AGENCY_GOOGLE_EMAIL (to locate our access binding)');
    else {
      const mine = ab.data?.accessBindings?.find((b) => b.user?.toLowerCase() === agencyEmail.toLowerCase());
      const editor = !!mine?.roles?.some((r) => r === 'predefinedRoles/editor' || r === 'predefinedRoles/admin');
      checks.push({ id: 'ga4_role_editor', label: 'Editor role', ok: editor, detail: !ab.ok ? `HTTP ${ab.status} (bindings need Admin to list; access may be inherited from the account)` : editor ? 'Editor' : `GA4 access is ${mine?.roles?.join(', ') ?? 'not property-level'}, not Editor` });
    }
    if (keyEvent) {
      const ke = await safeJson<{ keyEvents?: { eventName: string }[] }>(`https://analyticsadmin.googleapis.com/v1beta/properties/${pid}/keyEvents`, { integration: 'google', headers: h });
      const names = ke.data?.keyEvents?.map((k) => k.eventName) ?? [];
      const ok = names.includes(keyEvent);
      checks.push({ id: 'ga4_key_event_exists', label: 'Key event exists', ok, detail: ok ? keyEvent : ke.ok ? `"${keyEvent}" is not a key event (found: ${names.slice(0, 5).join(', ') || 'none'})` : `HTTP ${ke.status}` });
      const rep = await safeJson<{ rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]; totals?: unknown }>(`https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`, {
        integration: 'google', method: 'POST', headers: { ...h, 'content-type': 'application/json' },
        body: JSON.stringify({ dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }, { name: 'sessions' }], limit: 1000 }) });
      const rows = rep.data?.rows ?? [];
      const sessions = rows.reduce((a, r) => a + Number(r.metricValues[1]?.value ?? 0), 0);
      const kc = Number(rows.find((r) => r.dimensionValues[0]?.value === keyEvent)?.metricValues[0]?.value ?? 0);
      checks.push({ id: 'ga4_data_flowing', label: 'Data is flowing', ok: rep.ok && sessions > 0 && kc > 0, detail: rep.ok ? `${sessions} sessions, ${kc} × ${keyEvent} in 28 days` : `HTTP ${rep.status}` });
    } else missing.push('ga4_key_event');
  } catch (e) {
    checks.push({ id: 'ga4_property_access', label: 'Property accessible', ok: false, detail: errDetail(e) });
  }
  return result(checks, missing);
};
