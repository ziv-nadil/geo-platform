import 'server-only';
import type { TxSql } from '../db';
import { articleWordCount, buildArticleJsonLd, renderArticleMarkdown, sanitizeArticle, type ArticleDoc, type AssetMap } from '../../content/article';
import { publishArticleDraft, type ArticleImage, type Target } from '../content-gaps/publish';
import { writeBrief } from './brief';
import { loadClientContext } from './context';
import { writeArticle } from './copywriter';
import { buildImages, downloadImage, type StoredImage } from './images';
import { ownedPath } from '../storage-path';
import { loadSettings, planContent } from './planner';
import { runResearch, type Runner } from './research';

export type StepResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; notConfigured?: string[] };
const fail = (error: string, notConfigured?: string[]): { ok: false; error: string; notConfigured?: string[] } => ({ ok: false, error, notConfigured });

export interface CreateInput { orgId: string; gapId: string; title: string; words?: number; suggestionId?: string | null; promptText?: string | null; auto?: boolean }

/** Research -> brief -> article (lint) -> images -> content_items draft. Each stage persists, so a failure keeps what was built. */
export async function createArticle(run: Runner, i: CreateInput): Promise<StepResult<{ itemId: string; words: number; notes: string[] }>> {
  const ctxRow = await run(async (sql) => {
    const [g] = await sql`select id, label, prompt_ids, sample_prompts from public.content_gaps where id = ${i.gapId} and org_id = ${i.orgId}`;
    if (!g) return null;
    const settings = await loadSettings(sql, i.orgId);
    return { g, settings, ctx: await loadClientContext(sql, i.orgId) };
  });
  if (!ctxRow) return fail('Gap not found.');
  const { g, settings, ctx } = ctxRow;
  const words = Math.min(5000, Math.max(600, Math.round(i.words ?? settings.defaultWords)));
  const promptText = i.promptText || (g.sample_prompts as string[])[0] || (g.label as string);
  const ownDomain = ctx.brand.domain ? (() => { try { return new URL(ctx.brand.domain!.includes('://') ? ctx.brand.domain! : `https://${ctx.brand.domain}`).hostname.replace(/^www\./, ''); } catch { return null; } })() : null;
  const notes: string[] = [];

  const research = await runResearch(run, { orgId: i.orgId, promptIds: g.prompt_ids as string[], promptText, ownDomain });
  notes.push(...research.notes);
  const researchId = await run(async (sql) => (await sql`
    insert into public.content_research (org_id, gap_id, prompt_text, status, sources, summary, notes)
    values (${i.orgId}, ${i.gapId}, ${promptText}, ${research.status}, ${sql.json(research.sources as never)}, ${sql.json(research.summary as never)}, ${research.notes})
    returning id`)[0].id as string);

  const b = await writeBrief({ title: i.title, promptText, targetWords: words, ctx, research, gapLabel: g.label as string });
  if (b.status === 'not_configured') return fail(`Writing is not configured: set ${b.missing.join(', ')}.`, b.missing);
  if (b.status === 'error') return fail(b.message);
  const briefId = await run(async (sql) => (await sql`
    insert into public.content_briefs (org_id, gap_id, research_id, suggestion_id, title, target_words, brief, model)
    values (${i.orgId}, ${i.gapId}, ${researchId}, ${i.suggestionId ?? null}, ${i.title}, ${words}, ${sql.json(b.brief as never)}, 'claude-sonnet-5-5') returning id`)[0].id as string);

  const art = await writeArticle({ title: i.title, promptText, targetWords: words, ctx, brief: b.brief, research, gapLabel: g.label as string, siteDomain: ctx.brand.domain });
  if (art.status === 'not_configured') return fail(`Writing is not configured: set ${art.missing.join(', ')}.`, art.missing);
  if (art.status === 'error') return fail(art.message);
  const itemId = await run(async (sql) => {
    const [row] = await sql`
      insert into public.content_items (org_id, gap_id, brief_id, title, content_type, status, body_md, article, json_ld, target_words, word_count, brand_kit_snapshot, model, brief, auto_created)
      values (${i.orgId}, ${i.gapId}, ${briefId}, ${art.doc.title}, 'article', 'draft', ${renderArticleMarkdown(art.doc)}, ${sql.json(art.doc as never)},
              ${sql.json(buildArticleJsonLd(art.doc, { publisher: ctx.brand.name, author: ctx.brand.name }) as never)}, ${words}, ${art.words}, ${sql.json(ctx.brand as never)}, ${art.model},
              ${sql.json({ usage: art.usage, prompt: promptText, lint: art.changes } as never)}, ${!!i.auto})
      returning id`;
    await sql`update public.content_gaps set status = 'drafting' where id = ${i.gapId} and org_id = ${i.orgId}`;
    if (i.suggestionId) await sql`update public.content_suggestions set status = 'created' where id = ${i.suggestionId} and org_id = ${i.orgId}`;
    return row.id as string;
  });

  const img = await buildImages(i.orgId, itemId, art.doc);
  notes.push(...img.notes);
  await run((sql) => sql`update public.content_items set images = ${sql.json(img.images as never)}, brief = brief || ${sql.json({ notes } as never)} where id = ${itemId} and org_id = ${i.orgId}`);
  return { ok: true, data: { itemId, words: art.words, notes } };
}

