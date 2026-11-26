import 'server-only';
import type { TxSql } from '../db';
import { claudeJson, type LlmJson } from './llm';
import { loadClientContext } from './context';

export interface PlannerSettings { mode: 'approve' | 'auto'; defaultWords: number; cadence: 'off' | 'daily' | 'weekly'; maxPerRun: number }
export const DEFAULT_SETTINGS: PlannerSettings = { mode: 'approve', defaultWords: 1800, cadence: 'weekly', maxPerRun: 3 };

export async function loadSettings(sql: TxSql, orgId: string): Promise<PlannerSettings & { lastPlannedAt: Date | null }> {
  const [r] = await sql`select mode, default_words, planner_cadence, max_per_run, last_planned_at from public.content_settings where org_id = ${orgId}`;
  if (!r) return { ...DEFAULT_SETTINGS, lastPlannedAt: null };
  return { mode: r.mode as 'approve' | 'auto', defaultWords: r.default_words as number, cadence: r.planner_cadence as PlannerSettings['cadence'], maxPerRun: r.max_per_run as number, lastPlannedAt: (r.last_planned_at as Date | null) ?? null };
}

/** Is the planner due for this org? (pure) */
export function plannerDue(cadence: PlannerSettings['cadence'], last: Date | null, now = new Date()): boolean {
  if (cadence === 'off') return false;
  if (!last) return true;
  const hours = (now.getTime() - last.getTime()) / 3_600_000;
  return hours >= (cadence === 'daily' ? 23 : 24 * 7 - 1);
}

const SUGGEST_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['gaps'],
  properties: { gaps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['gap_id', 'target_prompt', 'titles'],
    properties: { gap_id: { type: 'string' }, target_prompt: { type: 'string' },
      titles: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'angle', 'rationale'],
        properties: { title: { type: 'string' }, angle: { type: 'string' }, rationale: { type: 'string' } } } } } } } },
} as const;

export interface PlanResult { status: 'ok' | 'not_configured' | 'error' | 'nothing_to_plan'; suggestions: number; gaps: number; missing?: string[]; message?: string; suggestionIds: { id: string; gapId: string }[] }

/** Pick the open gaps most worth content, then ask Claude for several titles per gap with a rationale grounded in the client info and the latest monitoring signal. */
export async function planContent(sql: TxSql, orgId: string, opts: { limit?: number } = {}): Promise<PlanResult> {
  const limit = Math.min(8, Math.max(1, opts.limit ?? 3));
  const gaps = await sql`
    select g.id, g.label, g.score, g.sample_prompts, g.competitors, g.top_domains, g.funnel_stage::text as funnel
    from public.content_gaps g
    where g.org_id = ${orgId} and g.status = 'open'
      and not exists (select 1 from public.content_suggestions s where s.gap_id = g.id and s.status in ('suggested', 'selected'))
      and not exists (select 1 from public.content_items i where i.gap_id = g.id and i.status not in ('archived'))
    order by g.score desc limit ${limit}`;
  if (!gaps.length) return { status: 'nothing_to_plan', suggestions: 0, gaps: 0, suggestionIds: [] };
  const ctx = await loadClientContext(sql, orgId);
  const existing = (await sql`select title from public.content_items where org_id = ${orgId} order by created_at desc limit 30`).map((r) => r.title as string);
  const system =
    'You are a GEO content strategist. For each content gap (prompts where AI engines recommend competitors and not the brand) propose 3 to 4 distinct article titles the brand could publish to get cited. ' +
    'Each title must be specific, match how people phrase the prompt, and differ in angle (comparison, how-to, buyer guide, data-led). The rationale is 1-2 plain sentences naming the evidence (which competitors win, which sources AI cites, which brand strength to use). ' +
    "Never claim facts about the brand beyond the context. Avoid em dashes, emoji and hype words. target_prompt must be one of the gap's sample prompts, copied exactly.";
  const user = JSON.stringify({
    brand: { name: ctx.brand.name, description: ctx.brand.description, tagline: ctx.brand.tagline, say: ctx.brand.say, dont_say: ctx.brand.dontSay, messaging: ctx.brand.messaging, industry: ctx.profile.industry, value_props: ctx.profile.valueProps, differentiators: ctx.profile.differentiators, competitors: ctx.brand.competitors, tone: ctx.brand.tone },
    personas: ctx.personas, already_published_or_planned_titles: existing,
    gaps: gaps.map((g) => ({ gap_id: g.id, label: g.label, funnel: g.funnel, score: Number(g.score), sample_prompts: g.sample_prompts, competitors_ai_recommends: (g.competitors as { name: string; mentions: number }[]).slice(0, 5), sources_ai_cites: (g.top_domains as { domain: string; citations: number }[]).slice(0, 6) })),
  });
  const r: LlmJson = await claudeJson({ system, user, schema: SUGGEST_SCHEMA as unknown as Record<string, unknown>, maxTokens: 6000, effort: 'low', provenance: [{ orgId, source: 'content_gaps' }, { orgId: ctx.brand.orgId, source: 'brand_context' }] });
  if (r.status === 'not_configured') return { status: 'not_configured', suggestions: 0, gaps: gaps.length, missing: r.missing, suggestionIds: [] };
  if (r.status === 'error') return { status: 'error', suggestions: 0, gaps: gaps.length, message: r.message, suggestionIds: [] };
  const valid = new Map(gaps.map((g) => [g.id as string, g]));
  const ids: { id: string; gapId: string }[] = [];
  for (const g of ((r.data as { gaps?: { gap_id: string; target_prompt: string; titles: { title: string; angle: string; rationale: string }[] }[] }).gaps ?? [])) {
    const gap = valid.get(g.gap_id);
    if (!gap) continue;
    const prompts = gap.sample_prompts as string[];
    const target = prompts.find((p) => p === g.target_prompt) ?? prompts[0] ?? null;
    const [pr] = target ? await sql`select id from public.prompts where org_id = ${orgId} and text = ${target} limit 1` : [];
    for (const t of (g.titles ?? []).slice(0, 4)) {
      const title = t.title?.trim().slice(0, 200);
      if (!title) continue;
      const [row] = await sql`
        insert into public.content_suggestions (org_id, gap_id, prompt_id, prompt_text, title, angle, rationale)
        values (${orgId}, ${gap.id as string}, ${(pr?.id as string | undefined) ?? null}, ${target}, ${title}, ${t.angle?.slice(0, 200) ?? null}, ${t.rationale?.slice(0, 600) ?? ''})
        on conflict (gap_id, title) do nothing returning id`;
      if (row) ids.push({ id: row.id as string, gapId: gap.id as string });
    }
  }
  return { status: 'ok', suggestions: ids.length, gaps: gaps.length, suggestionIds: ids };
}
