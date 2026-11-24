import 'server-only';
import type { TxSql } from '../db';
import { iso, num, orgQuery, window } from './_run';
import type { Filters, Page, PromptDetail, PromptRow, QueryResult, ResponseRow, SourceType, Topic } from './types';

export async function listTopics(orgId: string): Promise<QueryResult<Topic[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select t.id, t.name, t.description, count(p.id)::int as prompt_count
      from public.topics t left join public.prompts p on p.topic_id = t.id
      where t.org_id = ${orgId}
      group by t.id order by t.name`;
    return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, promptCount: r.prompt_count }));
  });
}

async function promptRows(sql: TxSql, orgId: string, filters: Filters, promptId?: string): Promise<PromptRow[]> {
  const w = window(filters);
  const eng = w.engines ? sql`and pr.engine_id = any(${w.engines}::text[])` : sql``;
  const topic = w.topicId ? sql`and p.topic_id = ${w.topicId}` : sql``;
  const one = promptId ? sql`and p.id = ${promptId}` : sql``;
  const rows = await sql`
    with runs as (
      select pr.prompt_id, count(*)::int as runs,
             round(100.0 * count(*) filter (where r.brand_mentioned) / nullif(count(*), 0), 2)::float8 as visibility,
             max(pr.run_at) as last_run_at
      from public.prompt_runs pr
      left join public.responses r on r.prompt_run_id = pr.id
      where pr.org_id = ${orgId} and pr.status = 'succeeded'
        and pr.run_at >= ${w.from}::date and pr.run_at < ${w.to}::date + 1 ${eng}
      group by pr.prompt_id
    ),
    pos as (
      select m.prompt_run_id, pr.prompt_id, m.position
      from public.mentions m join public.prompt_runs pr on pr.id = m.prompt_run_id
      where m.org_id = ${orgId} and m.entity_type = 'brand'
        and pr.run_at >= ${w.from}::date and pr.run_at < ${w.to}::date + 1 ${eng}
    )
    select p.id, p.text, p.topic_id, t.name as topic_name, bp.name as persona_name, p.funnel_stage::text as funnel_stage,
           p.locale, p.country, p.source::text as source, p.active, p.tags,
           coalesce(runs.runs, 0) as runs, runs.visibility, runs.last_run_at,
           (select round(avg(position), 2)::float8 from pos where pos.prompt_id = p.id) as avg_position
    from public.prompts p
    left join public.topics t on t.id = p.topic_id
    left join public.brand_personas bp on bp.id = p.persona_id
    left join runs on runs.prompt_id = p.id
    where p.org_id = ${orgId} ${topic} ${one}
    order by p.active desc, runs.visibility desc nulls last, p.created_at`;
  return rows.map((r) => ({
    id: r.id, text: r.text, topicId: r.topic_id, topicName: r.topic_name, personaName: r.persona_name,
    funnelStage: r.funnel_stage, locale: r.locale, country: r.country, source: r.source, active: r.active, tags: r.tags,
    runs: r.runs, visibility: num(r.visibility), avgPosition: num(r.avg_position), lastRunAt: iso(r.last_run_at),
  }));
}

export async function listPrompts(orgId: string, filters: Filters = {}): Promise<QueryResult<PromptRow[]>> {
  return orgQuery(orgId, (sql) => promptRows(sql, orgId, filters));
}

async function responseRows(sql: TxSql, orgId: string, opts: Filters & { promptId?: string; brandMentioned?: boolean; limit?: number; offset?: number }): Promise<Page<ResponseRow>> {
  const w = window(opts);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);
  const eng = w.engines ? sql`and pr.engine_id = any(${w.engines}::text[])` : sql``;
  const topic = w.topicId ? sql`and p.topic_id = ${w.topicId}` : sql``;
  const prompt = opts.promptId ? sql`and pr.prompt_id = ${opts.promptId}` : sql``;
  const brand = opts.brandMentioned === undefined ? sql`` : sql`and r.brand_mentioned = ${opts.brandMentioned}`;
  const where = sql`
    where r.org_id = ${orgId} and pr.run_at >= ${w.from}::date and pr.run_at < ${w.to}::date + 1
    ${eng} ${topic} ${prompt} ${brand}`;
  const [{ total }] = await sql`
    select count(*)::int as total
    from public.responses r join public.prompt_runs pr on pr.id = r.prompt_run_id join public.prompts p on p.id = pr.prompt_id
    ${where}`;
  const rows = await sql`
    select r.id, r.prompt_run_id, pr.prompt_id, p.text as prompt_text, pr.engine_id, pr.model, pr.run_at, r.text, r.brand_mentioned,
      coalesce((select json_agg(json_build_object('name', m.name, 'entityType', m.entity_type, 'position', m.position, 'sentiment', m.sentiment) order by m.position)
                from public.mentions m where m.response_id = r.id), '[]') as mentions,
      coalesce((select json_agg(json_build_object('url', c.url, 'domain', c.domain, 'sourceType', c.source_type, 'position', c.position) order by c.position)
                from public.citations c where c.response_id = r.id), '[]') as citations
    from public.responses r join public.prompt_runs pr on pr.id = r.prompt_run_id join public.prompts p on p.id = pr.prompt_id
    ${where}
    order by pr.run_at desc
    limit ${limit} offset ${offset}`;
  return {
    total, limit, offset,
    rows: rows.map((r) => ({
      id: r.id, promptRunId: r.prompt_run_id, promptId: r.prompt_id, promptText: r.prompt_text, engineId: r.engine_id, model: r.model,
      runAt: iso(r.run_at)!, text: r.text, brandMentioned: r.brand_mentioned, mentions: r.mentions, citations: r.citations,
    })),
  };
}

export async function listResponses(
  orgId: string,
  opts: Filters & { promptId?: string; brandMentioned?: boolean; limit?: number; offset?: number } = {},
): Promise<QueryResult<Page<ResponseRow>>> {
  return orgQuery(orgId, (sql) => responseRows(sql, orgId, opts));
}

export async function getPromptDetail(orgId: string, promptId: string, filters: Filters = {}): Promise<QueryResult<PromptDetail | null>> {
  if (!/^[0-9a-f-]{36}$/i.test(promptId)) return { ok: true, data: null };
  return orgQuery(orgId, async (sql) => {
    const [prompt] = await promptRows(sql, orgId, filters, promptId);
    if (!prompt) return null;
    const w = window(filters);
    const inWindow = sql`pr.run_at >= ${w.from}::date and pr.run_at < ${w.to}::date + 1`;
    const byEngine = await sql`
      select pr.engine_id, count(*)::int as runs,
             round(100.0 * count(*) filter (where r.brand_mentioned) / nullif(count(*), 0), 2)::float8 as visibility,
             (select round(avg(m.position), 2)::float8 from public.mentions m join public.prompt_runs p2 on p2.id = m.prompt_run_id
               where p2.prompt_id = ${promptId} and p2.engine_id = pr.engine_id and m.entity_type = 'brand'
                 and p2.run_at >= ${w.from}::date and p2.run_at < ${w.to}::date + 1) as avg_position,
             max(pr.run_at) as last_run_at
      from public.prompt_runs pr left join public.responses r on r.prompt_run_id = pr.id
      where pr.prompt_id = ${promptId} and pr.status = 'succeeded' and ${inWindow}
      group by pr.engine_id order by pr.engine_id`;
    const comps = await sql`
      select m.name, count(*)::int as mentions
      from public.mentions m join public.prompt_runs pr on pr.id = m.prompt_run_id
      where pr.prompt_id = ${promptId} and m.entity_type = 'competitor' and ${inWindow}
      group by m.name order by 2 desc`;
    const cites = await sql`
      select c.url, c.domain, c.source_type::text as source_type, count(*)::int as citations
      from public.citations c join public.prompt_runs pr on pr.id = c.prompt_run_id
      where pr.prompt_id = ${promptId} and ${inWindow}
      group by 1, 2, 3 order by 4 desc limit 10`;
    const recent = await responseRows(sql, orgId, { ...filters, promptId, limit: 10 });
    return {
      prompt,
      byEngine: byEngine.map((r) => ({ engineId: r.engine_id, runs: r.runs, visibility: num(r.visibility), avgPosition: num(r.avg_position), lastRunAt: iso(r.last_run_at) })),
      recentResponses: recent.rows,
      competitorsMentioned: comps.map((r) => ({ name: r.name, mentions: r.mentions })),
      topCitations: cites.map((r) => ({ url: r.url, domain: r.domain, sourceType: r.source_type as SourceType, citations: r.citations })),
    };
  });
}
