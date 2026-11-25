import { auditEvent, checkOrigin, json, notConfiguredResponse, rateLimited, requireOrgAccess } from '@/lib/server/auth';
import { withService } from '@/lib/server/db';
import { InfisicalError, upsertSecret } from '@/lib/server/infisical';
import { resolveSecretTarget } from '@/lib/server/secrets/catalog';
import { decryptIntake, intakeConfigured, IntakeError } from '@/lib/server/secrets/intake';


/**
 * POST /api/onboarding/[orgId]/secrets   (security.md §2.2)
 * Headers: Origin = app origin, x-beacon-intake: 1, content-type: application/json
 * Body:    { jwe: string[] }  — each a compact JWE of {org_id, step_id, field_id, value, iat, exp, nonce}
 * 200:     { status: 'stored', stored: [{ stepId, fieldId }] }   (never echoes values)
 *
 * NO console.* in this module. The body is never logged. Errors are generic.
 */
export async function POST(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const bad = checkOrigin(request, 'x-beacon-intake');
  if (bad) return bad;
  const auth = await requireOrgAccess(orgId, 'admin');
  if (!auth.ok) return auth.response;
  if (!intakeConfigured()) return notConfiguredResponse(['INTAKE_JWE_PRIVATE_JWK']);
  if (rateLimited(`intake:${auth.userId}`, 20, 60_000)) return json({ error: 'rate_limited' }, 429);

  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > 64 * 1024) return json({ error: 'payload_too_large' }, 413);
  let jwes: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 64 * 1024) return json({ error: 'payload_too_large' }, 413);
    jwes = (JSON.parse(raw) as { jwe?: unknown }).jwe;
  } catch {
    return json({ error: 'invalid_secret_payload' }, 400);
  }
  if (!Array.isArray(jwes) || jwes.length === 0 || jwes.length > 10) return json({ error: 'invalid_secret_payload' }, 400);

  const org = await withService(async (sql) => {
    const [o] = await sql`select infisical_project_id from public.organizations where id = ${orgId}`;
    return o;
  });
  if (!org?.infisical_project_id) return json({ status: 'not_configured', missing: ['vault not provisioned for this org (POST /api/admin/orgs)'] }, 409);

  const stored: { stepId: string; fieldId: string }[] = [];
  for (const jwe of jwes) {
    let payload;
    try {
      payload = await decryptIntake(String(jwe), orgId);
    } catch (e) {
      return json({ error: 'invalid_secret_payload', reason: e instanceof IntakeError ? e.reason : 'invalid' }, 400);
    }
    const saved = await withService(async (sql) => {
      const [r] = await sql`select data from public.onboarding_progress where org_id = ${orgId} and step_id = ${payload.step_id}`;
      return (r?.data ?? {}) as Record<string, unknown>;
    });
    const target = resolveSecretTarget(payload.step_id, payload.field_id, saved);
    if ('error' in target) {
      payload.value = '';
      return json({ error: target.error, detail: target.detail, fieldId: payload.field_id }, 422);
    }
    const shapeError = target.validate(payload.value);
    if (shapeError) {
      payload.value = '';
      return json({ error: 'invalid_value', detail: shapeError, fieldId: target.fieldId }, 422);
    }
    try {
      const w = await upsertSecret({ projectId: org.infisical_project_id, secretPath: target.secretPath, secretName: target.secretName, value: payload.value, stepId: target.stepId });
      payload.value = '';
      if (w.status === 'not_configured') return notConfiguredResponse(w.missing);
      await withService((sql) => sql`
        insert into public.secret_refs (org_id, step_id, field_id, infisical_project_id, secret_path, secret_name, infisical_secret_version, created_by)
        values (${orgId}, ${target.stepId}, ${target.fieldId}, ${org.infisical_project_id}, ${target.secretPath}, ${target.secretName}, ${w.version}, ${auth.staff ? null : auth.userId})
        on conflict (org_id, step_id, field_id) do update set
          secret_path = excluded.secret_path, secret_name = excluded.secret_name, infisical_secret_version = excluded.infisical_secret_version,
          test_status = null, test_message = null, last_tested_at = null`);
    } catch (e) {
      payload.value = '';
      return json({ error: 'vault_write_failed', reason: e instanceof InfisicalError ? e.code : 'error' }, 502);
    }
    await auditEvent({ orgId, caller: auth, action: 'secret.set', targetType: 'secret_ref', targetId: `${target.stepId}.${target.fieldId}`, request });
    stored.push({ stepId: target.stepId, fieldId: target.fieldId });
  }
  return json({ status: 'stored', stored });
}
