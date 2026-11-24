import 'server-only';
import { ONBOARDING_STEPS } from '@/config/onboarding';
import { iso, orgQuery } from './_run';
import type { OnboardingProgress, OnboardingStatus, QueryResult, TestStatus } from './types';

export async function getOnboardingProgress(orgId: string): Promise<QueryResult<OnboardingProgress>> {
  return orgQuery(orgId, async (sql) => {
    const steps = await sql`
      select step_id, status::text as status, data, notes, updated_at, completed_at
      from public.onboarding_progress where org_id = ${orgId}`;
    const secrets = await sql`
      select step_id, field_id, test_status::text as test_status, last_tested_at, updated_at
      from public.secret_refs where org_id = ${orgId} order by step_id, field_id`;
    const tests = await sql`
      select distinct on (step_id) step_id, status::text as status, checks, missing, created_at
      from public.integration_tests where org_id = ${orgId}
      order by step_id, created_at desc`;
    const known = new Map(steps.map((s) => [s.step_id as string, s]));
    const ordered = ONBOARDING_STEPS.map((def) => {
      const s = known.get(def.id);
      return {
        stepId: def.id,
        status: (s?.status ?? 'not_started') as OnboardingStatus,
        data: (s?.data ?? {}) as Record<string, unknown>,
        notes: s?.notes ?? null,
        updatedAt: iso(s?.updated_at) ?? '',
        completedAt: iso(s?.completed_at),
      };
    });
    return {
      steps: ordered,
      secrets: secrets.map((r) => ({ stepId: r.step_id, fieldId: r.field_id, testStatus: r.test_status as TestStatus | null, lastTestedAt: iso(r.last_tested_at), updatedAt: iso(r.updated_at)! })),
      latestTests: tests.map((r) => ({ stepId: r.step_id, status: r.status as TestStatus, checks: r.checks, missing: r.missing, createdAt: iso(r.created_at)! })),
      summary: {
        complete: ordered.filter((s) => s.status === 'complete').length,
        needsAttention: ordered.filter((s) => s.status === 'needs_attention').length,
        total: ordered.length,
      },
    };
  });
}
