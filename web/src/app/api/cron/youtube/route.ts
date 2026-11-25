import { checkCronAuth, cronError, notConfigured } from '@/lib/engines/pipeline/cron';
import { getSql } from '@/lib/engines/pipeline/db';
import { withService } from '@/lib/server/db';
import { buildAssets, approveVideo, createVideoDraft, eligibleArticles, uploadVideo } from '@/lib/server/youtube/run';

export const maxDuration = 300;

/**
 * YouTube engine tick (every 15 minutes via GitHub Actions). Per connected channel, in order:
 *   1. upload rendered videos (quota-checked)   2. TTS + images for approved videos
 *   3. auto mode: approve clean drafts           4. draft one new video per day from an eligible article
 * Rendering itself runs in the youtube-render GitHub Actions job (ffmpeg), not here.
 */
async function handle(req: Request): Promise<Response> {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const db = getSql();
  if (!db.ok) return notConfigured(db.missing);
  const run = <T,>(fn: Parameters<typeof withService<T>>[0]) => withService(fn);
  try {
    const channels = await withService((sql) => sql`select org_id, mode, daily_limit from public.youtube_channels where status = 'connected'`);
    const started = Date.now();
    const out: Record<string, unknown>[] = [];
    for (const c of channels) {
      if (Date.now() - started > 230_000) break;
      const orgId = c.org_id as string, r: Record<string, unknown> = { orgId };
      for (const v of await withService((sql) => sql`select id from public.youtube_videos where org_id = ${orgId} and status = 'rendered' order by created_at limit 2`)) {
        const u = await uploadVideo(run, orgId, v.id as string); r[`upload:${v.id}`] = u.ok ? 'ok' : u.error;
      }
      for (const v of await withService((sql) => sql`select id from public.youtube_videos where org_id = ${orgId} and status = 'approved' order by approved_at limit 1`)) {
        if (Date.now() - started > 200_000) break;
        const b = await buildAssets(run, orgId, v.id as string); r[`assets:${v.id}`] = b.ok ? 'ok' : b.error;
      }
      if (c.mode === 'auto') for (const v of await withService((sql) => sql`select id from public.youtube_videos where org_id = ${orgId} and status = 'draft' and error is null limit 3`)) await approveVideo(run, orgId, v.id as string, null);
      const [{ n }] = await withService((sql) => sql`select count(*)::int as n from public.youtube_videos where org_id = ${orgId} and status <> 'rejected' and created_at > now() - interval '24 hours'`);
      if ((n as number) < (c.daily_limit as number) && Date.now() - started < 180_000) {
        const [item] = await eligibleArticles(run, orgId, 1);
        if (item) { const d = await createVideoDraft(run, orgId, item.id as string); r.draft = d.ok ? d.data.videoId : d.error; }
      }
      out.push(r);
    }
    return Response.json({ status: 'ok', channels: out.length, results: out });
  } catch (err) { return cronError(err); }
}
export const GET = handle;
export const POST = handle;
