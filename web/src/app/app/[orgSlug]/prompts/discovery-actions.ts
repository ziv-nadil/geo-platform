"use server";

import { revalidatePath } from "next/cache";
import { withViewerRls } from "@/lib/data";
import { checkLimit } from "@/lib/billing/limits";
import { runDiscovery, type DiscoveryReport } from "@/lib/server/discovery/run";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; code?: "plan_limit" };
const UUID = /^[0-9a-f-]{36}$/i;
class LimitError extends Error {}

async function write<T>(orgId: string, fn: Parameters<typeof withViewerRls<T>>[0]): Promise<Result<T>> {
  if (!UUID.test(orgId)) return { ok: false, error: "Unknown account." };
  try {
    const r = await withViewerRls(fn);
    if (!r.ok) return { ok: false, error: r.reason === "unauthenticated" ? "Sign in again." : r.reason === "not_configured" ? "The database is not configured." : "You don't have access to change this." };
    revalidatePath("/app", "layout");
    return { ok: true, data: r.data };
  } catch (e) {
    if (e instanceof LimitError) return { ok: false, error: e.message, code: "plan_limit" };
    if (/row-level security|permission denied/i.test(String(e))) return { ok: false, error: "Your role can't make this change." };
    return { ok: false, error: "Could not save. Try again." };
  }
}

export async function refreshSuggestions(orgId: string) {
  return write<DiscoveryReport>(orgId, (sql) => runDiscovery(sql, orgId));
}

/** Bulk accept: respects the plan's tracked-prompt limit as one all-or-nothing check. */
export async function acceptSuggestions(orgId: string, ids: string[]) {
  const clean = ids.filter((i) => UUID.test(i)).slice(0, 100);
  if (!clean.length) return { ok: false, error: "Select at least one suggestion." } as Result;
  return write<number>(orgId, async (sql, claims) => {
    const rows = await sql`select id, text, topic_name, funnel_stage from public.prompt_suggestions where org_id = ${orgId} and status = 'new' and id in ${sql(clean)}`;
    if (!rows.length) return 0;
    const lim = await checkLimit(sql, orgId, "prompts", rows.length);
    if (!lim.ok) throw new LimitError(lim.message);
    for (const r of rows) {
      const [topic] = r.topic_name ? await sql`select id from public.topics where org_id = ${orgId} and lower(name) = lower(${r.topic_name}) limit 1` : [];
      const [p] = await sql`insert into public.prompts (org_id, text, topic_id, funnel_stage, source, created_by)
                            values (${orgId}, ${r.text}, ${topic?.id ?? null}, ${r.funnel_stage}, 'suggested', ${claims.sub}) returning id`;
      await sql`update public.prompt_suggestions set status = 'accepted', prompt_id = ${p!.id} where id = ${r.id}`;
    }
    return rows.length;
  });
}

export async function dismissSuggestions(orgId: string, ids: string[]) {
  const clean = ids.filter((i) => UUID.test(i)).slice(0, 100);
  if (!clean.length) return { ok: false, error: "Select at least one suggestion." } as Result;
  return write(orgId, async (sql) => { await sql`update public.prompt_suggestions set status = 'dismissed' where org_id = ${orgId} and status = 'new' and id in ${sql(clean)}`; });
}
