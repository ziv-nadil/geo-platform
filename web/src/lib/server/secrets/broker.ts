import 'server-only';
import { withService } from '../db';
import { INFISICAL_ENV, infisicalConfigured, sdkAs } from '../infisical';

/**
 * Secret broker: the ONLY module that reads client secret values (security.md §1.5).
 *
 *  - The org comes from a trusted server context (authenticated route / server-created job),
 *    never from user input or model output.
 *  - The Infisical project is resolved from organizations.infisical_project_id, and the ref must
 *    belong to ctx.orgId (secret_refs.org_id). Project ids/paths are never accepted from callers.
 *  - Every read inserts secret_access_log BEFORE calling Infisical, then records the outcome.
 *  - Values are returned only to the callback and never logged, persisted or sent to the client.
 */

export type BrokerContext = {
  orgId: string;
  purpose: 'connection_test' | 'job' | 'agent_tool' | 'rotation';
  jobId?: string;
  worker?: string;
};

export type BrokerOutcome =
  | { status: 'ok'; value: string }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'missing_secret' }
  | { status: 'error'; message: string };

export async function readSecret(ctx: BrokerContext, ref: { stepId: string; fieldId: string }): Promise<BrokerOutcome> {
  const cfg = infisicalConfigured('worker');
  if (!('ok' in cfg)) return { status: 'not_configured', missing: cfg.missing };

  const found = await withService(async (sql) => {
    const [row] = await sql`
      select r.id, r.secret_path, r.secret_name, r.environment, o.infisical_project_id
      from public.secret_refs r join public.organizations o on o.id = r.org_id
      where r.org_id = ${ctx.orgId} and r.step_id = ${ref.stepId} and r.field_id = ${ref.fieldId}`;
    if (!row || !row.infisical_project_id) return null;
    const [log] = await sql`
      insert into public.secret_access_log (org_id, secret_ref_id, purpose, job_id, worker)
      values (${ctx.orgId}, ${row.id}, ${ctx.purpose}, ${ctx.jobId ?? null}, ${ctx.worker ?? `beacon-worker@${process.env.VERCEL_ENV ?? 'local'}`})
      returning id`;
    return {
      projectId: row.infisical_project_id as string,
      environment: (row.environment as string | null) ?? INFISICAL_ENV,
      secretPath: row.secret_path as string,
      secretName: row.secret_name as string,
      logId: log.id as string,
    };
  });
  if (!found) return { status: 'missing_secret' };

  const finish = (outcome: 'ok' | 'error' | 'denied') =>
    withService((sql) => sql`update public.secret_access_log set outcome = ${outcome} where id = ${found.logId}`).catch(() => undefined);

  try {
    const sdk = await sdkAs('worker');
    const secret = await sdk.secrets().getSecret({
      projectId: found.projectId,
      environment: found.environment,
      secretPath: found.secretPath,
      secretName: found.secretName,
      expandSecretReferences: false,
      viewSecretValue: true,
    });
    await finish('ok');
    return { status: 'ok', value: secret.secretValue };
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    await finish(code === 401 || code === 403 ? 'denied' : 'error');
    return { status: 'error', message: code ? `vault returned HTTP ${code}` : 'vault request failed' };
  }
}

/** All stored field ids for a step (no values). */
export async function storedFields(orgId: string, stepId: string): Promise<string[]> {
  return withService(async (sql) => {
    const rows = await sql`select field_id from public.secret_refs where org_id = ${orgId} and step_id = ${stepId}`;
    return rows.map((r) => r.field_id as string);
  });
}
