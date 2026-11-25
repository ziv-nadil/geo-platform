import { auditEvent, checkOrigin, json, rateLimited, requireOrgAccess } from '@/lib/server/auth';
import { runStepTest, TESTERS } from '@/lib/server/integrations';

export const maxDuration = 60;

/**
 * POST /api/onboarding/[orgId]/test/[stepId] — run the step's live connection test (member+).
 * 200: { stepId, status: 'pass'|'partial'|'fail'|'not_configured', checks: [{id,label,ok,detail}], missing: string[], durationMs, ranAt }
 */
export async function POST(request: Request, ctx: { params: Promise<{ orgId: string; stepId: string }> }) {
  const { orgId, stepId } = await ctx.params;
  const bad = checkOrigin(request);
  if (bad) return bad;
  const auth = await requireOrgAccess(orgId, 'member');
  if (!auth.ok) return auth.response;
  if (!TESTERS[stepId]) return json({ error: 'unknown_step' }, 404);
  if (rateLimited(`test:${orgId}`, 10, 60_000)) return json({ error: 'rate_limited' }, 429);
  const res = await runStepTest(orgId, stepId, auth.staff ? null : auth.userId);
  await auditEvent({ orgId, caller: auth, action: 'integration.tested', targetType: 'step', targetId: stepId, metadata: { status: res.status } });
  return json({ stepId, ...res, ranAt: new Date().toISOString() });
}
