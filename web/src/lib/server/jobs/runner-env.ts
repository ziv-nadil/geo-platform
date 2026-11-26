import { assertSlug } from '../isolation/github-env';
import { JOB_TYPES, type JobType } from './job-types';

/**
 * Validates what the per-client runner trusts (isolation.md §3.1). Pure, so it is unit-tested.
 *   ORG_ID / ORG_SLUG / INFISICAL_IDENTITY_ID  vars of GitHub environment client-<slug> (set by provisioning)
 *   INPUT_ORG_SLUG / JOB_TYPE / JOB_ID         workflow_dispatch inputs (untrusted; must agree with the vars)
 */
export type RunnerEnv = { orgId: string; slug: string; jobType: JobType; jobId: string; identityId: string | undefined };

export function validateRunnerEnv(env: Record<string, string | undefined>): { ok: true; value: RunnerEnv } | { ok: false; error: string } {
  const orgId = env.ORG_ID?.trim();
  const slug = env.ORG_SLUG?.trim();
  const inputSlug = env.INPUT_ORG_SLUG?.trim();
  const jobType = env.JOB_TYPE?.trim() ?? '';
  const jobId = env.JOB_ID?.trim() || `${jobType}-${Date.now()}`;
  if (!orgId || !slug) return { ok: false, error: 'ORG_ID and ORG_SLUG must come from the client-<slug> environment vars' };
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return { ok: false, error: 'ORG_ID is not a uuid' };
  try { assertSlug(slug); } catch { return { ok: false, error: 'ORG_SLUG invalid' }; }
  if (inputSlug !== slug) return { ok: false, error: `dispatch input org_slug (${inputSlug ?? ''}) does not match environment ORG_SLUG (${slug})` };
  if (!(JOB_TYPES as readonly string[]).includes(jobType)) return { ok: false, error: `unknown job type ${jobType}` };
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(jobId)) return { ok: false, error: 'JOB_ID invalid' };
  return { ok: true, value: { orgId, slug, jobType: jobType as JobType, jobId, identityId: env.INFISICAL_IDENTITY_ID?.trim() || undefined } };
}
