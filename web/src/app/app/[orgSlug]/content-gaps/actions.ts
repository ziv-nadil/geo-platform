"use server";

import { notifyPublished } from "@/lib/server/indexing";
import { revalidatePath } from "next/cache";
import { requireOrgAccess, type OrgRole } from "@/lib/server/auth";
import { withRls } from "@/lib/server/db";
import { buildJsonLd } from "@/lib/content-gaps/jsonld";
import { renderMarkdown, sanitizeDoc, type ListicleDoc } from "@/lib/content-gaps/listicle";
import { detectAndStoreGaps } from "@/lib/server/content-gaps/detect";
import { generateListicle, loadBrandContext } from "@/lib/server/content-gaps/generate";
import { publishDraft, type Target } from "@/lib/server/content-gaps/publish";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; notConfigured?: string[] };
const UUID = /^[0-9a-f-]{36}$/i;

async function gate(orgId: string, role: OrgRole) {
  const a = await requireOrgAccess(orgId, role);
  if (a.ok) return a;
  const status = a.response.status;
  return { ok: false as const, error: status === 403 ? (role === "admin" ? "Approving and publishing needs the admin role." : "Your role can't make this change.") : status === 401 ? "Sign in again." : "Unknown account." };
}
const dbErr = (e: unknown): Result => ({ ok: false, error: /row-level security|permission denied|requires the admin role/i.test(String(e)) ? "Your role can't make this change." : "Could not save. Try again." });
const done = (orgSlugPath = "/app") => revalidatePath(orgSlugPath, "layout");

export async function detectGaps(orgId: string, days = 30): Promise<Result<{ gaps: number }>> {
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  try { const r = await withRls(a.claims, (sql) => detectAndStoreGaps(sql, orgId, days)); done(); return { ok: true, data: r }; } catch (e) { return dbErr(e); }
}

