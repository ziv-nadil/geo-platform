import { describe, expect, it } from 'vitest';
import { claudeJson } from '../../content-pipeline/llm';
import { secretReadPath } from '../../secrets/broker';
import { validateRunnerEnv } from '../../jobs/runner-env';
import { IsolationError, assertJobOrg, currentJob, guardPrompt, runInJobContext } from '../job-context';

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const job = (orgId = A) => ({ orgId, orgSlug: 'acme', jobId: 'j1', jobType: 'content' });

describe('one job = one org', () => {
  it('gives the job an immutable context', async () => {
    await runInJobContext(job(), async () => {
      const c = currentJob()!;
      expect(c.orgId).toBe(A);
      expect(() => { (c as { orgId: string }).orgId = B; }).toThrow();
    });
    expect(currentJob()).toBeUndefined();
  });

  it('refuses nested jobs (no multi-org jobs)', async () => {
    await runInJobContext(job(), async () => {
      expect(() => runInJobContext({ ...job(B), jobId: 'j2' }, async () => 1)).toThrow(IsolationError);
    });
  });

  it('refuses touching another org inside a job', async () => {
    await runInJobContext(job(), async () => {
      expect(() => assertJobOrg(A)).not.toThrow();
      expect(() => assertJobOrg(B, 'secret read')).toThrow(/another org/);
    });
    expect(() => assertJobOrg(B)).not.toThrow(); // outside a job: org-scoped request paths
  });

  it('rejects a vault session for another org', () => {
    expect(() => runInJobContext({ ...job(), vault: { orgId: B, accessToken: 'x', siteUrl: 'https://i', runnerSub: null, expiresAt: Date.now() + 60_000 } }, async () => 1)).toThrow(/another org/);
  });
});

describe('LLM prompt guard: no cross-org data in a prompt', () => {
  it('blocks prompts that mix orgs, anywhere', () => {
    expect(() => guardPrompt([{ orgId: A, source: 'brand' }, { orgId: B, source: 'rag' }])).toThrow(/mixes 2 orgs/);
  });

  it("blocks another org's data inside a job", async () => {
    await runInJobContext(job(), async () => {
      expect(() => guardPrompt([{ orgId: A, source: 'brand' }])).not.toThrow();
      expect(() => guardPrompt([{ orgId: B, source: 'examples' }])).toThrow(/another org/);
    });
  });

  it('blocks untagged or provenance-less client material inside a job', async () => {
    await runInJobContext(job(), async () => {
      expect(() => guardPrompt([{ orgId: undefined, source: 'memory' }])).toThrow(/no org tag/);
      expect(() => guardPrompt([])).toThrow(/no provenance/);
    });
  });

  it('is enforced by the content LLM wrapper before any model call', async () => {
    await runInJobContext(job(), async () => {
      await expect(claudeJson({ system: 's', user: 'u', schema: {}, provenance: [{ orgId: B, source: 'brand_context' }] })).rejects.toThrow(IsolationError);
    });
  });
});

describe('secret read path', () => {
  it('denies Vercel-side reads in per_client mode and allows the job session', () => {
    expect(secretReadPath(false, 'per_client')).toBe('denied');
    expect(secretReadPath(true, 'per_client')).toBe('session');
    expect(secretReadPath(false, 'shared')).toBe('shared');
  });
});

describe('runner trusts only its environment', () => {
  const env = { ORG_ID: A, ORG_SLUG: 'acme', INPUT_ORG_SLUG: 'acme', JOB_TYPE: 'content', JOB_ID: 'content:acme:1', INFISICAL_IDENTITY_ID: 'rid' };
  it('accepts a matching dispatch', () => {
    expect(validateRunnerEnv(env)).toMatchObject({ ok: true, value: { orgId: A, slug: 'acme', jobType: 'content' } });
  });
  it('refuses a dispatch for another org or an unknown job type', () => {
    expect(validateRunnerEnv({ ...env, INPUT_ORG_SLUG: 'beta' })).toMatchObject({ ok: false });
    expect(validateRunnerEnv({ ...env, ORG_ID: undefined })).toMatchObject({ ok: false });
    expect(validateRunnerEnv({ ...env, JOB_TYPE: 'shell' })).toMatchObject({ ok: false });
  });
});
