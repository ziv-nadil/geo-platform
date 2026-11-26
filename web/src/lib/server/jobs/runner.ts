import 'server-only';
import { withService } from '../db';
import { runInJobContext } from '../isolation/job-context';
import { isolationMode } from '../isolation/mode';
import { openVaultSession } from '../isolation/vault-session';
import { validateRunnerEnv } from './runner-env';
import { runForOrg } from './types';

/**
 * Per-client job runner (isolation.md §5 step 6). Entry: web/scripts/client-job.ts, run by
 * .github/workflows/client-job.yml with `environment: client-<slug>`.
 *
 *  1. Trust only the environment vars (ORG_ID, ORG_SLUG); the dispatch input must agree; the DB row must agree.
 *  2. GitHub OIDC -> login as that client's own Infisical identity (per_client). Any other client's identity rejects
 *     this token's `sub`, so even a compromised job cannot read another client's secrets.
 *  3. Run exactly one job for exactly one org inside an immutable JobContext (broker + LLM guards enforce it).
 */
export async function runClientJob(env: Record<string, string | undefined> = process.env): Promise<{ status: string; [k: string]: unknown }> {
  const v = validateRunnerEnv(env);
  if (!v.ok) return { status: 'refused', error: v.error };
  const { orgId, slug, jobType, jobId, identityId } = v.value;

  const [org] = await withService((sql) => sql`select id, slug, status from public.organizations where id = ${orgId}`);
  if (!org || org.slug !== slug) return { status: 'refused', error: 'ORG_ID/ORG_SLUG do not match the organizations row' };
  if (!['active', 'onboarding'].includes(org.status as string)) return { status: 'skipped', error: `org status ${String(org.status)}` };

  let vault;
  if (isolationMode() === 'per_client') {
    const s = await openVaultSession({ orgId, slug, identityId });
    if (s.status !== 'ok') return { status: 'not_configured', missing: s.missing };
    vault = s.session;
  }
  const result = await runInJobContext({ orgId, orgSlug: slug, jobId, jobType, vault }, () => runForOrg(jobType, orgId, { jobId }));
  return { status: 'ok', orgSlug: slug, jobType, jobId, result };
}
