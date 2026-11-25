/** Plan limit evaluation (pure) + DB-backed checks. null limit = unlimited. */
export type LimitKind = 'seats' | 'prompts' | 'engines';

export type PlanLimits = { planId: string | null; planName: string; seats: number | null; prompts: number | null; engines: number | null };
export type LimitResult = { ok: true } | { ok: false; code: 'plan_limit'; kind: LimitKind; limit: number; current: number; message: string };

const LABEL: Record<LimitKind, [string, string]> = { seats: ['seat', 'seats'], prompts: ['tracked prompt', 'tracked prompts'], engines: ['AI engine', 'AI engines'] };

export function evaluateLimit(kind: LimitKind, limits: PlanLimits, current: number, adding = 1): LimitResult {
  const limit = limits[kind];
  if (limit === null || current + adding <= limit) return { ok: true };
  const [one, many] = LABEL[kind];
  return {
    ok: false,
    code: 'plan_limit',
    kind,
    limit,
    current,
    message: `Your ${limits.planName} plan includes ${limit} ${limit === 1 ? one : many} and you're using ${current}. Upgrade in Settings → Billing to add more.`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres.js tagged template (Sql/TxSql/RLS tx) with loose row typing
type Tagged = (strings: TemplateStringsArray, ...values: any[]) => PromiseLike<any[]>;

export async function getPlanLimits(sql: Tagged, orgId: string): Promise<PlanLimits> {
  const [r] = await sql`
    select pl.id, pl.name, pl.seat_limit, pl.prompt_limit, pl.engine_limit
    from public.organizations o join public.plans pl on pl.id = o.plan where o.id = ${orgId}`;
  if (!r) return { planId: null, planName: 'current', seats: null, prompts: null, engines: null };
  return { planId: r.id as string, planName: r.name as string, seats: r.seat_limit as number | null, prompts: r.prompt_limit as number | null, engines: r.engine_limit as number | null };
}

export async function getUsage(sql: Tagged, orgId: string): Promise<Record<LimitKind, number>> {
  const [r] = await sql`
    select
      (select count(*)::int from public.memberships where org_id = ${orgId})
        + (select count(*)::int from public.invitations where org_id = ${orgId} and status = 'pending' and expires_at > now()) as seats,
      (select count(*)::int from public.prompts where org_id = ${orgId} and active) as prompts,
      (select count(*)::int from public.org_engines where org_id = ${orgId} and enabled) as engines`;
  return { seats: Number(r?.seats ?? 0), prompts: Number(r?.prompts ?? 0), engines: Number(r?.engines ?? 0) };
}

export async function checkLimit(sql: Tagged, orgId: string, kind: LimitKind, adding = 1): Promise<LimitResult> {
  // Plan limits only apply when billing is on (BILLING_ENABLED=true).
  if (process.env.BILLING_ENABLED !== 'true') return { ok: true };
  const [limits, usage] = await Promise.all([getPlanLimits(sql, orgId), getUsage(sql, orgId)]);
  return evaluateLimit(kind, limits, usage[kind], adding);
}
