import 'server-only';
import { sanitizeArticle, type ArticleDoc } from '../../content/article';
import { buildChapters, chapterLines, lintMetadata, parseChapters, type VideoMetadata } from '../../youtube/metadata';
import { FULL_PLAN, quotaModelFromEnv, videoCost, videosAffordable, type UploadPlan } from '../../youtube/quota';
import { buildSrt, fixScript, lintScript, timelineFromDurations, type ScriptScene, type VideoScript } from '../../youtube/script';
import { loadClientContext } from '../content-pipeline/context';
import { briaImage } from '../content-pipeline/images';
import type { Runner } from '../content-pipeline/research';
import { createSupabaseAdminClient } from '../supabase/admin';
import { articleBlogUrl, generateVideoPlan } from './generate';
import { orgAccessToken } from './google';
import { synthLines } from './tts';
import { isQuotaError, ensurePlaylist, uploadAll } from './upload';
import { ownedPath } from '../storage-path';

export type Step<T = undefined> = { ok: true; data: T } | { ok: false; error: string; notConfigured?: string[] };
const fail = (error: string, notConfigured?: string[]) => ({ ok: false as const, error, notConfigured });
export const BUCKET = 'youtube-assets';

export interface SceneAsset { index: number; kind: 'image' | 'chart' | 'card'; path: string | null; startSec: number; endSec: number; onScreen: string; chart?: { title: string; unit: string; points: { label: string; value: number }[] } }

const personaOf = (c: { persona_name?: string | null } | undefined, brand: string) => (c?.persona_name?.trim() || `${brand} Insights Desk`);
const planFromEnv = (): UploadPlan => ({ ...FULL_PLAN, captions: process.env.YOUTUBE_SKIP_CAPTIONS !== '1', syntheticFollowup: process.env.YOUTUBE_SYNTHETIC_FOLLOWUP !== 'off', linkComment: process.env.YOUTUBE_POST_LINK_COMMENT === '1' });

/** Approved or published articles with a blog URL that have no video yet, newest first. */
export async function eligibleArticles(run: Runner, orgId: string, limit: number) {
  return run((sql) => sql`
    select c.id, c.title from public.content_items c
    where c.org_id = ${orgId} and c.article is not null and c.status::text in ('approved', 'published')
      and coalesce(c.published_url, c.cms_post_url, c.target_url) is not null
      and not exists (select 1 from public.youtube_videos v where v.content_item_id = c.id and v.status <> 'rejected')
    order by c.updated_at desc limit ${limit}`);
}

/** Article -> script + metadata draft (needs human approval unless the channel is in auto mode). */
export async function createVideoDraft(run: Runner, orgId: string, itemId: string): Promise<Step<{ videoId: string; lint: string[] }>> {
  const row = await run(async (sql) => {
    const [item] = await sql`select id, article, published_url, cms_post_url, target_url, status::text as status from public.content_items where id = ${itemId} and org_id = ${orgId}`;
    if (!item?.article) return null;
    const [ch] = await sql`select persona_name from public.youtube_channels where org_id = ${orgId}`;
    return { item, ch, ctx: await loadClientContext(sql, orgId) };
  });
  if (!row) return fail('Article not found.');
  const article = sanitizeArticle(row.item.article as ArticleDoc);
  if (!article) return fail('The saved article is invalid. Edit and save it first.');
  const blogUrl = articleBlogUrl(row.item as never);
  const persona = personaOf(row.ch, row.ctx.brand.name);
  const g = await generateVideoPlan({ article, blogUrl, ctx: row.ctx, persona });
  if (g.status === 'not_configured') return fail(`Set ${g.missing.join(', ')} to write scripts.`, g.missing);
  if (g.status === 'error') return fail(g.message);
  const issues = [...lintScript(g.script).map((i) => i.message), ...lintMetadata(g.meta).map((i) => i.message)];
  try {
    const id = await run(async (sql) => (await sql`
      insert into public.youtube_videos (org_id, content_item_id, script, metadata) values (${orgId}, ${itemId}, ${sql.json(g.script as never)}, ${sql.json({ ...g.meta, lint: issues } as never)})
      returning id`)[0].id as string);
    return { ok: true, data: { videoId: id, lint: issues } };
  } catch { return fail('A video for this article already exists.'); }
}

