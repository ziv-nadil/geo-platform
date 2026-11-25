import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { errDetail, result, type Check, type Tester } from './types';

const PROBES: Record<string, (key: string) => Promise<{ ok: boolean; detail: string }>> = {
  ahrefs: async (k) => { const r = await safeJson('https://api.ahrefs.com/v3/subscription-info/limits-and-usage', { integration: 'analytics', headers: { authorization: `Bearer ${k}` } }); return { ok: r.ok, detail: r.ok ? 'key valid' : `HTTP ${r.status}` }; },
  semrush: async (k) => { const r = await safeJson(`https://www.semrush.com/users/countapiunits.html?key=${encodeURIComponent(k)}`, { integration: 'analytics' }); const units = Number(r.text); return { ok: r.ok && units > 0, detail: r.ok ? (Number.isFinite(units) ? `${units} API units left` : 'unexpected response') : `HTTP ${r.status}` }; },
  similarweb: async (k) => { const r = await safeJson('https://api.similarweb.com/v1/user-capabilities', { integration: 'analytics', headers: { 'api-key': k } }); return { ok: r.ok, detail: r.ok ? 'key valid' : `HTTP ${r.status}` }; },
};

/** analytics_key_valid per API-key row; seat rows need a human confirmation (analytics_seat_accepted). */
export const test: Tester = async (ctx) => {
  const rows = Array.isArray(ctx.data.analytics_credentials) ? (ctx.data.analytics_credentials as Record<string, unknown>[]) : [];
  if (!rows.length) return result([], ['analytics_credentials']);
  const checks: Check[] = [];
  const missing: string[] = [];
  for (const [i, row] of rows.entries()) {
    const tool = String(row.tool ?? 'other');
    if (row.access_type === 'seat') { missing.push(`${tool}: seat invitation is confirmed manually`); continue; }
    const probe = PROBES[tool];
    if (!probe) { missing.push(`${tool}: no documented key-check endpoint yet (verified manually)`); continue; }
    const key = await ctx.secret(`analytics_credentials_${i}_api_key`);
    if (!key) { missing.push(`${tool}: API key not stored`); continue; }
    try {
      const r = await probe(key);
      checks.push({ id: 'analytics_key_valid', label: `${tool} API key valid`, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ id: 'analytics_key_valid', label: `${tool} API key valid`, ok: false, detail: errDetail(e) });
    }
  }
  return result(checks, missing);
};
