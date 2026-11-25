"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { withViewerRls } from "@/lib/data";
import { checkLimit, type LimitKind } from "@/lib/billing/limits";
import type { BrandStyle, IssueStatus, OutreachStage, Role } from "@/lib/ui/data-types";

/**
 * Server actions for dashboard mutations. Every write runs as the signed-in user inside
 * withRls(), so the database's RLS policies decide what is allowed (viewers can't write,
 * clients can't touch other orgs). Results are plain objects the UI can show.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; code?: "plan_limit" };

class PlanLimitError extends Error {}
/** Throws PlanLimitError (rolling back the transaction) when adding `adding` of `kind` would exceed the plan. */
async function enforce(sql: Parameters<typeof checkLimit>[0], orgId: string, kind: LimitKind, adding = 1) {
  const r = await checkLimit(sql, orgId, kind, adding);
  if (!r.ok) throw new PlanLimitError(r.message);
}

const UUID = /^[0-9a-f-]{36}$/i;

async function write<T>(orgId: string, fn: Parameters<typeof withViewerRls<T>>[0], path = "/app"): Promise<Result<T>> {
  if (!UUID.test(orgId)) return { ok: false, error: "Unknown account." };
  try {
    const r = await withViewerRls(fn);
    if (!r.ok) return { ok: false, error: r.reason === "not_configured" ? "The database is not configured." : r.reason === "unauthenticated" ? "Sign in again to save changes." : "You don't have access to change this." };
    revalidatePath(path, "layout");
    return { ok: true, data: r.data };
  } catch (e) {
    if (e instanceof PlanLimitError) return { ok: false, error: e.message, code: "plan_limit" };
    const msg = e instanceof Error ? e.message : String(e);
    if (/row-level security|permission denied/i.test(msg)) return { ok: false, error: "Your role can't make this change. Ask an admin of this account." };
    return { ok: false, error: "Could not save. Try again." };
  }
}

/* ---------------------------------------------------------------- prompts */

export async function addPrompts(orgId: string, texts: string[], opts: { topicId?: string | null; funnel?: string | null; source?: "manual" | "imported" | "suggested" } = {}) {
  const clean = texts.map((t) => t.trim()).filter((t) => t.length >= 8 && t.length <= 500).slice(0, 200);
  if (!clean.length) return { ok: false, error: "Add at least one prompt of 8 characters or more." } as Result;
  return write(orgId, async (sql, claims) => {
    await enforce(sql, orgId, "prompts", clean.length);
    for (const text of clean) {
      await sql`insert into public.prompts (org_id, text, topic_id, funnel_stage, source, created_by)
                values (${orgId}, ${text}, ${opts.topicId ?? null}, ${opts.funnel ?? null}, ${opts.source ?? "manual"}, ${claims.sub})`;
    }
    return clean.length;
  });
}

export async function setPromptActive(orgId: string, promptId: string, active: boolean) {
  return write(orgId, async (sql) => {
    if (active) await enforce(sql, orgId, "prompts", 1);
    await sql`update public.prompts set active = ${active} where id = ${promptId} and org_id = ${orgId} and active <> ${active}`;
  });
}

/* ---------------------------------------------------------------- competitors */

