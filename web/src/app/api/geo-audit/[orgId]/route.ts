import { auditEvent, checkOrigin, json, rateLimited, requireOrgAccess } from '@/lib/server/auth';
import { latestGeoAudit, runAndSaveForOrg } from '@/lib/server/geo-audit/run';

export const maxDuration = 60;

/** GET: latest stored GEO audit (viewer+). */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const auth = await requireOrgAccess(orgId, 'viewer');
  if (!auth.ok) return auth.response;
  return json({ audit: await latestGeoAudit(orgId) });
}

/** POST: re-run the audit on demand (member+). */
export async function POST(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const bad = checkOrigin(request);
  if (bad) return bad;
  const auth = await requireOrgAccess(orgId, 'member');
  if (!auth.ok) return auth.response;
  if (rateLimited(`geo-audit:${orgId}`, 5, 60_000)) return json({ error: 'rate_limited' }, 429);
  const a = await runAndSaveForOrg(orgId, auth.staff ? null : auth.userId);
  if ('error' in a) return json({ error: a.error }, 400);
  await auditEvent({ orgId, caller: auth, action: 'geo_audit.run', targetType: 'geo_audit', targetId: a.id, metadata: { score: a.score } });
  return json({ audit: a });
}
