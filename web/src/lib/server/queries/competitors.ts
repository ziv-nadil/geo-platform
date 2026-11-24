import 'server-only';
import { day, num, orgQuery, window } from './_run';
import type { Competitor, CompetitorSov, Filters, QueryResult } from './types';

export async function listCompetitors(orgId: string): Promise<QueryResult<Competitor[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`select id, name, domain, aliases, color, active from public.competitors where org_id = ${orgId} order by name`;
    return rows.map((r) => ({ id: r.id, name: r.name, domain: r.domain, aliases: r.aliases, color: r.color, active: r.active }));
  });
}

/** Share of voice for the brand and every competitor (from mentions), plus a daily series. */
export async function getCompetitorSov(orgId: string, filters: Filters = {}): Promise<QueryResult<CompetitorSov>> {
  const w = window(filters);
  return orgQuery(orgId, async (sql) => {
    const eng = w.engines ? sql`and engine_id = any(${sql.array(w.engines)})` : sql``;
    const entities = await sql`
      select entity_id, entity_type::text as entity_type, entity_name, sum(mentions)::int as mentions,
             round(100.0 * sum(mentions) / nullif(sum(sum(mentions)) over (), 0), 2)::float8 as sov,
             round(sum(avg_position * mentions) / nullif(sum(mentions), 0), 2)::float8 as avg_position,
             round(sum(sentiment_avg * mentions) / nullif(sum(mentions), 0), 3)::float8 as sentiment
      from public.share_of_voice_daily
      where org_id = ${orgId} and day between ${w.from} and ${w.to} ${eng}
      group by entity_id, entity_type, entity_name
      order by mentions desc`;
    const colors = await sql`select id, color from public.competitors where org_id = ${orgId}`;
    const colorOf = new Map(colors.map((c) => [c.id as string, c.color as string | null]));
    const series = await sql`
      select day, entity_id, entity_name,
             round(100.0 * sum(mentions) / nullif(sum(sum(mentions)) over (partition by day), 0), 2)::float8 as sov
      from public.share_of_voice_daily
      where org_id = ${orgId} and day between ${w.from} and ${w.to} ${eng}
      group by day, entity_id, entity_name
      order by day`;
    return {
      entities: entities.map((r) => ({
        entityId: r.entity_id, entityType: r.entity_type, name: r.entity_name, color: colorOf.get(r.entity_id) ?? null,
        mentions: r.mentions, shareOfVoice: Number(r.sov ?? 0), avgPosition: num(r.avg_position), sentiment: num(r.sentiment),
      })),
      series: series.map((r) => ({ day: day(r.day), entityId: r.entity_id, name: r.entity_name, shareOfVoice: Number(r.sov ?? 0) })),
    };
  });
}
