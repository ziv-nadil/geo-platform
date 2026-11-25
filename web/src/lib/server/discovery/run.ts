import 'server-only';
import { buildSuggestions } from '../../discovery/engine';
import { loadBrandContext } from '../content-gaps/generate';
import { withService, type TxSql } from '../db';
import { fromGsc, fromKeywordPlanner, fromLlm, fromPaa, type SourceOutcome } from './sources';

export type DiscoveryReport = { added: number; updated: number; sources: { source: string; status: string; count: number; missing?: string[]; message?: string }[] };

/** Fetch from all sources (each degrades to not_configured), dedupe/cluster/score, upsert suggestions. Existing accepted/dismissed rows keep their status. */
export async function runDiscovery(sql: TxSql, orgId: string): Promise<DiscoveryReport> {
  const brand = await loadBrandContext(sql, orgId);
  const personas = (await sql`select name, role_title, pain_points from public.brand_personas where org_id = ${orgId} order by sort_order limit 5`).map((p) => ({ name: p.name as string, role: p.role_title as string | null, pains: (p.pain_points as string[]).slice(0, 3) }));
  const topics = (await sql`select name from public.topics where org_id = ${orgId} limit 12`).map((t) => t.name as string);
  const [gscRow] = await withService((s) => s`select data->>'gsc_property' as property from public.onboarding_progress where org_id = ${orgId} and step_id = 'gsc'`);
  const seeds = topics.length ? topics : [brand.name];

  const outcomes: SourceOutcome[] = await Promise.all([
    fromGsc((gscRow?.property as string | null) ?? null), fromKeywordPlanner(seeds), fromPaa(seeds), fromLlm(brand, personas, topics),
  ]);
  const suggestions = buildSuggestions(outcomes.flatMap((o) => o.candidates), brand.competitors.map((c) => c.name));

  // Skip anything already tracked.
  const tracked = new Set((await sql`select text from public.prompts where org_id = ${orgId}`).map((r) => (r.text as string).toLowerCase()));
  let added = 0, updated = 0;
  for (const s of suggestions.filter((x) => !tracked.has(x.text.toLowerCase()))) {
    const [row] = await sql`
      insert into public.prompt_suggestions (org_id, text, norm_key, cluster_key, topic_name, persona_name, funnel_stage, sources, volume, intent, competitor_presence, score, score_parts)
      values (${orgId}, ${s.text}, ${s.normKey}, ${s.clusterKey}, ${s.topic}, ${s.persona}, ${s.funnel as never}, ${s.sources}, ${s.volume}, ${s.intent}, ${s.competitorPresence}, ${s.score}, ${sql.json(s.parts)})
      on conflict (org_id, norm_key) do update set sources = (select array(select distinct unnest(public.prompt_suggestions.sources || excluded.sources))),
        volume = greatest(public.prompt_suggestions.volume, excluded.volume), score = excluded.score, score_parts = excluded.score_parts
      returning (xmax = 0) as inserted`;
    if (row?.inserted) added++; else updated++;
  }
  return { added, updated, sources: outcomes.map((o) => ({ source: o.source, status: o.status, count: o.candidates.length, missing: o.missing, message: o.message })) };
}
