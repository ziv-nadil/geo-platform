"use server";

import { redirect } from "next/navigation";
import { withService } from "@/lib/server/db";
import { getViewer, viewerClaims } from "@/lib/data";

/**
 * Platform staff "view as": creates an audited, time-boxed (60 min) read grant in
 * platform_access_grants. RLS then lets this admin read the org exactly like a viewer.
 * Requires an active platform_admins row and an aal2 (MFA) session.
 */
export async function startViewAs(formData: FormData) {
  const viewer = await getViewer();
  const claims = await viewerClaims();
  if (!viewer.ok || !claims || !viewer.data.isPlatformAdmin) redirect("/app");
  if (viewer.data.aal !== "aal2") redirect("/admin?error=mfa");
  const orgId = String(formData.get("orgId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Support review from the admin console";
  const slug = await withService(async (sql) => {
    const [org] = await sql`select slug from public.organizations where id = ${orgId}`;
    if (!org) return null;
    await sql`update public.platform_access_grants set ended_at = now() where admin_user_id = ${claims.sub} and org_id = ${orgId} and ended_at is null`;
    await sql`insert into public.platform_access_grants (admin_user_id, org_id, mode, reason, expires_at)
              values (${claims.sub}, ${orgId}, 'view', ${reason.padEnd(10, ".")}, now() + interval '60 minutes')`;
    await sql`insert into public.platform_audit_log (actor_user_id, action, org_id, target_type, target_id, metadata)
              values (${claims.sub}, 'admin.view_as.start', ${orgId}, 'organization', ${orgId}, ${sql.json({ reason })})`;
    return org.slug as string;
  });
  if (!slug) redirect("/admin");
  redirect(`/app/${slug}`);
}

export async function exitViewAs() {
  const claims = await viewerClaims();
  if (claims) {
    await withService(async (sql) => {
      const ended = await sql`update public.platform_access_grants set ended_at = now()
                              where admin_user_id = ${claims.sub} and ended_at is null and expires_at > now() returning org_id`;
      for (const g of ended) {
        await sql`insert into public.platform_audit_log (actor_user_id, action, org_id, target_type, target_id) values (${claims.sub}, 'admin.view_as.end', ${g.org_id}, 'organization', ${g.org_id})`;
      }
    });
  }
  redirect("/admin");
}
