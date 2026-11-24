import 'server-only';
import { iso, num, orgQuery } from './_run';
import type { BrandKit, ContentItem, Creator, OutreachContact, QueryResult, Report } from './types';

export async function getBrandKit(orgId: string): Promise<QueryResult<BrandKit>> {
  return orgQuery(orgId, async (sql) => {
    const [profile] = await sql`select * from public.brand_profiles where org_id = ${orgId}`;
    const personas = await sql`select id, name, role_title, description, goals, pain_points from public.brand_personas where org_id = ${orgId} order by sort_order, name`;
    const messaging = await sql`select id, kind::text as kind, title, content from public.brand_messaging where org_id = ${orgId} order by sort_order`;
    const voice = await sql`select id, kind::text as kind, term, replacement from public.brand_voice_terms where org_id = ${orgId} order by kind, term`;
    const comps = await sql`select id, name, domain, aliases, color, active from public.competitors where org_id = ${orgId} order by name`;
    const assets = await sql`select id, kind::text as kind, filename, storage_path, mime_type from public.brand_assets where org_id = ${orgId} order by created_at`;
    let p: Record<string, unknown> | null = null;
    if (profile) {
      const { updated_by: _u, ...rest } = profile as Record<string, unknown>;
      void _u;
      p = rest;
    }
    return {
      profile: p,
      personas: personas.map((r) => ({ id: r.id, name: r.name, roleTitle: r.role_title, description: r.description, goals: r.goals, painPoints: r.pain_points })),
      messaging: messaging.map((r) => ({ id: r.id, kind: r.kind, title: r.title, content: r.content })),
      voiceTerms: voice.map((r) => ({ id: r.id, kind: r.kind, term: r.term, replacement: r.replacement })),
      competitors: comps.map((r) => ({ id: r.id, name: r.name, domain: r.domain, aliases: r.aliases, color: r.color, active: r.active })),
      assets: assets.map((r) => ({ id: r.id, kind: r.kind, filename: r.filename, storagePath: r.storage_path, mimeType: r.mime_type })),
    };
  });
}

export async function listContentItems(orgId: string): Promise<QueryResult<ContentItem[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select c.id, c.title, c.content_type, c.status::text as status, c.target_url, c.published_url, p.text as prompt_text, c.updated_at
      from public.content_items c left join public.prompts p on p.id = c.prompt_id
      where c.org_id = ${orgId} order by c.updated_at desc`;
    return rows.map((r) => ({ id: r.id, title: r.title, contentType: r.content_type, status: r.status, targetUrl: r.target_url, publishedUrl: r.published_url, promptText: r.prompt_text, updatedAt: iso(r.updated_at)! }));
  });
}

export async function listCreators(orgId: string): Promise<QueryResult<Creator[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select id, platform::text as platform, handle, display_name, url, followers, avg_views, relevance_score::float8, topics, cited_count, status
      from public.creators where org_id = ${orgId} order by relevance_score desc nulls last`;
    return rows.map((r) => ({ id: r.id, platform: r.platform, handle: r.handle, displayName: r.display_name, url: r.url, followers: num(r.followers), avgViews: num(r.avg_views), relevanceScore: num(r.relevance_score), topics: r.topics, citedCount: r.cited_count, status: r.status }));
  });
}

export async function listOutreach(orgId: string): Promise<QueryResult<OutreachContact[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select id, name, email::text as email, publication, url, domain, role_title, status::text as status, citation_count, last_contacted_at
      from public.outreach_contacts where org_id = ${orgId} order by citation_count desc`;
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, publication: r.publication, url: r.url, domain: r.domain, roleTitle: r.role_title, status: r.status, citationCount: r.citation_count, lastContactedAt: iso(r.last_contacted_at) }));
  });
}

export async function listReports(orgId: string): Promise<QueryResult<Report[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select id, title, report_type, period_start::text, period_end::text, status::text as status, schedule, created_at
      from public.reports where org_id = ${orgId} order by created_at desc`;
    return rows.map((r) => ({ id: r.id, title: r.title, reportType: r.report_type, periodStart: r.period_start, periodEnd: r.period_end, status: r.status, schedule: r.schedule, createdAt: iso(r.created_at)! }));
  });
}
