"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAccess, type OrgRole } from "@/lib/server/auth";
import { withRls, withService } from "@/lib/server/db";
import { upsertSecret } from "@/lib/server/infisical";
import { readSecret } from "@/lib/server/secrets/broker";
import { resolveSecretTarget } from "@/lib/server/secrets/catalog";
import { approveSuggestion, dbApproveDeps, rejectSuggestion } from "@/lib/server/social-pulse/approve";
import { PLATFORMS } from "@/lib/server/social-pulse/config";
import { postPulseToSlack, runPulseForOrg } from "@/lib/server/social-pulse/pulse";
import { createSlackApp } from "@/lib/server/social-pulse/slack";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

async function gate(orgId: string, role: OrgRole) {
  const a = await requireOrgAccess(orgId, role);
  if (a.ok) return a;
  const s = a.response.status;
  return { ok: false as const, error: s === 403 ? "Your role can't make this change." : s === 401 ? "Sign in again." : "Unknown account." };
}
const done = () => revalidatePath("/app", "layout");

export async function savePulseSettings(orgId: string, v: { enabled: boolean; platforms: string[]; keywords: string; maxItems: number; maxRuns: number; budgetUsd: number; channel: string }): Promise<Result> {
  const platforms = v.platforms.filter((p) => (PLATFORMS as string[]).includes(p));
  const keywords = v.keywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean).slice(0, 10);
  const items = Math.round(v.maxItems), runs = Math.round(v.maxRuns), budget = Math.round(v.budgetUsd * 100) / 100;
  if (!(items >= 5 && items <= 100)) return { ok: false, error: "Items per platform must be between 5 and 100." };
  if (!(runs >= 1 && runs <= 10)) return { ok: false, error: "Runs per day must be between 1 and 10." };
  if (!(budget >= 0 && budget <= 1000)) return { ok: false, error: "Monthly budget must be between $0 and $1,000." };
  const channel = v.channel.replace(/^#/, "").trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "-").slice(0, 80) || null;
  const a = await gate(orgId, "admin"); if (!a.ok) return a;
  try {
    await withRls(a.claims, (sql) => sql`
      insert into public.social_pulse_settings (org_id, enabled, platforms, extra_keywords, max_items_per_platform, max_runs_per_day, monthly_budget_usd, slack_channel)
      values (${orgId}, ${!!v.enabled}, ${platforms}::text[], ${keywords}::text[], ${items}, ${runs}, ${budget}, ${channel})
      on conflict (org_id) do update set enabled = excluded.enabled, platforms = excluded.platforms, extra_keywords = excluded.extra_keywords,
        max_items_per_platform = excluded.max_items_per_platform, max_runs_per_day = excluded.max_runs_per_day, monthly_budget_usd = excluded.monthly_budget_usd,
        slack_channel = excluded.slack_channel, slack_channel_id = case when social_pulse_settings.slack_channel is distinct from excluded.slack_channel then null else social_pulse_settings.slack_channel_id end`);
    done(); return { ok: true };
  } catch { return { ok: false, error: "Could not save. Try again." }; }
}

export async function runPulseNow(orgId: string): Promise<Result<{ insights: number; items: number; costUsd: number; notes: string[] }>> {
  const a = await gate(orgId, "admin"); if (!a.ok) return a;
  const r = await runPulseForOrg(orgId, { force: true });
  if (r.status === "not_configured") return { ok: false, error: `Not configured: set ${r.missing?.join(", ") ?? "keys"}.` };
  if (r.status !== "ok") return { ok: false, error: r.message };
  done(); return { ok: true, data: { insights: r.insights, items: r.items, costUsd: r.costUsd, notes: r.notes } };
}

export async function approveTitle(orgId: string, id: string): Promise<Result<{ itemId: string }>> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown title." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  const out = await approveSuggestion(dbApproveDeps((fn) => withRls(a.claims, fn), orgId), id, { via: "app", by: a.userId });
  done();
  if (out.status === "created") return { ok: true, data: { itemId: out.itemId } };
  if (out.status === "already_decided") return { ok: false, error: "This title was already approved or rejected." };
  return { ok: false, error: out.notConfigured ? `Writing is not configured: set ${out.notConfigured.join(", ")}.` : out.error };
}

export async function rejectTitle(orgId: string, id: string): Promise<Result> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown title." };
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  const ok = await rejectSuggestion((fn) => withRls(a.claims, fn), orgId, id, { via: "app", by: a.userId });
  done(); return ok ? { ok: true } : { ok: false, error: "This title was already decided." };
}

export async function postToSlack(orgId: string): Promise<Result<{ message: string }>> {
  const a = await gate(orgId, "member"); if (!a.ok) return a;
  const r = await postPulseToSlack(orgId);
  done(); return r.posted ? { ok: true, data: { message: r.message } } : { ok: false, error: r.message };
}

/** Create the client's dedicated Slack app from a manifest using their app configuration token (stored via the secrets broker). */
export async function createSlackBot(orgId: string): Promise<Result<{ installUrl: string | null; appId: string }>> {
  const a = await gate(orgId, "admin"); if (!a.ok) return a;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return { ok: false, error: "Not configured: set NEXT_PUBLIC_APP_URL." };
  const tok = await readSecret({ orgId, purpose: "job", worker: "beacon-social-pulse" }, { stepId: "chat", fieldId: "slack_config_token" });
  if (tok.status === "not_configured") return { ok: false, error: `Not configured: ${tok.missing.join(", ")}.` };
  if (tok.status !== "ok") return { ok: false, error: "Add the Slack app configuration token in the onboarding Slack step first. It expires after 12 hours, so generate a fresh one." };
  const [org] = await withService((sql) => sql`select o.name, o.infisical_project_id, p.display_name from public.organizations o left join public.brand_profiles p on p.org_id = o.id where o.id = ${orgId}`);
  const app = await createSlackApp(tok.value, appUrl, ((org?.display_name as string | null) || (org?.name as string)) ?? "ASO Engine");
  if (!app.ok) return { ok: false, error: `Slack refused the manifest: ${app.error}. The token may have expired.` };
  const target = resolveSecretTarget("chat", "slack_signing_secret", {});
  if ("error" in target || !org?.infisical_project_id) return { ok: false, error: "Could not store the signing secret (vault not provisioned)." };
  const w = await upsertSecret({ projectId: org.infisical_project_id as string, secretPath: target.secretPath, secretName: target.secretName, value: app.signingSecret, stepId: "chat" });
  if (w.status === "not_configured") return { ok: false, error: `Not configured: ${w.missing.join(", ")}.` };
  await withService(async (sql) => {
    await sql`
      insert into public.secret_refs (org_id, step_id, field_id, infisical_project_id, secret_path, secret_name, infisical_secret_version, created_by)
      values (${orgId}, 'chat', 'slack_signing_secret', ${org.infisical_project_id}, ${target.secretPath}, ${target.secretName}, ${w.version}, ${a.staff ? null : a.userId})
      on conflict (org_id, step_id, field_id) do update set secret_path = excluded.secret_path, secret_name = excluded.secret_name, infisical_secret_version = excluded.infisical_secret_version, test_status = null, test_message = null, last_tested_at = null`;
    await sql`insert into public.social_pulse_settings (org_id, slack_app_id) values (${orgId}, ${app.appId}) on conflict (org_id) do update set slack_app_id = excluded.slack_app_id`;
  });
  done(); return { ok: true, data: { installUrl: app.installUrl, appId: app.appId } };
}
