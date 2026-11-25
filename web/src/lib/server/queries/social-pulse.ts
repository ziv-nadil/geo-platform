import 'server-only';
import { iso, orgQuery } from './_run';
import type { QueryResult } from './types';
import { ACTORS, killSwitchOn, type Platform } from '../social-pulse/config';

export interface TitleRow { id: string; title: string; rationale: string; promptText: string | null; status: string; decidedVia: string | null; itemId: string | null; error: string | null }
export interface InsightRow { id: string; title: string; summary: string; sentiment: string; platforms: string[]; sources: { platform: string; url: string; title: string }[]; postedToSlack: boolean; createdAt: string | null; titles: TitleRow[] }
export interface SocialPulseData {
  settings: { enabled: boolean; platforms: string[]; keywords: string[]; maxItems: number; maxRuns: number; budgetUsd: number; channel: string | null; slackAppId: string | null };
  monthSpentUsd: number; lastRunCost: number | null; insights: InsightRow[]; killSwitch: boolean;
  actors: { platform: Platform; id: string; label: string }[];
  keys: { apify: boolean; anthropic: boolean };
}

export async function loadSocialPulse(orgId: string): Promise<QueryResult<SocialPulseData>> {
  const r = await orgQuery(orgId, async (sql) => {
    const [s] = await sql`select enabled, platforms, extra_keywords, max_items_per_platform, max_runs_per_day, monthly_budget_usd, slack_channel, slack_app_id from public.social_pulse_settings where org_id = ${orgId}`;
    const [m] = await sql`select coalesce(sum(cost_usd), 0)::float8 as spent from public.social_pulse_runs where org_id = ${orgId} and created_at >= date_trunc('month', now())`;
    const [last] = await sql`select coalesce(sum(cost_usd), 0)::float8 as c from public.social_pulse_runs where org_id = ${orgId} and created_at >= date_trunc('day', now())`;
    const ins = await sql`select id, title, summary, sentiment, platforms, sources, slack_ts, created_at from public.social_insights where org_id = ${orgId} and pulse_date >= current_date - 1 order by pulse_date desc, created_at limit 10`;
    const ts = ins.length ? await sql`select id, insight_id, title, rationale, prompt_text, status, decided_via, item_id, error from public.title_suggestions where org_id = ${orgId} and insight_id = any(${ins.map((i) => i.id as string)}::uuid[]) order by created_at` : [];
    return { s, m, last, ins, ts };
  });
  if (!r.ok) return r;
  const { s, m, last, ins, ts } = r.data;
  return { ok: true, data: {
    settings: { enabled: !!s?.enabled, platforms: (s?.platforms as string[]) ?? ['reddit', 'x', 'linkedin'], keywords: (s?.extra_keywords as string[]) ?? [], maxItems: (s?.max_items_per_platform as number) ?? 30, maxRuns: (s?.max_runs_per_day as number) ?? 3, budgetUsd: Number(s?.monthly_budget_usd ?? 10), channel: (s?.slack_channel as string | null) ?? null, slackAppId: (s?.slack_app_id as string | null) ?? null },
    monthSpentUsd: m.spent as number, lastRunCost: last.c as number, killSwitch: killSwitchOn(),
    insights: ins.map((i) => ({ id: i.id as string, title: i.title as string, summary: i.summary as string, sentiment: i.sentiment as string, platforms: i.platforms as string[], sources: i.sources as InsightRow['sources'], postedToSlack: !!i.slack_ts, createdAt: iso(i.created_at), titles: ts.filter((t) => t.insight_id === i.id).map((t) => ({ id: t.id as string, title: t.title as string, rationale: t.rationale as string, promptText: (t.prompt_text as string | null) ?? null, status: t.status as string, decidedVia: (t.decided_via as string | null) ?? null, itemId: (t.item_id as string | null) ?? null, error: (t.error as string | null) ?? null })) })),
    actors: (Object.keys(ACTORS) as Platform[]).map((p) => ({ platform: p, id: ACTORS[p].id, label: ACTORS[p].label })),
    keys: { apify: !!process.env.APIFY_TOKEN?.trim(), anthropic: !!process.env.ANTHROPIC_API_KEY?.trim() },
  } };
}
