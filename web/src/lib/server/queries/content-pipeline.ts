import 'server-only';
import type { ArticleDoc } from '../../content/article';
import { createSupabaseAdminClient } from '../supabase/admin';
import { ownedPath } from '../storage-path';
import { iso, orgQuery } from './_run';
import type { QueryResult } from './types';

export interface SettingsRow { mode: 'approve' | 'auto'; defaultWords: number; cadence: 'off' | 'daily' | 'weekly'; maxPerRun: number; lastPlannedAt: string | null }
export interface SuggestionRow { id: string; gapId: string; gapLabel: string; promptText: string | null; title: string; angle: string | null; rationale: string; status: string }
export interface ArticleRow {
  id: string; title: string; status: string; doc: ArticleDoc | null; words: number | null; targetWords: number | null; autoCreated: boolean;
  images: { id: string; kind: string; alt: string; mime: string; url: string | null }[];
  brief: { how_we_beat_them?: string[]; competitor_weaknesses?: string[]; search_intent?: string; angle?: string } | null;
  research: { summary: Record<string, unknown>; notes: string[]; sources: { url: string; kind: string; words: number | null }[] } | null;
  notes: string[]; lint: Record<string, number> | null;
  cmsPlatform: string | null; postUrl: string | null; publishError: string | null; updatedAt: string;
}
export interface PipelineData { settings: SettingsRow; suggestions: SuggestionRow[]; articles: ArticleRow[]; keys: { anthropic: boolean; bria: boolean; dataforseo: boolean } }

export async function loadPipeline(orgId: string): Promise<QueryResult<PipelineData>> {
  const r = await orgQuery(orgId, async (sql) => {
    const [s] = await sql`select mode, default_words, planner_cadence, max_per_run, last_planned_at from public.content_settings where org_id = ${orgId}`;
    const sug = await sql`
      select s.id, s.gap_id, g.label, s.prompt_text, s.title, s.angle, s.rationale, s.status from public.content_suggestions s join public.content_gaps g on g.id = s.gap_id
      where s.org_id = ${orgId} and s.status in ('suggested', 'selected') order by g.score desc, s.created_at limit 60`;
    const arts = await sql`
      select i.id, i.title, i.status::text as status, i.article, i.word_count, i.target_words, i.auto_created, i.images, i.cms_platform, i.cms_post_url, i.publish_error, i.updated_at, i.brief as meta,
             b.brief as brief_doc, r.summary as research_summary, r.notes as research_notes, r.sources as research_sources
      from public.content_items i left join public.content_briefs b on b.id = i.brief_id left join public.content_research r on r.id = b.research_id
      where i.org_id = ${orgId} and i.content_type = 'article' and i.status <> 'archived' order by i.updated_at desc limit 30`;
    return { s, sug, arts };
  });
  if (!r.ok) return r;
  const admin = createSupabaseAdminClient();
  const articles: ArticleRow[] = [];
  for (const a of r.data.arts) {
    const imgs = ((a.images ?? []) as { id: string; kind: string; path: string; alt: string; mime: string }[]).filter((i) => ownedPath(orgId, i.path));
    const urls = admin && imgs.length ? (await admin.storage.from('content-images').createSignedUrls(imgs.map((i) => i.path), 3600)).data ?? [] : [];
    const meta = (a.meta ?? {}) as { notes?: string[]; lint?: Record<string, number> };
    articles.push({
      id: a.id, title: a.title, status: a.status, doc: a.article as ArticleDoc | null, words: a.word_count, targetWords: a.target_words, autoCreated: a.auto_created,
      images: imgs.map((i, n) => ({ id: i.id, kind: i.kind, alt: i.alt, mime: i.mime, url: urls[n]?.signedUrl ?? null })),
      brief: a.brief_doc as ArticleRow['brief'],
      research: a.research_summary ? { summary: a.research_summary, notes: a.research_notes ?? [], sources: ((a.research_sources ?? []) as { url: string; kind: string; structure?: { words?: number } | null }[]).map((x) => ({ url: x.url, kind: x.kind, words: x.structure?.words ?? null })) } : null,
      notes: meta.notes ?? [], lint: meta.lint ?? null, cmsPlatform: a.cms_platform, postUrl: a.cms_post_url, publishError: a.publish_error, updatedAt: iso(a.updated_at)!,
    });
  }
  const s = r.data.s;
  return { ok: true, data: {
    settings: { mode: (s?.mode ?? 'approve') as SettingsRow['mode'], defaultWords: s?.default_words ?? 1800, cadence: (s?.planner_cadence ?? 'weekly') as SettingsRow['cadence'], maxPerRun: s?.max_per_run ?? 3, lastPlannedAt: iso(s?.last_planned_at) },
    suggestions: r.data.sug.map((x) => ({ id: x.id, gapId: x.gap_id, gapLabel: x.label, promptText: x.prompt_text, title: x.title, angle: x.angle, rationale: x.rationale, status: x.status })),
    articles,
    keys: { anthropic: !!process.env.ANTHROPIC_API_KEY?.trim(), bria: !!process.env.BRIA_API_KEY?.trim(), dataforseo: !!(process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim()) },
  } };
}