export async function addCompetitor(orgId: string, name: string, domain: string) {
  const n = name.trim();
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (n.length < 2 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return { ok: false, error: "Enter a name and a domain like acme.com." } as Result;
  return write(orgId, async (sql) => {
    const [row] = await sql`insert into public.competitors (org_id, name, domain) values (${orgId}, ${n}, ${d}) returning id`;
    return row!.id as string;
  });
}

export async function removeCompetitor(orgId: string, competitorId: string) {
  return write(orgId, (sql) => sql`update public.competitors set active = false where id = ${competitorId} and org_id = ${orgId}`.then(() => undefined));
}

/* ---------------------------------------------------------------- source tags */

export async function saveSourceTag(orgId: string, tag: { id?: string; name: string; color: string; description: string; domains: string[] }) {
  if (!tag.name.trim()) return { ok: false, error: "Give the tag a name." } as Result;
  return write(orgId, async (sql) => {
    let id = tag.id && UUID.test(tag.id) ? tag.id : null;
    if (id) await sql`update public.source_tags set name = ${tag.name.trim()}, color = ${tag.color}, description = ${tag.description} where id = ${id} and org_id = ${orgId}`;
    else {
      const [row] = await sql`insert into public.source_tags (org_id, name, color, description) values (${orgId}, ${tag.name.trim()}, ${tag.color}, ${tag.description}) returning id`;
      id = row!.id as string;
    }
    await sql`delete from public.source_tag_rules where tag_id = ${id} and org_id = ${orgId}`;
    for (const d of tag.domains.slice(0, 100)) await sql`insert into public.source_tag_rules (org_id, tag_id, match_type, pattern) values (${orgId}, ${id}, 'domain', ${d})`;
    return id;
  });
}

export async function deleteSourceTag(orgId: string, tagId: string) {
  return write(orgId, (sql) => sql`delete from public.source_tags where id = ${tagId} and org_id = ${orgId}`.then(() => undefined));
}

/* ---------------------------------------------------------------- site health / action center */

export async function setIssueStatus(orgId: string, issueId: string, status: IssueStatus) {
  return write(orgId, (sql) => sql`update public.site_health_issues set status = ${status}, resolved_at = ${status === "resolved" ? sql`now()` : null} where id = ${issueId} and org_id = ${orgId}`.then(() => undefined));
}

export async function setOutreachStage(orgId: string, contactId: string, stage: OutreachStage) {
  return write(orgId, (sql) => sql`update public.outreach_contacts set status = ${stage}, last_contacted_at = case when ${stage} = 'contacted' then now() else last_contacted_at end where id = ${contactId} and org_id = ${orgId}`.then(() => undefined));
}

export async function setCreatorStatus(orgId: string, creatorId: string, status: string) {
  return write(orgId, (sql) => sql`update public.creators set status = ${status} where id = ${creatorId} and org_id = ${orgId}`.then(() => undefined));
}

/* ---------------------------------------------------------------- brand kit */

export async function saveBrandKit(orgId: string, style: BrandStyle, terminology: { use: string; avoid: string }[]) {
  return write(orgId, async (sql) => {
    await sql`insert into public.brand_kits (org_id, style) values (${orgId}, ${sql.json(JSON.parse(JSON.stringify(style)))})
              on conflict (org_id) do update set style = excluded.style`;
    await sql`delete from public.brand_voice_terms where org_id = ${orgId} and kind in ('use', 'avoid')`;
    for (const t of terminology) {
      if (t.avoid.trim()) await sql`insert into public.brand_voice_terms (org_id, kind, term, replacement) values (${orgId}, 'avoid', ${t.avoid.trim()}, ${t.use.trim() || null})`;
      else if (t.use.trim()) await sql`insert into public.brand_voice_terms (org_id, kind, term) values (${orgId}, 'use', ${t.use.trim()})`;
    }
  });
}

/* ---------------------------------------------------------------- members, invitations, keys */

export async function inviteMember(orgId: string, email: string, role: Role) {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: "Enter a valid email address." } as Result<string>;
  if (role === "owner") return { ok: false, error: "Invite as admin, then transfer ownership." } as Result<string>;
  const token = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return write<string>(orgId, async (sql, claims) => {
    await enforce(sql, orgId, "seats");
    await sql`insert into public.invitations (org_id, email, role, token_hash, invited_by, expires_at)
              values (${orgId}, ${e}, ${role}, ${hash}, ${claims.sub}, now() + interval '7 days')`;
    // The raw token is returned once so the inviter can copy the link; only its hash is stored.
    return `/invite/${token}`;
  });
}

export async function revokeInvitation(orgId: string, invitationId: string) {
  return write(orgId, (sql) => sql`update public.invitations set status = 'revoked' where id = ${invitationId} and org_id = ${orgId}`.then(() => undefined));
}

export async function setMemberRole(orgId: string, userId: string, role: Role) {
  return write(orgId, (sql) => sql`update public.memberships set role = ${role} where org_id = ${orgId} and user_id = ${userId}`.then(() => undefined));
}

export async function removeMember(orgId: string, userId: string) {
  return write(orgId, (sql) => sql`delete from public.memberships where org_id = ${orgId} and user_id = ${userId} and role <> 'owner'`.then(() => undefined));
}

export async function createApiKey(orgId: string, name: string, scopes: string[]) {
  const n = name.trim();
  if (!n) return { ok: false, error: "Name the key." } as Result<{ key: string; id: string }>;
  const allowed = ["read:metrics", "read:prompts", "write:prompts", "read:citations"];
  const sc = scopes.filter((s) => allowed.includes(s));
  const key = `bgeo_live_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return write<{ key: string; id: string }>(orgId, async (sql, claims) => {
    const [row] = await sql`insert into public.api_keys (org_id, name, prefix, key_hash, scopes, created_by)
                            values (${orgId}, ${n}, ${key.slice(0, 14)}, ${hash}, ${sc}, ${claims.sub}) returning id`;
    return { key, id: row!.id as string };
  });
}

export async function revokeApiKey(orgId: string, keyId: string) {
  return write(orgId, (sql) => sql`update public.api_keys set revoked_at = now() where id = ${keyId} and org_id = ${orgId}`.then(() => undefined));
}

export async function saveOrgGeneral(orgId: string, name: string, website: string) {
  if (!name.trim()) return { ok: false, error: "Name is required." } as Result;
  return write(orgId, (sql) => sql`update public.organizations set name = ${name.trim()}, website = ${website.trim() || null} where id = ${orgId}`.then(() => undefined));
}

export async function saveOrgLocale(orgId: string, country: string, language: string) {
  const c = country.trim().toUpperCase();
  const l = language.trim();
  if (!/^[A-Z]{2}$/.test(c)) return { ok: false, error: "Country must be a 2-letter ISO code (e.g. US)." } as Result;
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l)) return { ok: false, error: "Language must be a code like en or pt-BR." } as Result;
  return write(orgId, (sql) => sql`update public.organizations set country = ${c}, language = ${l} where id = ${orgId}`.then(() => undefined));
}

/* ---------------------------------------------------------------- engines */

export async function setEngineEnabled(orgId: string, engineId: string, enabled: boolean) {
  return write(orgId, async (sql) => {
    if (enabled) {
      const [cur] = await sql`select enabled from public.org_engines where org_id = ${orgId} and engine_id = ${engineId}`;
      if (!cur?.enabled) await enforce(sql, orgId, "engines", 1);
    }
    await sql`insert into public.org_engines (org_id, engine_id, enabled) values (${orgId}, ${engineId}, ${enabled})
              on conflict (org_id, engine_id) do update set enabled = excluded.enabled`;
  });
}
