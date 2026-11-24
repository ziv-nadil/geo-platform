"use client";

import { FlaskConical, Play } from "lucide-react";
import { useState } from "react";
import type { OnboardingStep } from "@/config/onboarding";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import { runTest, type TestResult } from "@/lib/ui/api-client";
import { fmtDateTime } from "@/lib/ui/format";
import { applicableTests, serialisableValues, testRunnable, type StepValues } from "@/lib/ui/onboarding-logic";

export function TestsPanel({
  orgId,
  step,
  values,
  results,
  onResult,
}: {
  orgId: string;
  step: OnboardingStep;
  values: StepValues;
  results: Record<string, TestResult>;
  onResult: (testId: string, r: TestResult) => void;
}) {
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const tests = applicableTests(step, values);
  const skippedTests = step.tests.filter((t) => !tests.includes(t));
  if (!step.tests.length) return null;

  async function run(ids: string[]) {
    setUnavailable(null);
    setRunning((r) => ({ ...r, ...Object.fromEntries(ids.map((i) => [i, true])) }));
    const payload = serialisableValues(values);
    await Promise.all(
      ids.map(async (id) => {
        const res = await runTest(orgId, step.id, id, payload);
        if (res.available) onResult(id, res.data);
        else setUnavailable(res.error);
        setRunning((r) => ({ ...r, [id]: false }));
      }),
    );
  }

  const runnable = tests.filter((t) => testRunnable(step, t, values).ok).map((t) => t.id);
  return (
    <section className="rounded-md border border-line bg-surface" aria-labelledby={`tests-${step.id}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h3 id={`tests-${step.id}`} className="flex items-center gap-2 font-sans text-md font-semibold text-ink">
          <FlaskConical className="size-4 text-accent" aria-hidden="true" /> Live tests
        </h3>
        <Button size="sm" onClick={() => run(runnable)} disabled={!runnable.length} loading={Object.values(running).some(Boolean)}>
          <Play /> Run live test{runnable.length > 1 ? "s" : ""}
        </Button>
      </header>
      {unavailable ? (
        <p className="mx-5 mt-4 rounded-sm border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn" role="status">
          Live tests could not run: {unavailable} Nothing was checked, so the step keeps its previous status.
        </p>
      ) : null}
      <ul className="divide-y divide-line">
        {tests.map((t) => {
          const r = results[t.id];
          const gate = testRunnable(step, t, values);
          return (
            <li key={t.id} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{t.label}</p>
                  <p className="text-xs text-ink-3">{t.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {running[t.id] ? <StatusPill status="running" /> : r ? <StatusPill status={r.status} /> : <StatusPill status="idle" label={gate.ok ? "Ready to test" : "Waiting for fields"} />}
                  <Button size="sm" variant="ghost" disabled={!gate.ok || running[t.id]} onClick={() => run([t.id])} aria-label={`Run ${t.label}`}>
                    <Play />
                  </Button>
                </div>
              </div>
              {!gate.ok ? <p className="text-xs text-ink-3">Needs: {gate.missing.join(", ")}</p> : null}
              {r ? (
                <div className="rounded-sm bg-subtle/70 px-3 py-2 text-sm">
                  <p className="text-ink-2">{r.summary}</p>
                  {r.missing?.length ? (
                    <div className="mt-1.5">
                      <p className="text-xs font-semibold text-warn">What&apos;s missing</p>
                      <ul className="mt-1 list-disc pl-5 text-xs text-ink-2">
                        {r.missing.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {r.checks?.length ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {r.checks.map((c) => (
                        <li key={c.label} className="flex items-start gap-2 text-xs">
                          <StatusPill status={c.status} className="h-5 px-1.5 text-2xs" />
                          <span className="text-ink-2">
                            {c.label}
                            {c.detail ? <span className="text-ink-4"> · {c.detail}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-1.5 text-2xs text-ink-4">Ran {fmtDateTime(r.ranAt)}</p>
                </div>
              ) : null}
            </li>
          );
        })}
        {skippedTests.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 opacity-70">
            <div>
              <p className="text-sm font-medium text-ink-3">{t.label}</p>
              <p className="text-xs text-ink-4">Not applicable to the options you chose.</p>
            </div>
            <StatusPill status="idle" label="N/A" />
          </li>
        ))}
      </ul>
    </section>
  );
}
