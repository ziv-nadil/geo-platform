import { checkCronAuth, cronError } from '@/lib/engines/pipeline/cron';
import { withService } from '@/lib/server/db';
import { createSupabaseAdminClient } from '@/lib/server/supabase/admin';
import { BUCKET, type SceneAsset } from '@/lib/server/youtube/run';
import { cleanScenes } from '../../../../../scripts/youtube/render-plan.mjs';
import { ownedPath } from '@/lib/server/storage-path';

/**
 * Render worker protocol (GitHub Actions, scripts/youtube-render.mjs). Auth: Bearer CRON_SECRET.
 *   GET  -> claims the next assets_ready video (or a stale 'rendering' one) and returns a job with short-lived signed URLs.
 *   POST -> { id, ok, durationSec?, error? } marks it rendered (after checking the mp4 exists) or failed.
 * The worker never holds the service key or any YouTube credential.
 */
const TTL = 3600;

export async function GET(req: Request): Promise<Response> {
  const denied = checkCronAuth(req); if (denied) return denied;
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ status: 'not_configured', missing: ['SUPABASE_SERVICE_ROLE_KEY'] }, { status: 503 });
  try {
    const job = await withService(async (sql) => (await sql`
      update public.youtube_videos set status = 'rendering', error = null where id = (
        select id from public.youtube_videos where status = 'assets_ready' or (status = 'rendering' and updated_at < now() - interval '40 minutes')
        order by created_at for update skip locked limit 1)
      returning id, org_id, audio_path, scene_assets, thumb_path, srt, metadata, duration_sec`)[0]);
    if (!job) return Response.json({ status: 'idle' });
    const sign = async (raw: string | null) => { const p = ownedPath(job.org_id as string, raw); return p ? (await admin.storage.from(BUCKET).createSignedUrl(p, TTL)).data?.signedUrl ?? null : null; };
    const up = async (p: string) => (await admin.storage.from(BUCKET).createSignedUploadUrl(p, { upsert: true })).data?.signedUrl ?? null;
    const dir = `${job.org_id}/${job.id}`;
    const scenes = await Promise.all((cleanScenes(job.scene_assets) as unknown as SceneAsset[]).map(async (s) => ({ ...s, url: await sign(s.path) })));
    return Response.json({
      status: 'job', id: job.id, durationSec: Number(job.duration_sec), srt: job.srt, audioUrl: await sign(job.audio_path as string), scenes,
      thumbSourceUrl: await sign(job.thumb_path as string | null), thumbText: (job.metadata as { thumbnailText?: string }).thumbnailText ?? '',
      videoUploadUrl: await up(`${dir}/video.mp4`), thumbUploadUrl: await up(`${dir}/thumb.jpg`),
    });
  } catch (e) { return cronError(e); }
}

export async function POST(req: Request): Promise<Response> {
  const denied = checkCronAuth(req); if (denied) return denied;
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ status: 'not_configured', missing: ['SUPABASE_SERVICE_ROLE_KEY'] }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { id?: string; ok?: boolean; durationSec?: number; error?: string; thumb?: boolean } | null;
  if (!b?.id || !/^[0-9a-f-]{36}$/i.test(b.id)) return Response.json({ status: 'bad_request' }, { status: 400 });
  try {
    const v = await withService(async (sql) => (await sql`select org_id from public.youtube_videos where id = ${b.id!} and status = 'rendering'`)[0]);
    if (!v) return Response.json({ status: 'not_found' }, { status: 404 });
    if (!b.ok) { await withService((sql) => sql`update public.youtube_videos set status = 'failed', error = ${String(b.error ?? 'Render failed').slice(0, 300)} where id = ${b.id!}`); return Response.json({ status: 'recorded' }); }
    const dir = `${v.org_id}/${b.id}`;
    const { data } = await admin.storage.from(BUCKET).list(dir, { search: 'video.mp4' });
    if (!data?.some((f) => f.name === 'video.mp4')) return Response.json({ status: 'missing_upload' }, { status: 409 });
    const thumb = b.thumb ? `${dir}/thumb.jpg` : null;
    await withService((sql) => sql`update public.youtube_videos set status = 'rendered', video_path = ${`${dir}/video.mp4`}, thumb_path = coalesce(${thumb}, thumb_path), duration_sec = coalesce(${b.durationSec ?? null}, duration_sec), error = null where id = ${b.id!}`);
    return Response.json({ status: 'ok' });
  } catch (e) { return cronError(e); }
}
