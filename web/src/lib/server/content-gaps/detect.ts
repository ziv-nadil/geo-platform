import 'server-only';
import type { TxSql } from '../db';
import { buildGaps, type PromptSignal } from '../../content-gaps/scoring';

/** Per-prompt competitor/brand presence over the window, from succeeded runs (RLS-scoped sql). */
export async function loadPromptSignals(sql: TxSql, orgId: string, days: number): Promise<PromptSignal[]> {
  const d = Math.min(365, Math.max(1, Math.floor(days)));
  const rows = await sql`
    with runs as (
      select pr.id as run_id, pr.prompt_id,
        (r.brand_mentioned
          or exists (select 1 from public.mentions m where m.response_id = r.id and m.entity_type = 'brand')
          or exists (select 1 from public.citations c where c.response_id = r.id and c.source_type = 'owned')) as brand_hit,
        (exists (select 1 from public.mentions m where m.response_id = r.id and m.entity_type = 'competitor')
          or exists (select 1 from public.citations c where c.response_id = r.id and c.competitor_id is not null)) as comp_hit
      from public.prompt_runs pr join public.responses r on r.prompt_run_id = pr.id
      where pr.org_id = ${orgId} and pr.status = 'succeeded' and pr.run_at >= now() - make_interval(days => ${d})
    ), per_prompt as (
      select prompt_id, count(*)::int as runs, count(*) filter (where brand_hit)::int as brand_runs,
             count(*) filter (where comp_hit)::int as competitor_runs
      from runs group by prompt_id
    )
    select p.id, p.text, p.topic_id, t.name as topic_name, p.persona_id, bp.name as persona_name, p.funnel_stage::text as funnel,
           p.importance::float8 as importance, pp.runs, pp.brand_runs, pp.competitor_runs
    from public.prompts p join per_prompt pp on pp.prompt_id = p.id
    left join public.topics t on t.id = p.topic_id left join public.brand_personas bp on bp.id = p.persona_id
    where p.org_id = ${orgId} and p.active and pp.brand_runs = 0 and pp.competitor_runs > 0`;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);

  const comps = await sql`
    select pr.prompt_id, c.id, c.name,
           count(m.id) filter (where m.id is not null)::int as mentions, 0 as citations
    from public.prompt_runs pr join public.responses r on r.prompt_run_id = pr.id
    join public.mentions m on m.response_id = r.id and m.entity_type = 'competitor'
    join public.competitors c on c.id = m.competitor_id
    where pr.org_id = ${orgId} and pr.prompt_id in ${sql(ids)} and pr.status = 'succeeded' and pr.run_at >= now() - make_interval(days => ${d})
    group by pr.prompt_id, c.id, c.name
    union all
    select pr.prompt_id, c.id, c.name, 0, count(ci.id)::int
    from public.prompt_runs pr join public.responses r on r.prompt_run_id = pr.id
    join public.citations ci on ci.response_id = r.id join public.competitors c on c.id = ci.competitor_id
    where pr.org_id = ${orgId} and pr.prompt_id in ${sql(ids)} and pr.status = 'succeeded' and pr.run_at >= now() - make_interval(days => ${d})
    group by pr.prompt_id, c.id, c.name`;
  const doms = await sql`
    select pr.prompt_id, ci.domain, coalesce(sd.category, ci.source_type::text) as category, count(*)::int as citations
    from public.prompt_runs pr join public.responses r on r.prompt_run_id = pr.id
    join public.citations ci on ci.response_id = r.id left join public.source_domains sd on sd.domain = ci.domain
    where pr.org_id = ${orgId} and pr.prompt_id in ${sql(ids)} and pr.status = 'succeeded' and pr.run_at >= now() - make_interval(days => ${d})
      and ci.source_type <> 'owned'
    group by pr.prompt_id, ci.domain, sd.category, ci.source_type`;

  return rows.map((r) => {
    const merged = new Map<string, PromptSignal['competitors'][number]>();
    for (const c of comps.filter((x) => x.prompt_id === r.id)) {
      const e = merged.get(c.id as string) ?? { id: c.id as string, name: c.name as string, mentions: 0, citations: 0 };
      e.mentions += Number(c.mentions); e.citations += Number(c.citations);
      merged.set(e.id, e);
    }
    return {
      promptId: r.id as string, text: r.text as string, topicId: r.topic_id as string | null, topicName: r.topic_name as string | null,
      personaId: r.persona_id as string | null, personaName: r.persona_name as string | null, funnel: r.funnel as string | null,
      importance: Number(r.importance), runs: Number(r.runs), brandRuns: Number(r.brand_runs), competitorRuns: Number(r.competitor_runs),
      competitors: [...merged.values()],
      domains: doms.filter((x) => x.prompt_id === r.id).map((x) => ({ domain: x.domain as string, category: x.category as string | null, citations: Number(x.citations) })),
    };
  });
}

/** Detect, score and upsert gaps. Gaps that disappeared and were still 'open' are marked covered. */
export async function detectAndStoreGaps(sql: TxSql, orgId: string, days = 30): Promise<{ gaps: number }> {
  const gaps = buildGaps(await loadPromptSignals(sql, orgId, days));
  const [brand] = await sql`select id from public.brands where org_id = ${orgId} order by created_at limit 1`;
  for (const g of gaps) {
    await sql`
      insert into public.content_gaps (org_id, brand_id, group_key, topic_id, persona_id, funnel_stage, label, prompt_ids, prompt_count, sample_prompts,
                                       competitors, top_domains, score, score_parts, window_days, detected_at)
      values (${orgId}, ${brand?.id ?? null}, ${g.groupKey}, ${g.topicId}, ${g.personaId}, ${g.funnel as never}, ${g.label}, ${g.promptIds}, ${g.promptIds.length},
              ${g.samplePrompts}, ${sql.json(g.competitors)}, ${sql.json(g.topDomains)}, ${g.score}, ${sql.json(g.parts)}, ${days}, now())
      on conflict (org_id, group_key) do update set
        label = excluded.label, prompt_ids = excluded.prompt_ids, prompt_count = excluded.prompt_count, sample_prompts = excluded.sample_prompts,
        competitors = excluded.competitors, top_domains = excluded.top_domains, score = excluded.score, score_parts = excluded.score_parts,
        window_days = excluded.window_days, detected_at = now(),
        status = case when public.content_gaps.status = 'covered' then 'open' else public.content_gaps.status end`;
  }
  const keys = gaps.map((g) => g.groupKey);
  await sql`update public.content_gaps set status = 'covered', updated_at = now()
            where org_id = ${orgId} and status = 'open' and not (group_key = any(${keys}))`;
  return { gaps: gaps.length };
}
