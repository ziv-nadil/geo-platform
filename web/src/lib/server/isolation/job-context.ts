import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One job = one org (isolation.md §3.1, §3.2).
 *
 * A JobContext is created once at job start from trusted values (the runner's GitHub environment var ORG_ID,
 * cross-checked against the DB) and is immutable. Everything that reads secrets or builds an LLM prompt checks
 * against it:
 *   - runInJobContext refuses to nest (no multi-org jobs, no switching org mid-job);
 *   - assertJobOrg throws when code inside a job touches another org;
 *   - guardPrompt throws when any block of a prompt is tagged with an org other than the job's, when a prompt mixes
 *     orgs, or (inside a job) when a block has no org tag at all.
 */

export type VaultSession = { orgId: string; accessToken: string; siteUrl: string; runnerSub: string | null; expiresAt: number };

export type JobContext = Readonly<{
  orgId: string;
  orgSlug: string;
  jobId: string;
  jobType: string;
  /** Per-client vault login (GitHub OIDC -> client identity). Absent in shared mode. */
  vault?: Readonly<VaultSession>;
}>;

export class IsolationError extends Error {
  constructor(public readonly code: 'nested_job' | 'cross_org' | 'mixed_orgs' | 'untagged_block' | 'no_job', message: string) {
    super(message);
    this.name = 'IsolationError';
  }
}

const store = new AsyncLocalStorage<JobContext>();

export function currentJob(): JobContext | undefined {
  return store.getStore();
}

export function runInJobContext<T>(ctx: JobContext, fn: () => Promise<T>): Promise<T> {
  const outer = store.getStore();
  if (outer) throw new IsolationError('nested_job', `job ${ctx.jobId} started inside job ${outer.jobId}; one job = one org`);
  if (!ctx.orgId || !ctx.jobId) throw new IsolationError('no_job', 'job context needs orgId and jobId');
  if (ctx.vault && ctx.vault.orgId !== ctx.orgId) throw new IsolationError('cross_org', 'vault session belongs to another org');
  return store.run(Object.freeze({ ...ctx, vault: ctx.vault ? Object.freeze({ ...ctx.vault }) : undefined }), fn);
}

/** Throws if called inside a job for a different org. No-op outside a job (interactive, org-scoped request paths). */
export function assertJobOrg(orgId: string, what = 'operation'): void {
  const job = store.getStore();
  if (job && job.orgId !== orgId) throw new IsolationError('cross_org', `${what} for another org inside job ${job.jobId}`);
}

export type PromptBlock = { orgId: string | null | undefined; source: string };

/**
 * Prompt provenance guard. Call with one entry per piece of client material that goes into a prompt
 * (brand context, RAG results, examples, prior outputs, social items). Org-free material (system prompt, tool
 * definitions) is not listed.
 */
export function guardPrompt(blocks: PromptBlock[]): void {
  const job = store.getStore();
  const orgs = new Set<string>();
  for (const b of blocks) {
    if (!b.orgId) {
      if (job) throw new IsolationError('untagged_block', `prompt block "${b.source}" has no org tag inside job ${job.jobId}`);
      continue;
    }
    orgs.add(b.orgId);
  }
  if (orgs.size > 1) throw new IsolationError('mixed_orgs', `prompt mixes ${orgs.size} orgs`);
  if (job) {
    if (blocks.length === 0) throw new IsolationError('untagged_block', `prompt inside job ${job.jobId} has no provenance`);
    for (const o of orgs) if (o !== job.orgId) throw new IsolationError('cross_org', `prompt contains another org's data inside job ${job.jobId}`);
  }
}