export async function saveDraft(run: Runner, orgId: string, videoId: string, v: { script: VideoScript; meta: VideoMetadata }): Promise<Step<{ lint: string[] }>> {
  const cur = await run(async (sql) => (await sql`select status from public.youtube_videos where id = ${videoId} and org_id = ${orgId}`)[0]);
  if (!cur) return fail('Video not found.');
  if (!['draft', 'approved', 'failed'].includes(cur.status as string)) return fail('This video is already in production. Reject it and create a new draft to change it.');
  const script = fixScript(v.script);
  const lint = [...lintScript(script).map((i) => i.message), ...lintMetadata(v.meta).map((i) => i.message)];
  // Script edits invalidate generated assets: back to draft so approval, TTS and rendering run again.
  await run((sql) => sql`update public.youtube_videos set script = ${sql.json(script as never)}, metadata = ${sql.json({ ...v.meta, lint } as never)}, status = 'draft', error = null, approved_by = null, approved_at = null, audio_path = null, scene_assets = '[]'::jsonb, srt = null where id = ${videoId} and org_id = ${orgId}`);
  return { ok: true, data: { lint } };
}

/** Approval is blocked while the script or metadata has lint errors, so a bad video never reaches upload. */
export async function approveVideo(run: Runner, orgId: string, videoId: string, userId: string | null): Promise<Step> {
  const v = await run(async (sql) => (await sql`select status, script, metadata from public.youtube_videos where id = ${videoId} and org_id = ${orgId}`)[0]);
  if (!v) return fail('Video not found.');
  if (!['draft', 'failed'].includes(v.status as string)) return fail('Only drafts can be approved.');
  const issues = [...lintScript(v.script as VideoScript), ...lintMetadata(v.metadata as VideoMetadata)];
  if (issues.length) return fail(`Fix first: ${issues[0].message}`);
  await run((sql) => sql`update public.youtube_videos set status = 'approved', approved_by = ${userId}, approved_at = now(), error = null where id = ${videoId} and org_id = ${orgId}`);
  return { ok: true, data: undefined };
}

export async function rejectVideo(run: Runner, orgId: string, videoId: string): Promise<Step> {
  await run((sql) => sql`update public.youtube_videos set status = 'rejected' where id = ${videoId} and org_id = ${orgId} and status not in ('uploaded', 'uploading')`);
  return { ok: true, data: undefined };
}

