/**
 * Hourly Cloudflare GraphQL poll of AI-crawler traffic into public.crawler_hits
 * (docs/research/ai-engine-methodology.md section 7.2). Per-org zone-scoped token comes from the
 * secrets broker by reference (step 'cdn_crawlers', field 'cf_api_token').
 *
 * Window: [last_until, floor(now to the hour)), at most 24 h. The window is replaced atomically
 * (delete + insert) so re-runs are idempotent.
 */
import { allowlistedFetch } from '../http';
import type { Sql } from '../pipeline/db';
import { classifyBot, userAgentFilters } from './bots';
import { BrokerNotConfiguredError, getSecretBroker, type SecretBroker } from './broker';

const API = 'https://api.cloudflare.com/client/v4';
const MAX_WINDOW_MS = 24 * 3600_000;
const STEP_IDS = ['cdn_crawlers', 'cloudflare'];

export const CRAWLER_QUERY = `query AiCrawlers($zone: String!, $since: Time!, $until: Time!, $uas: [ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!]) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptiveGroups(limit: 10000, orderBy: [count_DESC],
      filter: { datetime_geq: $since, datetime_lt: $until, OR: $uas }) {
      count
      sum { edgeResponseBytes }
      dimensions { datetimeHour userAgent clientRequestPath edgeResponseStatus }
    }
  } }
}`;

export interface CfGroup {
  count?: number;
  sum?: { edgeResponseBytes?: number };
  dimensions?: { datetimeHour?: string; userAgent?: string; clientRequestPath?: string; edgeResponseStatus?: number };
}

export interface CrawlerRow {
  ts: string;
  bot: string;
  bot_operator: string;
  path: string;
  status: number | null;
  hits: number;
}

/** Pure: GraphQL groups -> rows aggregated by (hour, bot, path, status). Non-AI UAs dropped. */
export function toCrawlerRows(groups: readonly CfGroup[]): CrawlerRow[] {
  const agg = new Map<string, CrawlerRow>();
  for (const g of groups) {
    const d = g.dimensions ?? {};
    const info = classifyBot(d.userAgent ?? '');
    if (!info || !d.datetimeHour) continue;
    const path = (d.clientRequestPath ?? '/').slice(0, 2000);
    const status = typeof d.edgeResponseStatus === 'number' ? d.edgeResponseStatus : null;
    const key = `${d.datetimeHour}|${info.bot}|${path}|${status}`;
    const row = agg.get(key) ?? { ts: d.datetimeHour, bot: info.bot, bot_operator: info.operator, path, status, hits: 0 };
    row.hits += g.count ?? 0;
    agg.set(key, row);
  }
  return [...agg.values()];
}

export function pollWindow(lastUntil: string | null, now: Date): { since: Date; until: Date } | null {
  const until = new Date(Math.floor(now.getTime() / 3600_000) * 3600_000);
  const earliest = new Date(until.getTime() - MAX_WINDOW_MS);
  let since = lastUntil ? new Date(lastUntil) : new Date(until.getTime() - 3600_000);
  if (Number.isNaN(since.getTime()) || since < earliest) since = earliest;
  return since < until ? { since, until } : null;
}

