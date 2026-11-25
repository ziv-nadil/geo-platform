import { Suspense } from "react";
import { loadPage, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { YoutubeView, type YtChannel, type YtVideo } from "@/components/dashboard/youtube-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgAccess } from "@/lib/server/auth";
import { withRls } from "@/lib/server/db";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { BUCKET, eligibleArticles } from "@/lib/server/youtube/run";
import { youtubeMissing } from "@/lib/server/youtube/google";
import { QUOTA_COSTS, FULL_PLAN, quotaModelFromEnv, videoCost } from "@/lib/youtube/quota";

export const metadata = { title: "YouTube" };

export default function YoutubePage(props: PageProps<"/app/[orgSlug]/youtube">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Youtube {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Youtube(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, sp } = ctx;
  const a = await requireOrgAccess(org.id, "viewer");
  if (!a.ok) return null;
  const { channel, rows, ready } = await withRls(a.claims, async (sql) => {
    const [channel] = await sql`select status, channel_title, persona_name, persona_blurb, mode, privacy, daily_limit, last_error from public.youtube_channels where org_id = ${org.id}`;
    const rows = await sql`select v.id, v.status, v.script, v.metadata, v.video_path, v.youtube_video_id, v.privacy_status, v.error, v.duration_sec, v.quota_units, v.created_at, c.title as article_title
      from public.youtube_videos v join public.content_items c on c.id = v.content_item_id where v.org_id = ${org.id} order by v.created_at desc limit 40`;
    return { channel, rows, ready: (await eligibleArticles((fn) => fn(sql), org.id, 5)).length };
  });
  const admin = createSupabaseAdminClient();
  const videos: YtVideo[] = await Promise.all(rows.map(async (r) => ({
    id: r.id as string, status: r.status as string, articleTitle: r.article_title as string, script: r.script as YtVideo["script"], meta: r.metadata as YtVideo["meta"],
    lint: ((r.metadata as { lint?: string[] }).lint ?? []), youtubeId: (r.youtube_video_id as string | null), privacyStatus: (r.privacy_status as string | null), error: (r.error as string | null),
    durationSec: r.duration_sec ? Number(r.duration_sec) : null, createdAt: (r.created_at as Date).toISOString(),
    previewUrl: admin && r.video_path ? (await admin.storage.from(BUCKET).createSignedUrl(r.video_path as string, 3600)).data?.signedUrl ?? null : null,
  })));
  const model = quotaModelFromEnv(process.env.YOUTUBE_QUOTA_MODEL);
  const ch: YtChannel = {
    status: (channel?.status as YtChannel["status"]) ?? "not_connected", title: (channel?.channel_title as string | null) ?? null, personaName: (channel?.persona_name as string) ?? "", personaBlurb: (channel?.persona_blurb as string) ?? "",
    mode: (channel?.mode as string) ?? "approve", privacy: (channel?.privacy as string) ?? "private", dailyLimit: (channel?.daily_limit as number) ?? 1, lastError: (channel?.last_error as string | null) ?? null,
  };
  return (
    <>
      <PageHeader title="YouTube" description="A separate expert-education channel. Each approved article becomes a short video whose job is to carry your blog links and metadata." />
      <YoutubeView orgId={org.id} orgName={org.name} channel={ch} videos={videos} readyArticles={ready} canAdmin={a.role === "owner" || a.role === "admin"} missingEnv={youtubeMissing()} flash={typeof sp.yt === "string" ? { code: sp.yt, msg: typeof sp.msg === "string" ? sp.msg : "" } : null}
        quota={{ model, perVideo: videoCost(FULL_PLAN, model), insert: QUOTA_COSTS[model].insert }} />
    </>
  );
}
