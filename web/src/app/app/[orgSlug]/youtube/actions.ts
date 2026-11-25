"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAccess, type OrgRole } from "@/lib/server/auth";
import { withRls } from "@/lib/server/db";
import { approveVideo, createVideoDraft, eligibleArticles, rejectVideo, saveDraft } from "@/lib/server/youtube/run";
import { buildChapters, type VideoMetadata } from "@/lib/youtube/metadata";
import { timeline, type VideoScript } from "@/lib/youtube/script";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; notConfigured?: string[] };
const UUID = /^[0-9a-f-]{36}$/i;

async function gate(orgId: string, role: OrgRole) {
  const a = await requireOrgAccess(orgId, role);
  if (a.ok) return a;
  const s = a.response.status;
  return { ok: false as const, error: s === 403 ? (role === "member" ? "Your role can't make this change." : "This needs the admin role.") : s === 401 ? "Sign in again." : "Unknown account." };
}
const done = () => revalidatePath("/app", "layout");

export async function saveYoutubeSettings(orgId: string, v: { personaName: string; personaBlurb: string; mode: string; privacy: string; dailyLimit: number }): Promise<Result> {
  if (!["approve", "auto"].includes(v.mode) || !["private", "unlisted", "public"].includes(v.privacy)) return { ok: false, error: "Invalid settings." };
  const lim = Math.round(v.dailyLimit);
  if (!(lim >= 0 && lim <= 10)) return { ok: false, error: "Daily limit must be 0 to 10." };
  const persona = v.personaName.replace(/[<>]/g, "").trim().slice(0, 60);
  if (!persona) return { ok: false, error: "Give the presenter persona a branded name, for example \"Acme Insights Desk\"." };
  if (/\b(dr|prof|phd|md|cpa)\b\.?/i.test(persona)) return { ok: false, error: "The persona is a brand presenter, so it cannot carry a title or credential." };
  const a = await gate(orgId, "admin"); if (!a.ok) return a;
  try {
    await withRls(a.claims, (sql) => sql`
      insert into public.youtube_channels (org_id, persona_name, persona_blurb, mode, privacy, daily_limit) values (${orgId}, ${persona}, ${v.personaBlurb.slice(0, 400)}, ${v.mode}, ${v.privacy}, ${lim})
      on conflict (org_id) do update set persona_name = excluded.persona_name, persona_blurb = excluded.persona_blurb, mode = excluded.mode, privacy = excluded.privacy, daily_limit = excluded.daily_limit`);
    done(); return { ok: true };
  } catch { return { ok: false, error: "Could not save. Try again." }; }
}

/** Draft a video from the next eligible article (or a chosen one). */
export async function draftVideo(orgId: string, itemId?: string): Promise<Result<{ videoId: string }>> {
  if (itemId && !UUID.test(itemId)) return { ok: false, error: "Unknown article." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  const run = <T,>(fn: Parameters<typeof withRls<T>>[1]) => withRls(a.claims, fn);
  let id = itemId;
  if (!id) { const [n] = await eligibleArticles(run, orgId, 1); if (!n) return { ok: false, error: "No article is ready. An article needs to be approved or published with a public blog URL." }; id = n.id as string; }
  const r = await createVideoDraft(run, orgId, id);
  if (!r.ok) return r;
  done(); return { ok: true, data: { videoId: r.data.videoId } };
}

export async function saveVideo(orgId: string, videoId: string, v: { script: VideoScript; meta: VideoMetadata }): Promise<Result<{ lint: string[] }>> {
  if (!UUID.test(videoId)) return { ok: false, error: "Unknown video." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  const run = <T,>(fn: Parameters<typeof withRls<T>>[1]) => withRls(a.claims, fn);
  // Keep the chapters block in step with a title or scene label edit: rebuild it from the script's estimated timeline.
  const t = timeline(v.script);
  const chapters = buildChapters(t.sceneBounds, v.script.scenes.map((s) => s.onScreen), t.total);
  const meta = { ...v.meta, chapters, containsSyntheticMedia: true };
  const r = await saveDraft(run, orgId, videoId, { script: v.script, meta });
  if (!r.ok) return r;
  done(); return { ok: true, data: r.data };
}

export async function approve(orgId: string, videoId: string): Promise<Result> {
  if (!UUID.test(videoId)) return { ok: false, error: "Unknown video." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  const r = await approveVideo((fn) => withRls(a.claims, fn), orgId, videoId, a.userId);
  if (!r.ok) return r;
  done(); return { ok: true };
}

export async function reject(orgId: string, videoId: string): Promise<Result> {
  if (!UUID.test(videoId)) return { ok: false, error: "Unknown video." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  await rejectVideo((fn) => withRls(a.claims, fn), orgId, videoId);
  done(); return { ok: true };
}

