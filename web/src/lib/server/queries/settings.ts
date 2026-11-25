import 'server-only';
import { iso, orgQuery } from './_run';
import { getUsage } from '@/lib/billing/limits';
import type { ApiKey, Billing, Invitation, Member, OrgRole, QueryResult } from './types';

export async function listMembers(orgId: string): Promise<QueryResult<Member[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select m.user_id, p.email::text as email, p.full_name, m.role::text as role, m.created_at
      from public.memberships m left join public.profiles p on p.id = m.user_id
      where m.org_id = ${orgId}
      order by array_position(array['owner','admin','member','viewer'], m.role::text), p.full_name`;
    return rows.map((r) => ({ userId: r.user_id, email: r.email, fullName: r.full_name, role: r.role as OrgRole, joinedAt: iso(r.created_at)! }));
  });
}

export async function listInvitations(orgId: string): Promise<QueryResult<Invitation[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select id, email::text as email, role::text as role, status::text as status, expires_at, created_at
      from public.invitations where org_id = ${orgId} order by created_at desc`;
    return rows.map((r) => ({ id: r.id, email: r.email, role: r.role as OrgRole, status: r.status, expiresAt: iso(r.expires_at)!, createdAt: iso(r.created_at)! }));
  });
}

export async function listApiKeys(orgId: string): Promise<QueryResult<ApiKey[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at
      from public.api_keys where org_id = ${orgId} order by created_at desc`;
    return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, lastUsedAt: iso(r.last_used_at), expiresAt: iso(r.expires_at), revokedAt: iso(r.revoked_at), createdAt: iso(r.created_at)! }));
  });
}

export async function getBilling(orgId: string): Promise<QueryResult<Billing>> {
  return orgQuery(orgId, async (sql) => {
    const [plan] = await sql`
      select pl.id, pl.name, pl.monthly_price_cents, pl.seat_limit, pl.prompt_limit, pl.engine_limit, pl.runs_per_month
      from public.organizations o join public.plans pl on pl.id = o.plan where o.id = ${orgId}`;
    const [sub] = await sql`
      select status::text as status, seats, current_period_end, cancel_at_period_end, trial_end
      from public.subscriptions where org_id = ${orgId} order by created_at desc limit 1`;
    const usage = await sql`
      select metric, period_start::text, value from public.usage_counters
      where org_id = ${orgId} order by period_start desc, metric limit 24`;
    const plans = await sql`select id, name, monthly_price_cents, annual_price_cents, (stripe_price_id is not null and stripe_price_id_annual is not null) as purchasable from public.plans where active and id <> 'trial' order by sort_order`;
    const meters = await getUsage(sql, orgId);
    return {
      plan: plan ? { id: plan.id, name: plan.name, monthlyPriceCents: plan.monthly_price_cents, seatLimit: plan.seat_limit, promptLimit: plan.prompt_limit, engineLimit: plan.engine_limit, runsPerMonth: plan.runs_per_month } : null,
      subscription: sub ? { status: sub.status, seats: sub.seats, currentPeriodEnd: iso(sub.current_period_end), cancelAtPeriodEnd: sub.cancel_at_period_end, trialEnd: iso(sub.trial_end) } : null,
      usage: usage.map((r) => ({ metric: r.metric, periodStart: r.period_start, value: Number(r.value) })),
      plans: plans.map((r) => ({ id: r.id, name: r.name, monthlyPriceCents: r.monthly_price_cents, annualPriceCents: r.annual_price_cents, purchasable: !!r.purchasable })),
      meters,
    };
  });
}
