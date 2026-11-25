"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAccess, type OrgRole } from "@/lib/server/auth";
import { withRls, type TxSql } from "@/lib/server/db";
import { articleWordCount, buildArticleJsonLd, lintArticle, renderArticleMarkdown, sanitizeArticle, type ArticleDoc } from "@/lib/content/article";
import type { Target } from "@/lib/server/content-gaps/publish";
import { planContent } from "@/lib/server/content-pipeline/planner";
import { createArticle, deliverItem } from "@/lib/server/content-pipeline/run";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; notConfigured?: string[] };
const UUID = /^[0-9a-f-]{36}$/i;

async function gate(orgId: string, role: OrgRole) {
  const a = await requireOrgAccess(orgId, role);
  if (a.ok) return a;
  const s = a.response.status;
  return { ok: false as const, error: s === 403 ? (role === "member" ? "Your role can't make this change." : "This needs the admin role.") : s === 401 ? "Sign in again." : "Unknown account." };
}
const dbErr = (e: unknown): Result => ({ ok: false, error: /row-level security|permission denied|requires the admin role/i.test(String(e)) ? "Your role can't make this change." : "Could not save. Try again." });
const done = () => revalidatePath("/app", "layout");

export async function saveContentSettings(orgId: string, v: { mode: string; defaultWords: number; cadence: string; maxPerRun: number }): Promise<Result> {
  if (!["approve", "auto"].includes(v.mode) || !["off", "daily", "weekly"].includes(v.cadence)) return { ok: false, error: "Invalid settings." };
  const words = Math.round(v.defaultWords), per = Math.round(v.maxPerRun);
  if (!(words >= 600 && words <= 5000)) return { ok: false, error: "Length must be between 600 and 5,000 words." };
  if (!(per >= 1 && per <= 10)) return { ok: false, error: "Articles per run must be between 1 and 10." };
  const a = await gate(orgId, "admin"); if (!a.ok) return a;
  try {
    await withRls(a.claims, (sql) => sql`
      insert into public.content_settings (org_id, mode, default_words, planner_cadence, max_per_run) values (${orgId}, ${v.mode}, ${words}, ${v.cadence}, ${per})
      on conflict (org_id) do update set mode = excluded.mode, default_words = excluded.default_words, planner_cadence = excluded.planner_cadence, max_per_run = excluded.max_per_run`);
    done(); return { ok: true };
  } catch (e) { return dbErr(e); }
}

/** Run the planner now: new titles (with rationale) for the top open gaps that have no content yet. */
export async function runPlannerNow(orgId: string): Promise<Result<{ suggestions: number }>> {
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  try {
    const r = await withRls(a.claims, (sql: TxSql) => planContent(sql, orgId, { limit: 4 }));
    if (r.status === "not_configured") return { ok: false, error: `The planner is not configured: set ${r.missing?.join(", ")}.`, notConfigured: r.missing };
    if (r.status === "error") return { ok: false, error: r.message ?? "Planning failed." };
    if (r.status === "nothing_to_plan") return { ok: false, error: "Every open gap already has suggestions or a draft. Detect gaps again after new monitoring runs." };
    done(); return { ok: true, data: { suggestions: r.suggestions } };
  } catch (e) { return dbErr(e); }
}

export async function dismissSuggestion(orgId: string, id: string): Promise<Result> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown suggestion." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  try { await withRls(a.claims, (sql) => sql`update public.content_suggestions set status = 'dismissed' where id = ${id} and org_id = ${orgId}`); done(); return { ok: true }; } catch (e) { return dbErr(e); }
}

/** "Create": research, brief, article, images for one selected title. Length overrides the org default for this article only. */
export async function createFromSuggestion(orgId: string, suggestionId: string, words?: number): Promise<Result<{ itemId: string; words: number; notes: string[] }>> {
  if (!UUID.test(suggestionId)) return { ok: false, error: "Unknown suggestion." };
  if (words !== undefined && !(words >= 600 && words <= 5000)) return { ok: false, error: "Length must be between 600 and 5,000 words." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  try {
    const run = <T,>(fn: (sql: TxSql) => Promise<T>) => withRls(a.claims, fn);
    const s = await run(async (sql) => (await sql`select gap_id, title, prompt_text from public.content_suggestions where id = ${suggestionId} and org_id = ${orgId} and status in ('suggested','selected')`)[0]);
    if (!s) return { ok: false, error: "Suggestion not found or already used." };
    await run((sql) => sql`update public.content_suggestions set status = 'selected' where id = ${suggestionId} and org_id = ${orgId}`);
    const r = await createArticle(run, { orgId, gapId: s.gap_id as string, title: s.title as string, promptText: s.prompt_text as string | null, suggestionId, words });
    if (!r.ok) { await run((sql) => sql`update public.content_suggestions set status = 'suggested' where id = ${suggestionId} and org_id = ${orgId} and status = 'selected'`); return r; }
    done(); return { ok: true, data: r.data };
  } catch (e) { return dbErr(e); }
}

export async function saveArticle(orgId: string, itemId: string, edited: ArticleDoc): Promise<Result<{ words: number }>> {
  if (!UUID.test(itemId)) return { ok: false, error: "Unknown article." };
  const parsed = sanitizeArticle(edited);
  if (!parsed) return { ok: false, error: "An article needs a title, a direct answer and at least 3 sections." };
  const { doc } = lintArticle(parsed);
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  try {
    const words = articleWordCount(doc);
    const n = await withRls(a.claims, (sql) => sql`
      update public.content_items set title = ${doc.title}, article = ${sql.json(doc as never)}, body_md = ${renderArticleMarkdown(doc)}, word_count = ${words},
        json_ld = ${sql.json(buildArticleJsonLd(doc, {}) as never)}
      where id = ${itemId} and org_id = ${orgId} and content_type = 'article' and status in ('draft', 'in_review')`);
    if (!n.count) return { ok: false, error: "Only drafts and items in review can be edited." };
    done(); return { ok: true, data: { words } };
  } catch (e) { return dbErr(e); }
}

/** Approved articles only; creates a DRAFT in the client's CMS or a draft PR, never a live post. */
export async function sendArticleToSite(orgId: string, itemId: string, target: Target = "auto"): Promise<Result<{ url: string }>> {
  if (!UUID.test(itemId)) return { ok: false, error: "Unknown article." };
  const a = await gate(orgId, "admin"); if (!a.ok) return a;
  try {
    const run = <T,>(fn: (sql: TxSql) => Promise<T>) => withRls(a.claims, fn);
    const st = await run(async (sql) => (await sql`select status::text as status from public.content_items where id = ${itemId} and org_id = ${orgId} and content_type = 'article'`)[0]);
    if (!st) return { ok: false, error: "Article not found." };
    if (st.status !== "approved") return { ok: false, error: "Approve the article before sending it to your site." };
    const r = await deliverItem(run, orgId, itemId, target);
    done(); return r;
  } catch (e) { return dbErr(e); }
}
