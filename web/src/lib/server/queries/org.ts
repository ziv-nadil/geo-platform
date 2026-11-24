import 'server-only';
import { orgQuery, userQuery } from './_run';
import type { Engine, OrgSummary, QueryResult } from './types';

export async function listMyOrgs(): Promise<QueryResult<OrgSummary[]>> {
  return userQuery(async (sql, claims) => {
    const rows = await sql`
      select o.id, o.name, o.slug, o.website, o.plan, o.status::text as status, m.role::text as role
      from public.organizations o
      left join public.memberships m on m.org_id = o.id and m.user_id = ${claims.sub}
      order by o.name`;
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, website: r.website, plan: r.plan, status: r.status, role: r.role }));
  });
}

export async function getOrg(orgId: string): Promise<QueryResult<OrgSummary | null>> {
  return orgQuery(orgId, async (sql, claims) => {
    const [r] = await sql`
      select o.id, o.name, o.slug, o.website, o.plan, o.status::text as status, m.role::text as role
      from public.organizations o
      left join public.memberships m on m.org_id = o.id and m.user_id = ${claims.sub}
      where o.id = ${orgId}`;
    return r ? { id: r.id, name: r.name, slug: r.slug, website: r.website, plan: r.plan, status: r.status, role: r.role } : null;
  });
}

export async function listEngines(orgId: string): Promise<QueryResult<Engine[]>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`
      select e.id, e.name, e.provider, e.method, e.active, coalesce(oe.enabled, false) as enabled
      from public.engines e
      left join public.org_engines oe on oe.engine_id = e.id and oe.org_id = ${orgId}
      order by e.sort_order`;
    return rows.map((r) => ({ id: r.id, name: r.name, provider: r.provider, method: r.method, active: r.active, enabled: r.enabled }));
  });
}
