import { connection } from 'next/server';
import { ONBOARDING_STEPS, type FieldDef } from '@/config/onboarding';
import { auditEvent, checkOrigin, json, requireOrgAccess } from '@/lib/server/auth';
import { withRls } from '@/lib/server/db';
import { getOnboardingProgress } from '@/lib/server/queries';


/** GET /api/onboarding/[orgId]/progress — steps, stored secret refs (no values), latest tests. */
export async function GET(_request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  await connection();
  const { orgId } = await ctx.params;
  const auth = await requireOrgAccess(orgId, 'viewer');
  if (!auth.ok) return auth.response;
  const r = await getOnboardingProgress(orgId);
  return r.ok ? json(r.data) : json({ error: r.reason }, r.reason === 'not_configured' ? 503 : 403);
}

/** Drop secret-typed fields (top level and inside repeater/table rows): they only go to the vault. */
function stripSecrets(fields: FieldDef[], data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!(f.id in data) || f.type === 'secret') continue;
    const v = data[f.id];
    const children = f.fields ?? f.columns;
    if (children && Array.isArray(v)) out[f.id] = v.slice(0, 50).map((row) => (row && typeof row === 'object' ? stripSecrets(children, row as Record<string, unknown>) : row));
    else out[f.id] = v;
  }
  return out;
}

/**
 * PUT /api/onboarding/[orgId]/progress — body { stepId, data?, status?, notes? } (member+).
 * Clients may set status not_started|in_progress; 'complete'/'needs_attention' come from live tests
 * (or GEO Engine staff with an act-as grant). Unknown and secret fields are dropped. Written with RLS.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const bad = checkOrigin(request);
  if (bad) return bad;
  const auth = await requireOrgAccess(orgId, 'member');
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { stepId?: string; data?: Record<string, unknown>; status?: string; notes?: string } | null;
  const step = ONBOARDING_STEPS.find((s) => s.id === body?.stepId);
  if (!body || !step) return json({ error: 'unknown_step' }, 400);
  const allowed = auth.staff ? ['not_started', 'in_progress', 'needs_attention', 'complete'] : ['not_started', 'in_progress'];
  if (body.status && !allowed.includes(body.status)) return json({ error: 'status_not_allowed', allowed }, 400);
  const data = body.data && typeof body.data === 'object' ? stripSecrets(step.fields, body.data) : null;
  if (data && JSON.stringify(data).length > 200_000) return json({ error: 'payload_too_large' }, 413);

  const row = await withRls(auth.claims, async (sql) => {
    const [r] = await sql`
      insert into public.onboarding_progress (org_id, step_id, status, data, notes)
      values (${orgId}, ${step.id}, ${body.status ?? 'in_progress'}, ${sql.json((data ?? {}) as never)}, ${body.notes ?? null})
      on conflict (org_id, step_id) do update set
        status = coalesce(${body.status ?? null}::public.onboarding_status, public.onboarding_progress.status),
        data = case when ${data !== null} then excluded.data else public.onboarding_progress.data end,
        notes = coalesce(${body.notes ?? null}, public.onboarding_progress.notes)
      returning step_id, status::text as status, updated_at`;
    return r;
  });
  await auditEvent({ orgId, caller: auth, action: 'onboarding.step_saved', targetType: 'step', targetId: step.id });
  return json({ ok: true, stepId: row.step_id, status: row.status, updatedAt: row.updated_at });
}
