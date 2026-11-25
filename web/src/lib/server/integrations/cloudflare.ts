import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { errDetail, result, str, type Check, type Tester } from './types';

const API = 'https://api.cloudflare.com/client/v4';
const BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot', 'Google-Extended'];

export const test: Tester = async (ctx) => {
  if (str(ctx.data.cdn_provider) !== 'cloudflare') return result([], ['Only Cloudflare is tested automatically'], true);
  const zone = str(ctx.data.cf_zone_name);
  const token = await ctx.secret('cf_api_token');
  if (!token) return result([], ['cf_api_token (stored secret)'], true);
  const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const checks: Check[] = [];
  const missing: string[] = [];
  try {
    const v = await safeJson<{ result?: { status?: string } }>(`${API}/user/tokens/verify`, { integration: 'cloudflare', headers: h });
    const active = v.data?.result?.status === 'active';
    checks.push({ id: 'cf_token_valid', label: 'Token valid and active', ok: active, detail: active ? 'active' : `HTTP ${v.status} ${v.data?.result?.status ?? ''}` });
    if (!active || !zone) return result(checks, zone ? [] : ['cf_zone_name']);
    const z = await safeJson<{ result?: { id: string; status: string }[] }>(`${API}/zones?name=${encodeURIComponent(zone)}`, { integration: 'cloudflare', headers: h });
    const zr = z.data?.result?.[0];
    checks.push({ id: 'cf_zone_access', label: 'Zone access', ok: zr?.status === 'active', detail: zr ? `zone ${zr.status}` : 'Token not scoped to this zone' });
    if (zr) {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const gql = await safeJson<{ data?: { viewer?: { zones?: { httpRequestsAdaptiveGroups?: { count: number }[] }[] } }; errors?: { message: string }[] }>(`${API}/graphql`, {
        integration: 'cloudflare', method: 'POST', headers: h,
        body: JSON.stringify({
          query: `query($zone: String!, $since: Time!) { viewer { zones(filter: { zoneTag: $zone }) {
            httpRequestsAdaptiveGroups(limit: 10, filter: { datetime_get: $since, OR: [${BOTS.map((b) => `{ userAgent_like: "%${b}%" }`).join(', ')}] }) { count } } } }`,
          variables: { zone: zr.id, since },
        }) });
      const groups = gql.data?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
      const hits = groups?.reduce((a, g) => a + g.count, 0) ?? 0;
      const err = gql.data?.errors?.[0]?.message;
      checks.push({ id: 'cf_analytics', label: 'Analytics readable', ok: !!groups && hits > 0, detail: err ? err.slice(0, 160) : groups ? `${hits} AI-crawler requests in 24 h` : `HTTP ${gql.status}` });
      missing.push('cf_ai_crawl_control: endpoint not confirmed yet (security/product to confirm the REST path)');
    }
  } catch (e) {
    checks.push({ id: 'cf_token_valid', label: 'Token valid and active', ok: false, detail: errDetail(e) });
  }
  return result(checks, missing);
};
