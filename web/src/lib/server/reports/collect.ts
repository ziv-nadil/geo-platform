import 'server-only';
import type { Sql, TxSql } from '../db';
import { buildKpis, competitorMovers, engineTrends, previousPeriod, topGaps, type EngineRaw, type RawKpis, type ReportData } from '@/lib/reports/aggregate';

type Q = Sql | TxSql;
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const dayStr = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** Ratio-of-sums KPIs over metrics_daily (same math as the Overview tab). Works under RLS or the service role. */
export async function windowKpis(sql: Q, orgId: string, from: string, to: string): Promise<RawKpis & { scoredRuns: number }> {
  const [r] = await (sql as Sql)`
    select coalesce(sum(runs), 0)::int as runs, coalesce(sum(scored_runs), 0)::int as scored_runs,
           round(sum(visibility_score * scored_runs) / nullif(sum(scored_runs), 0), 2)::float8 as visibility,
           round(100.0 * sum(brand_mentions) / nullif(sum(brand_mentions) + sum(competitor_mentions), 0), 2)::float8 as sov,
           round(100.0 * sum(citations_owned) / nullif(sum(citations_total), 0), 2)::float8 as citation_share,
           round(sum(sentiment_avg * brand_mentions) / nullif(sum(brand_mentions) filter (where sentiment_avg is not null), 0), 3)::float8 as sentiment
    from public.metrics_daily where org_id = ${orgId} and day between ${from} and ${to}`;
  return { runs: Number(r.runs), scoredRuns: Number(r.scored_runs), visibility: n(r.visibility), sov: n(r.sov), citationShare: n(r.citation_share), sentiment: n(r.sentiment) };
}

async function engineRows(sql: Q, orgId: string, from: string, to: string): Promise<EngineRaw[]> {
  const rows = await (sql as Sql)`
    select engine_id, sum(runs)::int as runs,
           round(sum(visibility_score * scored_runs) / nullif(sum(scored_runs), 0), 2)::float8 as visibility,
           round(100.0 * sum(brand_mentions) / nullif(sum(brand_mentions) + sum(competitor_mentions), 0), 2)::float8 as sov,
           round(100.0 * sum(citations_owned) / nullif(sum(citations_total), 0), 2)::float8 as citation_share
    from public.metrics_daily where org_id = ${orgId} and day between ${from} and ${to} group by engine_id`;
  return rows.map((r) => ({ engine: r.engine_id as string, visibility: n(r.visibility), sov: n(r.sov), citationShare: n(r.citation_share), runs: Number(r.runs) }));
}

async function competitorMentions(sql: Q, orgId: string, from: string, to: string) {
  const rows = await (sql as Sql)`
    select c.id, c.name, count(*)::int as mentions
    from public.mentions m join public.competitors c on c.id = m.competitor_id
    where m.org_id = ${orgId} and m.entity_type = 'competitor' and m.created_at >= ${from}::date and m.created_at < ${to}::date + 1
    group by c.id, c.name`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, mentions: Number(r.mentions) }));
}

export async function collectReport(sql: Q, orgId: string, from: string, to: string): Promise<ReportData> {
  const prev = previousPeriod(from, to);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const [cur, before, engCur, engPrev, series, gaps, mCur, mPrev] = await Promise.all([
    windowKpis(sql, orgId, from, to),
    windowKpis(sql, orgId, prev.from, prev.to),
    engineRows(sql, orgId, from, to),
    engineRows(sql, orgId, prev.from, prev.to),
    (sql as Sql)`
      select day, engine_id, visibility_score::float8 as visibility, share_of_voice::float8 as sov, citation_share::float8 as citation_share
      from public.metrics_daily where org_id = ${orgId} and day between ${from} and ${to} order by day, engine_id`,
    (sql as Sql)`select label, score::float8 as score, prompt_count, status, competitors from public.content_gaps where org_id = ${orgId} and status <> 'dismissed' order by score desc limit 20`,
    competitorMentions(sql, orgId, from, to),
    competitorMentions(sql, orgId, prev.from, prev.to),
  ]);
  return {
    period: { from, to, days },
    previous: prev,
    kpis: buildKpis(cur, before),
    engines: engineTrends(engCur, engPrev),
    series: series.map((s) => ({ day: dayStr(s.day), engine: s.engine_id as string, visibility: n(s.visibility), sov: n(s.sov), citationShare: n(s.citation_share) })),
    gaps: topGaps(gaps.map((g) => ({ label: g.label as string, score: Number(g.score), promptCount: Number(g.prompt_count), status: g.status as string, competitors: (g.competitors as { name: string }[] | null) ?? [] }))),
    movers: competitorMovers(mCur, mPrev),
    generatedAt: new Date().toISOString(),
  };
}