async function cf<T>(f: typeof fetch, token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await f(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`cloudflare HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface CrawlerOrgReport {
  orgId: string;
  status: 'ok' | 'skipped' | 'error' | 'not_configured';
  detail?: string;
  rows?: number;
  window?: { since: string; until: string };
}

export async function pollCloudflare(
  sql: Sql,
  opts: { now?: Date; broker?: SecretBroker; fetchImpl?: typeof fetch; jobId?: string } = {},
): Promise<CrawlerOrgReport[]> {
  const now = opts.now ?? new Date();
  const broker = opts.broker ?? getSecretBroker();
  const f = allowlistedFetch('cloudflare', { timeoutMs: 30_000, fetchImpl: opts.fetchImpl });
  const orgs = await sql<{ org_id: string; step_id: string; zone_name: string | null }[]>`
    select r.org_id, r.step_id, op.data->>'cf_zone_name' as zone_name
    from public.secret_refs r
    join public.organizations o on o.id = r.org_id and o.status in ('active', 'onboarding')
    left join public.onboarding_progress op on op.org_id = r.org_id and op.step_id = r.step_id
    where r.step_id in ${sql(STEP_IDS)} and r.field_id = 'cf_api_token'`;

  const reports: CrawlerOrgReport[] = [];
  for (const o of orgs) {
    if (!o.zone_name) {
      reports.push({ orgId: o.org_id, status: 'skipped', detail: 'cf_zone_name missing in onboarding data' });
      continue;
    }
    const stateKey = `crawlers:cloudflare:${o.org_id}`;
    const [state] = await sql<{ value: { last_until?: string; zone_id?: string; zone_name?: string } }[]>`
      select value from public.pipeline_state where key = ${stateKey}`;
    const win = pollWindow(state?.value.last_until ?? null, now);
    if (!win) {
      reports.push({ orgId: o.org_id, status: 'skipped', detail: 'window already polled' });
      continue;
    }
    let secret;
    try {
      secret = await broker.get({ orgId: o.org_id, purpose: 'crawler_poll', jobId: opts.jobId ?? `crawlers-${now.toISOString()}` }, { stepId: o.step_id, fieldId: 'cf_api_token' });
    } catch (err) {
      reports.push({
        orgId: o.org_id,
        status: err instanceof BrokerNotConfiguredError ? 'not_configured' : 'error',
        detail: err instanceof BrokerNotConfiguredError ? 'secrets broker not wired (registerSecretBroker)' : 'broker read failed',
      });
      continue;
    }
    if (!secret) {
      reports.push({ orgId: o.org_id, status: 'skipped', detail: 'no Cloudflare token for org' });
      continue;
    }
    try {
      let zoneId = state?.value.zone_name === o.zone_name ? state?.value.zone_id : undefined;
      if (!zoneId) {
        const z = await cf<{ success: boolean; result?: Array<{ id: string }> }>(f, secret.value, `/zones?name=${encodeURIComponent(o.zone_name)}`);
        zoneId = z.result?.[0]?.id;
        if (!zoneId) throw new Error('zone not visible to token');
      }
      const gql = await cf<{ data?: { viewer?: { zones?: Array<{ httpRequestsAdaptiveGroups?: CfGroup[] }> } }; errors?: Array<{ message?: string }> | null }>(
        f,
        secret.value,
        '/graphql',
        {
          method: 'POST',
          body: JSON.stringify({
            query: CRAWLER_QUERY,
            variables: { zone: zoneId, since: win.since.toISOString(), until: win.until.toISOString(), uas: userAgentFilters() },
          }),
        },
      );
      if (gql.errors?.length) throw new Error(`graphql: ${gql.errors.map((e) => e.message).join('; ').slice(0, 300)}`);
      const rows = toCrawlerRows(gql.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? []);
      await sql.begin(async (tx) => {
        await tx`delete from public.crawler_hits where org_id = ${o.org_id} and source = 'cloudflare'
                 and ts >= ${win.since.toISOString()} and ts < ${win.until.toISOString()}`;
        if (rows.length) {
          await tx`insert into public.crawler_hits ${tx(rows.map((r) => ({ ...r, org_id: o.org_id, source: 'cloudflare' })))}`;
        }
        const value = { last_until: win.until.toISOString(), zone_id: zoneId, zone_name: o.zone_name };
        await tx`insert into public.pipeline_state (key, value) values (${stateKey}, ${tx.json(value)})
                 on conflict (key) do update set value = excluded.value, updated_at = now()`;
      });
      reports.push({ orgId: o.org_id, status: 'ok', rows: rows.length, window: { since: win.since.toISOString(), until: win.until.toISOString() } });
    } catch (err) {
      reports.push({ orgId: o.org_id, status: 'error', detail: (err as Error).message.slice(0, 300) });
    } finally {
      secret.dispose();
    }
  }
  return reports;
}
