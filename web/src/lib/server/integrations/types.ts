import 'server-only';

export type Check = { id: string; label: string; ok: boolean; detail?: string };
export type TestStatus = 'pass' | 'partial' | 'fail' | 'not_configured';
export type TestResult = { status: TestStatus; checks: Check[]; missing: string[] };

export type TestContext = {
  orgId: string;
  stepId: string;
  /** Non-secret answers saved for this step (onboarding_progress.data). */
  data: Record<string, unknown>;
  /** All saved answers by step (some tests need another step's data, e.g. GSC property). */
  allData: Record<string, Record<string, unknown>>;
  /** Just-in-time secret read through the broker (logged). null = not stored / unavailable. */
  secret: (fieldId: string) => Promise<string | null>;
};

export type Tester = (ctx: TestContext) => Promise<TestResult>;

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Status from checks: all ok = pass, some = partial, none = fail; nothing runnable = not_configured. */
export function result(checks: Check[], missing: string[] = [], notConfigured = false): TestResult {
  if (notConfigured || checks.length === 0) return { status: 'not_configured', checks, missing };
  const ok = checks.filter((c) => c.ok).length;
  return { status: ok === checks.length ? 'pass' : ok > 0 ? 'partial' : 'fail', checks, missing };
}

export function envMissing(names: string[]): string[] {
  return names.filter((n) => !process.env[n] || !process.env[n]!.trim());
}

export function errDetail(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 200) : 'request failed';
}