/** TTS + Bria scene images + thumbnail + SRT. Stores everything in the private bucket; status -> assets_ready. */
export async function buildAssets(run: Runner, orgId: string, videoId: string): Promise<Step<{ seconds: number; notes: string[] }>> {
  const admin = createSupabaseAdminClient();
  if (!admin) return fail('Storage is not configured (Supabase service role).', ['SUPABASE_SERVICE_ROLE_KEY']);
  const v = await run(async (sql) => (await sql`select v.script, v.metadata, v.status, c.article from public.youtube_videos v join public.content_items c on c.id = v.content_item_id where v.id = ${videoId} and v.org_id = ${orgId}`)[0]);
  if (!v || v.status !== 'approved') return fail('Video is not approved.');
  const script = v.script as VideoScript, meta = v.metadata as VideoMetadata;
  const charts = new Map(((v.article as ArticleDoc | null)?.charts ?? []).map((c) => [c.id, c]));
  const notes: string[] = [];
  const bad = async (msg: string) => { await run((sql) => sql`update public.youtube_videos set status = 'failed', error = ${msg} where id = ${videoId}`); return fail(msg); };
  const put = async (name: string, bytes: Buffer, contentType: string) => { const path = `${orgId}/${videoId}/${name}`; const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true }); return error ? null : path; };

  const lines = [script.hook, ...script.scenes.map((s) => s.text), script.outro].filter(Boolean);
  const tts = await synthLines(lines);
  if (tts.status === 'not_configured') return fail(`Set ${tts.missing.join(', ')} for the voice.`, tts.missing);
  if (tts.status === 'error') return bad(tts.message);
  const audioPath = await put('voice.wav', tts.wav, 'audio/wav');
  if (!audioPath) return bad('Could not store the audio.');
  const tl = timelineFromDurations(script, tts.durations);

  const scenes: SceneAsset[] = [];
  let briaOff = false;
  for (let i = 0; i < script.scenes.length; i++) {
    const sc: ScriptScene = script.scenes[i], b = tl.sceneBounds[i];
    const base = { index: i, startSec: +b.start.toFixed(2), endSec: +b.end.toFixed(2), onScreen: sc.onScreen };
    const ch = sc.chartId ? charts.get(sc.chartId) : null;
    if (ch) { scenes.push({ ...base, kind: 'chart', path: null, chart: { title: ch.title, unit: ch.unit, points: ch.points.slice(0, 8) } }); continue; }
    let path: string | null = null;
    if (!briaOff && sc.imagePrompt) {
      const r = await briaImage(sc.imagePrompt, '16:9');
      if (r.status === 'ok') path = await put(`scene-${i}.${r.mime === 'image/jpeg' ? 'jpg' : r.mime.split('/')[1]}`, r.bytes, r.mime);
      else { notes.push(r.status === 'not_configured' ? `Images skipped: set ${r.missing.join(', ')}` : `Scene ${i + 1} image: ${r.message}`); if (r.status === 'not_configured') briaOff = true; }
    }
    scenes.push({ ...base, kind: path ? 'image' : 'card', path });
  }
  let thumbPath: string | null = null;
  if (!briaOff && meta.thumbnailPrompt) {
    const r = await briaImage(meta.thumbnailPrompt, '16:9');
    if (r.status === 'ok') thumbPath = await put(`thumb-src.${r.mime === 'image/jpeg' ? 'jpg' : r.mime.split('/')[1]}`, r.bytes, r.mime);
  }
  // Exact timings are now known: refresh the chapters in the description.
  const chapters = buildChapters(tl.sceneBounds, script.scenes.map((s) => s.onScreen), tl.total);
  let description = meta.description;
  const old = parseChapters(description);
  if (old.length && chapters.length) description = description.replace(/Chapters\n(?:.+\n?)+/, `Chapters\n${chapterLines(chapters).join('\n')}\n`);
  const srt = buildSrt(tl.lines);
  await run((sql) => sql`update public.youtube_videos set status = 'assets_ready', audio_path = ${audioPath}, scene_assets = ${sql.json(scenes as never)}, thumb_path = ${thumbPath}, srt = ${srt}, duration_sec = ${tl.total.toFixed(2)},
    metadata = ${sql.json({ ...meta, chapters, description, assetNotes: notes } as never)}, error = null where id = ${videoId} and org_id = ${orgId}`);
  return { ok: true, data: { seconds: Math.round(tl.total), notes } };
}

async function usedToday(run: Runner) {
  return run(async (sql) => (await sql`select coalesce(sum(quota_units), 0)::int as units, count(*)::int as uploads from public.youtube_videos where uploaded_at is not null and (uploaded_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date`)[0]);
}

