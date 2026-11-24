import 'server-only';
import { day, num, orgQuery, window } from './_run';
import type { Filters, KpiDelta, Overview, QueryResult, SourceType } from './types';

const delta = (value: number | null, previous: number | null): KpiDelta => ({
  value,
  previous,
  delta: value !== null && previous !== null ? Math.round((value - previous) * 100) / 100 : null,
});

/**
 * Overview tab. Reads the materialized metrics (public.metrics_daily, refreshed by
 * public.refresh_metrics()) for KPIs/series, and live tables for competitors/sources.
 */
export async function getOverview(orgId: string, filters: Filters = {}): Promise<QueryResult<Overview>> {
  const w = window(filters);
  return orgQuery(orgId, async (sql) => {
    const eng = w.engines ? sql`and engine_id = any(${w.engines}::text[])` : sql``;
    const engPr = w.engines ? sql`and pr.engine_id = any(${w.engines}::text[])` : sql``;
    const topic = w.topicId ? sql`and p.topic_id = ${w.topicId}` : sql``;

    // Ratio-of-sums aggregation over a window (not an average of daily percentages).
    const agg = (from: string, to: string) => sql`
      select coalesce(sum(runs), 0)::int as runs,
             round(100.0 * sum(runs_with_brand) / nullif(sum(runs), 0), 2)::float8 as visibility,
             round(100.0 * sum(brand_mentions) / nullif(sum(brand_mentions) + sum(competitor_mentions), 0), 2)::float8 as sov,
             round(100.0 * sum(citations_owned) / nullif(sum(citations_total), 0), 2)::float8 as citation_share,
             round(sum(avg_brand_position * brand_mentions) / nullif(sum(brand_mentions) filter (where avg_brand_position is not null), 0), 2)::float8 as avg_position,
             round(sum(sentiment_avg * brand_mentions) / nullif(sum(brand_mentions) filter (where sentiment_avg is not null), 0), 3)::float8 as sentiment
      from public.metrics_daily
      where org_id = ${orgId} and day between ${from} and ${to} ${eng}`;

    const [cur] = await agg(w.from, w.to);
    const prevTo = new Date(new Date(w.from).getTime() - 86_400_000).toISOString().slice(0, 10);
    const [prev] = await agg(w.prevFrom, prevTo);

    const series = await sql`
      select day, engine_id, runs::int, visibility_score::float8 as visibility, share_of_voice::float8 as sov,
             citation_share::float8, avg_brand_position::float8 as avg_position, sentiment_avg::float8 as sentiment
      from public.metrics_daily
      where org_id = ${orgId} and day between ${w.from} and ${w.to} ${eng}
      order by day, engine_id`;

    const byEngine = await sql`
      select engine_id, sum(runs)::int as runs,
             round(100.0 * sum(runs_with_brand) / nullif(sum(runs), 0), 2)::float8 as visibility,
             round(100.0 * sum(brand_mentions) / nullif(sum(brand_mentions) + sum(competitor_mentions), 0), 2)::float8 as sov,
             round(100.0 * sum(citations_owned) / nullif(sum(citations_total), 0), 2)::float8 as citation_share
      from public.metrics_daily
      where org_id = ${orgId} and day between ${w.from} and ${w.to} ${eng}
      group by engine_id order by engine_id`;

    const comps = await sql`
      with m as (
        select m.entity_type, m.competitor_id, count(*)::int as n
        from public.mentions m
        join public.prompt_runs pr on pr.id = m.prompt_run_id
        join public.prompts p on p.id = pr.prompt_id
        where m.org_id = ${orgId} and pr.run_at >= ${w.from}::date and pr.run_at < ${w.to}::date + 1 ${engPr} ${topic}
        group by 1, 2
      )
      select c.id, c.name, c.color, m.n as mentions,
             round(100.0 * m.n / nullif((select sum(n) from m), 0), 2)::float8 as sov
      from m join public.competitors c on c.id = m.competitor_id
      where m.entity_type = 'competitor'
      order by m.n desc limit 5`;

    const sources = await sql`
      select c.domain, c.source_type::text as source_type, count(*)::int as citations
      from public.citations c
      join public.prompt_runs pr on pr.id = c.prompt_run_id
      join public.prompts p on p.id = pr.prompt_id
      where c.org_id = ${orgId} and pr.run_at >= ${w.from}::date and pr.run_at < ${w.to}::date + 1 ${engPr} ${topic}
      group by 1, 2 order by 3 desc limit 10`;

    return {
      window: { from: w.from, to: w.to, days: w.days },
      kpis: {
        visibility: delta(num(cur.visibility), num(prev.visibility)),
        shareOfVoice: delta(num(cur.sov), num(prev.sov)),
        citationShare: delta(num(cur.citation_share), num(prev.citation_share)),
        avgPosition: delta(num(cur.avg_position), num(prev.avg_position)),
        sentiment: delta(num(cur.sentiment), num(prev.sentiment)),
        runs: Number(cur.runs),
      },
      series: series.map((r) => ({
        day: day(r.day), engineId: r.engine_id, visibility: num(r.visibility), shareOfVoice: num(r.sov),
        citationShare: num(r.citation_share), avgPosition: num(r.avg_position), sentiment: num(r.sentiment), runs: r.runs,
      })),
      byEngine: byEngine.map((r) => ({ engineId: r.engine_id, visibility: num(r.visibility), shareOfVoice: num(r.sov), citationShare: num(r.citation_share), runs: r.runs })),
      topCompetitors: comps.map((r) => ({ id: r.id, name: r.name, color: r.color, mentions: r.mentions, shareOfVoice: Number(r.sov) })),
      topSources: sources.map((r) => ({ domain: r.domain, sourceType: r.source_type as SourceType, citations: r.citations })),
    };
  });
}
