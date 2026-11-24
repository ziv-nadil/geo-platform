import 'server-only';
import { day, iso, num, orgQuery, window } from './_run';
import type { CrawlerHits, Filters, QueryResult, SiteHealth } from './types';

export async function getSiteHealth(orgId: string): Promise<QueryResult<SiteHealth>> {
  return orgQuery(orgId, async (sql) => {
    const props = await sql`
      select id, root_url, score::float8, pages_crawled, last_audit_at, audit_status::text as audit_status
      from public.site_health_properties where org_id = ${orgId} order by root_url`;
    const issues = await sql`
      select id, property_id, code, title, category, severity::text as severity, status::text as status, recommendation, affected_pages
      from public.site_health_issues where org_id = ${orgId}
      order by array_position(array['critical','high','medium','low','info'], severity::text), affected_pages desc`;
    const pages = await sql`
      select id, property_id, url, status_code, score::float8, title, word_count, has_schema, issues_count, last_crawled_at
      from public.site_health_pages where org_id = ${orgId} order by issues_count desc, url limit 500`;
    return {
      properties: props.map((r) => ({ id: r.id, rootUrl: r.root_url, score: num(r.score), pagesCrawled: r.pages_crawled, lastAuditAt: iso(r.last_audit_at), auditStatus: r.audit_status })),
      issues: issues.map((r) => ({ id: r.id, propertyId: r.property_id, code: r.code, title: r.title, category: r.category, severity: r.severity, status: r.status, recommendation: r.recommendation, affectedPages: r.affected_pages })),
      pages: pages.map((r) => ({ id: r.id, propertyId: r.property_id, url: r.url, statusCode: r.status_code, score: num(r.score), title: r.title, wordCount: r.word_count, hasSchema: r.has_schema, issuesCount: r.issues_count, lastCrawledAt: iso(r.last_crawled_at) })),
    };
  });
}

export async function getCrawlerHits(orgId: string, filters: Filters = {}): Promise<QueryResult<CrawlerHits>> {
  const w = window(filters);
  return orgQuery(orgId, async (sql) => {
    const inWin = sql`org_id = ${orgId} and ts >= ${w.from}::date and ts < ${w.to}::date + 1`;
    const totals = await sql`
      select bot, max(bot_operator) as operator, sum(hits)::int as hits,
             coalesce(sum(hits) filter (where status >= 400), 0)::int as error_hits, count(distinct path)::int as unique_paths
      from public.crawler_hits where ${inWin} group by bot order by 3 desc`;
    const series = await sql`
      select (ts at time zone 'utc')::date as day, bot, sum(hits)::int as hits
      from public.crawler_hits where ${inWin} group by 1, 2 order by 1, 2`;
    const paths = await sql`
      select path, sum(hits)::int as hits, array_agg(distinct bot) as bots
      from public.crawler_hits where ${inWin} group by path order by 2 desc limit 50`;
    return {
      totals: totals.map((r) => ({ bot: r.bot, operator: r.operator, hits: r.hits, errorHits: r.error_hits, uniquePaths: r.unique_paths })),
      series: series.map((r) => ({ day: day(r.day), bot: r.bot, hits: r.hits })),
      topPaths: paths.map((r) => ({ path: r.path, hits: r.hits, bots: r.bots })),
    };
  });
}