export async function generateForGap(orgId: string, gapId: string): Promise<Result<{ itemId: string }>> {
  if (!UUID.test(gapId)) return { ok: false, error: "Unknown gap." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  try {
    const ctx = await withRls(a.claims, async (sql) => {
      const [g] = await sql`select id, label, sample_prompts, competitors, top_domains from public.content_gaps where id = ${gapId} and org_id = ${orgId}`;
      if (!g) return null;
      return { g, brand: await loadBrandContext(sql, orgId) };
    });
    if (!ctx) return { ok: false, error: "Gap not found." };
    const res = await generateListicle({ label: ctx.g.label, samplePrompts: ctx.g.sample_prompts, competitors: ctx.g.competitors, topDomains: ctx.g.top_domains }, ctx.brand);
    if (res.status === "not_configured") return { ok: false, error: `Generation is not configured: set ${res.missing.join(", ")}.`, notConfigured: res.missing };
    if (res.status === "error") return { ok: false, error: res.message };
    const id = await withRls(a.claims, async (sql) => {
      const [row] = await sql`
        insert into public.content_items (org_id, gap_id, title, content_type, status, body_md, doc, json_ld, brand_kit_snapshot, model, brief)
        values (${orgId}, ${gapId}, ${res.doc.title}, 'listicle', 'draft', ${res.markdown}, ${sql.json(res.doc as never)}, ${sql.json(res.jsonLd as never)},
                ${sql.json(ctx.brand as never)}, ${res.model}, ${sql.json({ usage: res.usage, prompts: ctx.g.sample_prompts } as never)})
        returning id`;
      await sql`update public.content_gaps set status = 'drafting' where id = ${gapId} and org_id = ${orgId}`;
      return row.id as string;
    });
    done(); return { ok: true, data: { itemId: id } };
  } catch (e) { return dbErr(e); }
}

export async function saveDraft(orgId: string, itemId: string, edited: ListicleDoc): Promise<Result> {
  if (!UUID.test(itemId)) return { ok: false, error: "Unknown draft." };
  const doc = sanitizeDoc(edited);
  if (!doc) return { ok: false, error: "A listicle needs a title and at least 3 items." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  try {
    const n = await withRls(a.claims, (sql) => sql`
      update public.content_items set title = ${doc.title}, doc = ${sql.json(doc as never)}, json_ld = ${sql.json(buildJsonLd(doc, null) as never)}, body_md = ${renderMarkdown(doc)}
      where id = ${itemId} and org_id = ${orgId} and status in ('draft', 'in_review')`);
    if (!n.count) return { ok: false, error: "Only drafts and items in review can be edited." };
    done(); return { ok: true };
  } catch (e) { return dbErr(e); }
}

const FLOW: Record<string, { from: string[]; to: string; role: OrgRole }> = {
  submit: { from: ["draft"], to: "in_review", role: "member" },
  reject: { from: ["in_review", "approved"], to: "draft", role: "admin" },
  approve: { from: ["in_review"], to: "approved", role: "admin" },
};

export async function transition(orgId: string, itemId: string, action: "submit" | "reject" | "approve"): Promise<Result> {
  const f = FLOW[action];
  if (!f || !UUID.test(itemId)) return { ok: false, error: "Invalid request." };
  const a = await gate(orgId, f.role); if (!a.ok) return a;
  try {
    const n = await withRls(a.claims, (sql) => sql`
      update public.content_items set status = ${f.to as never},
        approved_by = ${action === "approve" ? a.userId : null}, approved_at = ${action === "approve" ? new Date() : null}
      where id = ${itemId} and org_id = ${orgId} and status::text = any(${f.from})`);
    if (!n.count) return { ok: false, error: `Can't ${action} from this state.` };
    done(); return { ok: true };
  } catch (e) { return dbErr(e); }
}

/** Approved drafts only; creates a DRAFT post / draft PR in the client's own CMS or repo, never a live post. */
export async function publishToClientSite(orgId: string, itemId: string, target: Target = "auto"): Promise<Result<{ url: string }>> {
  if (!UUID.test(itemId)) return { ok: false, error: "Unknown draft." };
  const a = await gate(orgId, "admin"); if (!a.ok) return a;
  try {
    const item = await withRls(a.claims, async (sql) => (await sql`select doc, status::text as status from public.content_items where id = ${itemId} and org_id = ${orgId}`)[0]);
    if (!item) return { ok: false, error: "Draft not found." };
    if (item.status !== "approved") return { ok: false, error: "Approve the draft before sending it to your site." };
    const doc = sanitizeDoc(item.doc as ListicleDoc);
    if (!doc) return { ok: false, error: "The saved draft is invalid. Edit and save it first." };
    const r = await publishDraft(orgId, doc, target);
    if (r.status === "not_configured") return { ok: false, error: `Connect your site first: ${r.missing.join("; ")}.`, notConfigured: r.missing };
    if (r.status === "error") {
      await withRls(a.claims, (sql) => sql`update public.content_items set publish_error = ${r.message} where id = ${itemId} and org_id = ${orgId}`);
      done(); return { ok: false, error: r.message };
    }
    await withRls(a.claims, (sql) => sql`
      update public.content_items set status = 'published', cms_platform = ${r.platform}, cms_post_id = ${r.postId}, cms_post_url = ${r.postUrl}, published_url = ${r.postUrl}, publish_error = null
      where id = ${itemId} and org_id = ${orgId}`);
    await notifyPublished(orgId, r.postUrl);
    done(); return { ok: true, data: { url: r.postUrl } };
  } catch (e) { return dbErr(e); }
}

export async function dismissGap(orgId: string, gapId: string): Promise<Result> {
  if (!UUID.test(gapId)) return { ok: false, error: "Unknown gap." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  try { await withRls(a.claims, (sql) => sql`update public.content_gaps set status = 'dismissed' where id = ${gapId} and org_id = ${orgId}`); done(); return { ok: true }; } catch (e) { return dbErr(e); }
}
