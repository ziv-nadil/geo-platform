import 'server-only';
import { currentClaims, dbConfigured, withService } from '../db';
import { iso } from './_run';
import type { AdminOrgRow, QueryResult } from './types';

/**
 * Super-admin console: every org with health/billing/onboarding. Service path (bypasses RLS), so it
 * re-checks staff status (aal2 + active platform_admins row) and writes platform_audit_log
 * ('admin.console.view') on every call (security.md §3.3).
 */
export async function adminListOrgs(): Promise<QueryResult<AdminOrgRow[]>> {
  if (!dbConfigured()) return { ok: false, reason: 'not_configured', missing: ['DATABASE_URL'] };
  const claims = await currentClaims();
  if (!claims) return { ok: false, reason: 'unauthenticated' };
  if (claims.aal !== 'aal2') return { ok: false, reason: 'forbidden' };
  return withService(async (sql) => {
    const [staff] = await sql`select 1 from public.platform_admins where user_id = ${claims.sub} and disabled_at is null`;
    if (!staff) return { ok: false, reason: 'forbidden' } as const;
    await sql`insert into public.platform_audit_log (actor_user_id, action, target_type, metadata)
              values (${claims.sub}, 'admin.console.view', 'organizations', ${sql.json({ view: 'adminListOrgs' })})`;
    const rows = await sql`
      select o.id, o.name, o.slug, o.plan, o.status::text as status, o.created_at,
             o.infisical_project_id is not null as vault_provisioned,
             (select count(*)::int from public.memberships m where m.org_id = o.id) as members,
             (select count(*)::int from public.onboarding_progress op where op.org_id = o.id and op.status = 'complete') as onboarding_complete,
             (select count(*)::int from public.onboarding_progress op where op.org_id = o.id and op.status = 'needs_attention') as onboarding_attention,
             (select s.status::text from public.subscriptions s where s.org_id = o.id order by s.created_at desc limit 1) as subscription_status,
             (select count(*)::int from public.prompt_runs pr where pr.org_id = o.id and pr.run_at >= now() - interval '30 days') as runs_30d,
             (select max(pr.run_at) from public.prompt_runs pr where pr.org_id = o.id) as last_run_at
      from public.organizations o order by o.name`;
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id, name: r.name, slug: r.slug, plan: r.plan, status: r.status, createdAt: iso(r.created_at)!,
        members: r.members, onboardingComplete: r.onboarding_complete, onboardingNeedsAttention: r.onboarding_attention,
        subscriptionStatus: r.subscription_status, vaultProvisioned: r.vault_provisioned, runs30d: r.runs_30d, lastRunAt: iso(r.last_run_at),
      })),
    } as const;
  });
}
