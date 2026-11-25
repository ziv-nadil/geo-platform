import 'server-only';
import { withService } from '../db';
import { readSecret } from '../secrets/broker';
import { redact } from '../secrets/redact';
import * as analytics from './analytics';
import * as aws from './aws';
import { accessMethod, brandBook, company, review } from './basic';
import * as bing from './bing';
import * as cloudflare from './cloudflare';
import * as cms from './cms';
import * as dns from './dns';
import * as ga4 from './ga4';
import * as geo from './geo';
import * as gcloud from './gcloud';
import * as github from './github';
import * as gsc from './gsc';
import * as slack from './slack';
import type { TestContext, TestResult, Tester } from './types';

export type { TestResult, Check, TestStatus } from './types';
export { dnsTxtValue, DNS_TXT_NAME } from './dns';
export { awsExternalId } from './aws';

/** One tester per onboarding step id (web/src/config/onboarding.ts). */
export const TESTERS: Record<string, Tester> = {
  company, geo_readiness: geo.test, brand_book: brandBook, access_method: accessMethod,
  github: github.test, cms: cms.test, gsc: gsc.test, bing: bing.test, ga4: ga4.test, google_cloud: gcloud.test,
  dns: dns.test, analytics_tools: analytics.test, cloud_storage: aws.test, cdn_crawlers: cloudflare.test, chat: slack.test,
  review,
};

/**
 * Run a step's live test: load saved answers, fetch secrets just-in-time through the broker
 * (purpose connection_test, logged), run real API calls, then store a REDACTED result in
 * integration_tests and secret_refs.test_status. Secret values never leave this function.
 */
export async function runStepTest(orgId: string, stepId: string, triggeredBy: string | null): Promise<TestResult & { durationMs: number }> {
  const tester = TESTERS[stepId];
  if (!tester) return { status: 'not_configured', checks: [], missing: [`unknown step ${stepId}`], durationMs: 0 };
  const rows = await withService((sql) => sql`select step_id, data from public.onboarding_progress where org_id = ${orgId}`);
  const allData = Object.fromEntries(rows.map((r) => [r.step_id as string, (r.data ?? {}) as Record<string, unknown>]));
  const used: string[] = [];
  const ctx: TestContext = {
    orgId, stepId, data: allData[stepId] ?? {}, allData,
    secret: async (fieldId) => {
      const r = await readSecret({ orgId, purpose: 'connection_test' }, { stepId, fieldId });
      if (r.status !== 'ok') return null;
      used.push(r.value);
      return r.value;
    },
  };
  const started = Date.now();
  let res: TestResult;
  try {
    res = await tester(ctx);
  } catch (e) {
    res = { status: 'fail', checks: [{ id: 'unexpected', label: 'Test ran', ok: false, detail: e instanceof Error ? e.message : 'error' }], missing: [] };
  }
  const durationMs = Date.now() - started;
  const clean: TestResult = {
    status: res.status,
    checks: res.checks.map((c) => ({ ...c, detail: c.detail ? redact(c.detail, used) : undefined })),
    missing: res.missing.map((m) => redact(m, used)),
  };
  used.length = 0; // drop references to secret values

  await withService(async (sql) => {
    await sql`insert into public.integration_tests (org_id, step_id, status, checks, missing, duration_ms, triggered_by)
              values (${orgId}, ${stepId}, ${clean.status}, ${sql.json(clean.checks)}, ${clean.missing}, ${durationMs}, ${triggeredBy})`;
    const msg = clean.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail ?? 'failed'}`).join('; ').slice(0, 500) || null;
    await sql`update public.secret_refs set last_tested_at = now(), test_status = ${clean.status}, test_message = ${msg}
              where org_id = ${orgId} and step_id = ${stepId}`;
    const next = clean.status === 'pass' ? 'complete' : clean.status === 'not_configured' ? null : 'needs_attention';
    if (next) {
      await sql`insert into public.onboarding_progress (org_id, step_id, status) values (${orgId}, ${stepId}, ${next})
                on conflict (org_id, step_id) do update set status = excluded.status`;
    }
  });
  return { ...clean, durationMs };
}
