import 'server-only';
import type { ListicleDoc } from '../../content-gaps/listicle';
import { iso, orgQuery } from './_run';
import type { QueryResult } from './types';

export interface GapRow {
  id: string; label: string; funnel: string | null; promptCount: number; samplePrompts: string[];
  competitors: { id: string; name: string; mentions: number; citations: number }[];
  topDomains: { domain: string; category: string | null; citations: number; authority: number }[];
  score: number; parts: { importance: number; presence: number; authority: number }; status: string; detectedAt: string; itemId: string | null;
}
export interface ListicleRow {
  id: string; gapId: string | null; title: string; status: string; doc: ListicleDoc | null; jsonLd: unknown; model: string | null;
  cmsPlatform: string | null; postUrl: string | null; publishError: string | null; approvedAt: string | null; updatedAt: string;
}

export async function listGaps(orgId: string): Promise<QueryResult<GapRow[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select g.*, (select ci.id from public.content_items ci where ci.gap_id = g.id order by ci.created_at desc limit 1) as item_id
      from public.content_gaps g where g.org_id = ${orgId} and g.status <> 'dismissed' order by g.score desc`;
    return rows.map((r) => ({
      id: r.id, label: r.label, funnel: r.funnel_stage, promptCount: r.prompt_count, samplePrompts: r.sample_prompts, competitors: r.competitors, topDomains: r.top_domains,
      score: Number(r.score), parts: r.score_parts, status: r.status, detectedAt: iso(r.detected_at)!, itemId: r.item_id,
    }));
  });
}

export async function listListicles(orgId: string): Promise<QueryResult<ListicleRow[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select id, gap_id, title, status::text as status, doc, json_ld, model, cms_platform, cms_post_url, publish_error, approved_at, updated_at
      from public.content_items where org_id = ${orgId} and content_type = 'listicle' and status <> 'archived' order by updated_at desc`;
    return rows.map((r) => ({
      id: r.id, gapId: r.gap_id, title: r.title, status: r.status, doc: r.doc as ListicleDoc | null, jsonLd: r.json_ld, model: r.model, cmsPlatform: r.cms_platform,
      postUrl: r.cms_post_url, publishError: r.publish_error, approvedAt: iso(r.approved_at), updatedAt: iso(r.updated_at)!,
    }));
  });
}
