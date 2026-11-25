import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { ACTORS, WINDOW_HOURS, type Platform } from './config';
import { normalizeItem, type SocialItem } from './normalize';

/** Actor input per platform. Public data only: no cookies, no accounts, no logins. Last-24h window where the actor supports one. */
export function buildActorInput(platform: Platform, queries: string[], maxItems: number, now = new Date()): Record<string, unknown> {
  if (platform === 'reddit') {
    return { scrapeMode: 'posts', searchQueries: queries, searchSort: 'new', searchTimeFilter: 'day', maxSearchResultsPerQuery: Math.max(1, Math.ceil(maxItems / Math.max(1, queries.length))), includeNsfw: false };
  }
  if (platform === 'x') {
    const since = new Date(now.getTime() - WINDOW_HOURS * 3600_000).toISOString().slice(0, 10);
    return { searchTerms: queries, sort: 'Latest', maxItems, start: since, includeSearchTerms: false };
  }
  return { searchQueries: queries, maxPosts: Math.max(1, Math.ceil(maxItems / Math.max(1, queries.length))), postedLimit: '24h', sortBy: 'date', scrapeReactions: false, scrapeComments: false };
}

export type ApifyRun =
  | { status: 'ok'; runId: string; items: SocialItem[]; costUsd: number }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; message: string; runId?: string; costUsd?: number };

const BASE = 'https://api.apify.com/v2';
const actorPath = (id: string) => id.replace('/', '~');

/** Start one actor run (hard-capped by maxItems and maxTotalChargeUsd), wait for it, read the real cost from the run, then read the dataset. */
export async function runActor(platform: Platform, queries: string[], o: { maxItems: number; maxTotalChargeUsd: number }): Promise<ApifyRun> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return { status: 'not_configured', missing: ['APIFY_TOKEN'] };
  const auth = { authorization: `Bearer ${token}` };
  try {
    const start = await safeJson<{ data?: { id?: string; defaultDatasetId?: string } }>(
      `${BASE}/acts/${actorPath(ACTORS[platform].id)}/runs?maxItems=${o.maxItems}&maxTotalChargeUsd=${o.maxTotalChargeUsd}&timeout=240`,
      { integration: 'apify', method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(buildActorInput(platform, queries, o.maxItems)) },
    );
    const runId = start.data?.data?.id;
    if (!start.ok || !runId) return { status: 'error', message: `Apify start failed (HTTP ${start.status})` };
    type RunData = { status?: string; usageTotalUsd?: number; defaultDatasetId?: string };
    let run: RunData = start.data?.data ?? {};
    const deadline = Date.now() + 250_000;
    while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status ?? '') && Date.now() < deadline) {
      const r = await safeJson<{ data?: RunData }>(`${BASE}/actor-runs/${runId}?waitForFinish=45`, { integration: 'apify', headers: auth, timeoutMs: 60_000 });
      if (r.ok && r.data?.data) run = r.data.data;
    }
    const costUsd = typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : 0;
    if (run.status !== 'SUCCEEDED') return { status: 'error', message: `Apify run ${run.status ?? 'unfinished'}`, runId, costUsd };
    const ds = await safeJson<unknown[]>(`${BASE}/datasets/${run.defaultDatasetId}/items?clean=true&limit=${o.maxItems}`, { integration: 'apify', headers: auth, timeoutMs: 60_000, maxBytes: 5_000_000 });
    if (!ds.ok || !Array.isArray(ds.data)) return { status: 'error', message: `Apify dataset read failed (HTTP ${ds.status})`, runId, costUsd };
    const items = ds.data.map((x) => normalizeItem(platform, x)).filter((x): x is SocialItem => !!x);
    return { status: 'ok', runId, items, costUsd };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message.slice(0, 160) : 'Apify request failed' };
  }
}
