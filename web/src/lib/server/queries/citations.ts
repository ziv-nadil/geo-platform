import 'server-only';
import { iso, orgQuery, window } from './_run';
import type { Citations, Filters, QueryResult, SourceTag, SourceType } from './types';

export async function getCitations(orgId: string, filters: Filters = {}): Promise<QueryResult<Citations>> {
  const w = window(filters);
  return orgQuery(orgId, async (sql) => {
    const eng = w.engines ? sql`and pr.engine_id = any(${sql.array(w.engines)})` : sql``;
    const topic = w.topicId ? sql`and p.topic_id = ${w.topicId}` : sql``;
    const base = sql`
      from public.citations c
      join public.prompt_runs pr on pr.id = c.prompt_run_id
      join public.prompts p on p.id = pr.prompt_id
      where c.org_id = ${orgId} and pr.run_at >= ${w.from}::date and pr.run_at < ${w.to}::date + 1 ${eng} ${topic}`;
    const byType = await sql`
      select c.source_type::text as source_type, count(*)::int as citations,
             round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 2)::float8 as share
      ${base} group by 1 order by 2 desc`;
    const domains = await sql`
      with d as (
        select c.domain, c.source_type::text as source_type, count(*)::int as citations, count(distinct c.prompt_run_id)::int as runs_citing
        ${base} group by 1, 2
      )
      select d.*, round(100.0 * d.citations / nullif(sum(d.citations) over (), 0), 2)::float8 as share,
             coalesce((select array_agg(distinct t.name) from public.source_tag_rules r join public.source_tags t on t.id = r.tag_id
                       where r.org_id = ${orgId} and r.match_type = 'domain' and r.pattern = d.domain), '{}') as tags
      from d order by d.citations desc limit 100`;
    const urls = await sql`
      select c.url, c.domain, max(c.title) as title, c.source_type::text as source_type, count(*)::int as citations, max(pr.run_at) as last_seen_at
      ${base} group by c.url, c.domain, c.source_type order by 5 desc limit 100`;
    return {
      byType: byType.map((r) => ({ sourceType: r.source_type as SourceType, citations: r.citations, share: Number(r.share ?? 0) })),
      domains: domains.map((r) => ({ domain: r.domain, sourceType: r.source_type as SourceType, citations: r.citations, runsCiting: r.runs_citing, share: Number(r.share ?? 0), tags: r.tags })),
      urls: urls.map((r) => ({ url: r.url, domain: r.domain, title: r.title, sourceType: r.source_type as SourceType, citations: r.citations, lastSeenAt: iso(r.last_seen_at)! })),
    };
  });
}

export async function listSourceTags(orgId: string): Promise<QueryResult<SourceTag[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select t.id, t.name, t.color, t.description,
             coalesce((select json_agg(json_build_object('id', r.id, 'matchType', r.match_type, 'pattern', r.pattern) order by r.pattern)
                       from public.source_tag_rules r where r.tag_id = t.id), '[]') as rules,
             (select count(*)::int from public.citations c
               where c.org_id = t.org_id and exists (
                 select 1 from public.source_tag_rules r where r.tag_id = t.id
                   and ((r.match_type = 'domain' and c.domain = r.pattern) or (r.match_type = 'url_prefix' and c.url like r.pattern || '%')))) as citations
      from public.source_tags t where t.org_id = ${orgId} order by t.name`;
    return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, description: r.description, rules: r.rules, citations: r.citations }));
  });
}