/** Upload a rendered video (insert + thumbnail + captions + playlist + synthetic flag). Honours the daily quota budget across all clients. */
export async function uploadVideo(run: Runner, orgId: string, videoId: string): Promise<Step<{ youtubeId: string; notes: string[] }>> {
  const admin = createSupabaseAdminClient();
  if (!admin) return fail('Storage is not configured (Supabase service role).');
  const v = await run(async (sql) => (await sql`select v.status, v.metadata, v.srt, v.video_path, v.thumb_path from public.youtube_videos v where v.id = ${videoId} and v.org_id = ${orgId}`)[0]);
  const ch = await run(async (sql) => (await sql`select status, privacy, default_playlist from public.youtube_channels where org_id = ${orgId}`)[0]);
  if (!v || v.status !== 'rendered' || !v.video_path) return fail('Video is not rendered yet.');
  if (!ch || ch.status !== 'connected') return fail('Connect the YouTube channel first.');
  const meta = v.metadata as VideoMetadata;
  const issues = lintMetadata(meta);
  if (issues.length) return fail(`Metadata needs a fix: ${issues[0].message}`);
  const plan = planFromEnv(), model = quotaModelFromEnv(process.env.YOUTUBE_QUOTA_MODEL);
  const u = await usedToday(run);
  if (videosAffordable(plan, model, u.units, u.uploads) < 1) return fail(`Today's YouTube quota is used (${u.units} units). The upload retries after the daily reset.`);
  const tok = await orgAccessToken(orgId);
  if (tok.status === 'not_configured') return fail(`Set ${tok.missing.join(', ')}.`, tok.missing);
  if (tok.status === 'reauth') { await run((sql) => sql`update public.youtube_channels set status = 'reauth_needed', last_error = 'Access was revoked or expired.' where org_id = ${orgId}`); return fail('YouTube access expired. Reconnect the channel.'); }
  if (tok.status === 'error') return fail(tok.message);
  await run((sql) => sql`update public.youtube_videos set status = 'uploading', error = null where id = ${videoId} and status = 'rendered'`);
  try {
    const dl = async (raw: string) => { const p = ownedPath(orgId, raw); if (!p) return null; const { data } = await admin.storage.from(BUCKET).download(p); return data ? { bytes: Buffer.from(await data.arrayBuffer()), mime: data.type || 'image/jpeg' } : null; };
    const video = await dl(v.video_path as string);
    if (!video) throw new Error('The rendered video file is missing from storage.');
    const thumb = v.thumb_path ? await dl(v.thumb_path as string) : null;
    let playlistId = (ch.default_playlist as string | null) ?? null;
    if (plan.playlist && !playlistId && meta.playlist) { try { playlistId = await ensurePlaylist(tok.token, meta.playlist); await run((sql) => sql`update public.youtube_channels set default_playlist = ${playlistId} where org_id = ${orgId}`); } catch { playlistId = null; } }
    const privacy = (process.env.YOUTUBE_PRIVACY as 'private' | 'unlisted' | 'public' | undefined) ?? (ch.privacy as 'private' | 'unlisted' | 'public');
    const link = `Full guide with sources: ${meta.blogUrl}`;
    const r = await uploadAll({ token: tok.token, video: video.bytes, meta, privacy, thumb, srt: v.srt as string | null, playlistId, plan, model, extraLinkComment: link });
    const note = r.notes.length ? r.notes.join(' | ') : null;
    await run((sql) => sql`update public.youtube_videos set status = 'uploaded', youtube_video_id = ${r.videoId}, privacy_status = ${r.privacyStatus}, upload_status = ${r.uploadStatus}, quota_units = ${r.quota}, uploaded_at = now(), error = ${note} where id = ${videoId}`);
    return { ok: true, data: { youtubeId: r.videoId, notes: r.notes } };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : 'Upload failed';
    // Quota errors are transient: keep it rendered so the next day's tick retries. Other errors need a human.
    await run((sql) => sql`update public.youtube_videos set status = ${isQuotaError(e) ? 'rendered' : 'failed'}, error = ${msg} where id = ${videoId}`);
    return fail(msg);
  }
}

export { videoCost };