/** Download stored images and create the DRAFT in the client's CMS or repo; records status. Never publishes live. */
export async function deliverItem(run: Runner, orgId: string, itemId: string, target: Target = 'auto'): Promise<StepResult<{ url: string }>> {
  const item = await run(async (sql) => (await sql`select article, images, status::text as status from public.content_items where id = ${itemId} and org_id = ${orgId}`)[0]);
  if (!item?.article) return fail('Article not found.');
  const doc = sanitizeArticle(item.article as ArticleDoc);
  if (!doc) return fail('The saved article is invalid. Edit and save it first.');
  const brandName = await run(async (sql) => ((await sql`select coalesce(p.display_name, o.name) as n from public.organizations o left join public.brand_profiles p on p.org_id = o.id where o.id = ${orgId}`)[0]?.n as string) ?? 'Our team');
  const stored = (item.images ?? []) as StoredImage[];
  const files: ArticleImage[] = [];
  for (const s of stored) { const p = ownedPath(orgId, s.path); const f = p ? await downloadImage(p) : null; if (f) files.push({ id: s.id, kind: s.kind, alt: s.alt, mime: s.mime, bytes: f.bytes }); }
  const r = await publishArticleDraft(orgId, doc, files, brandName, target);
  if (r.status === 'not_configured') return fail(`Connect your site first: ${r.missing.join('; ')}.`, r.missing);
  if (r.status === 'error') {
    await run((sql) => sql`update public.content_items set publish_error = ${r.message} where id = ${itemId} and org_id = ${orgId}`);
    return fail(r.message);
  }
  await run((sql) => sql`update public.content_items set status = 'published', cms_platform = ${r.platform}, cms_post_id = ${r.postId}, cms_post_url = ${r.postUrl}, published_url = ${r.postUrl}, publish_error = null where id = ${itemId} and org_id = ${orgId}`);
  return { ok: true, data: { url: r.postUrl } };
}

export { articleWordCount };
export type { AssetMap };

export interface PlannerRun { orgId: string; planned: number; created: number; delivered: number; status: string; message?: string }

/** Cron entry per org: refresh suggestions; in auto mode create + deliver drafts for the top suggestion of each gap. */
export async function runPlannerForOrg(run: Runner, orgId: string): Promise<PlannerRun> {
  const settings = await run((sql: TxSql) => loadSettings(sql, orgId));
  const plan = await run((sql) => planContent(sql, orgId, { limit: settings.maxPerRun }));
  await run((sql) => sql`insert into public.content_settings (org_id, last_planned_at) values (${orgId}, now()) on conflict (org_id) do update set last_planned_at = now()`);
  const out: PlannerRun = { orgId, planned: plan.suggestions, created: 0, delivered: 0, status: plan.status, message: plan.message ?? plan.missing?.join(', ') };
  if (settings.mode !== 'auto' || plan.status !== 'ok') return out;
  const firstPerGap = new Map<string, string>();
  for (const s of plan.suggestionIds) if (!firstPerGap.has(s.gapId)) firstPerGap.set(s.gapId, s.id);
  for (const [gapId, suggestionId] of [...firstPerGap].slice(0, settings.maxPerRun)) {
    const sg = await run(async (sql) => (await sql`select title, prompt_text from public.content_suggestions where id = ${suggestionId}`)[0]);
    if (!sg) continue;
    const c = await createArticle(run, { orgId, gapId, title: sg.title as string, promptText: sg.prompt_text as string | null, suggestionId, auto: true });
    if (!c.ok) { out.message = c.error; continue; }
    out.created++;
    const d = await deliverItem(run, orgId, c.data.itemId);
    if (d.ok) out.delivered++; else out.message = d.error;
  }
  return out;
}
