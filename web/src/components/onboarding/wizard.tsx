"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  Circle,
  ClipboardCheck,
  CloudCog,
  Database,
  GitBranch,
  Globe,
  KeyRound,
  LineChart,
  MessageSquare,
  Network,
  PenSquare,
  Search,
  ShieldCheck,
  SkipForward,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OnboardingStep } from "@/config/onboarding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusIcon, StatusPill, type Status } from "@/components/ui/status";
import { useToasts } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { saveProgress, type TestResult } from "@/lib/ui/api-client";
import { cn } from "@/lib/ui/cn";
import {
  canSkip,
  GROUPS,
  overallProgress,
  serialisableValues,
  stepFieldProgress,
  stepMissing,
  stepStatus,
  type FieldValue,
  type StepStatus,
  type WizardState,
} from "@/lib/ui/onboarding-logic";
import { FieldList } from "./field-renderer";
import { InstructionsPanel } from "./instructions-panel";
import { TestsPanel } from "./tests-panel";

const ICONS: Record<string, LucideIcon> = { Building2, BookOpen, KeyRound, GitBranch, PenSquare, Search, Globe, BarChart3, CloudCog, Network, LineChart, Database, ShieldCheck, MessageSquare, ClipboardCheck };

const STATUS_FOR_PILL: Record<StepStatus, Status> = { idle: "idle", pending: "pending", pass: "pass", partial: "partial", fail: "fail", skipped: "idle" };
const STATUS_LABEL: Record<StepStatus, string> = { idle: "Not started", pending: "In progress", pass: "Working", partial: "Partial", fail: "Failed", skipped: "Skipped" };

export function OnboardingWizard({
  orgId,
  orgSlug,
  orgName,
  steps,
  placeholders,
  initial,
  initialStepId,
}: {
  orgId: string;
  orgSlug: string;
  orgName: string;
  steps: OnboardingStep[];
  placeholders: Record<string, string>;
  initial: WizardState;
  initialStepId?: string;
}) {
  const [state, setState] = useState<WizardState>(initial);
  const [current, setCurrent] = useState(() => (initialStepId && steps.some((s) => s.id === initialStepId) ? initialStepId : steps[0]!.id));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "unavailable">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast, region } = useToasts();
  const router = useRouter();
  const step = steps.find((s) => s.id === current)!;
  const idx = steps.findIndex((s) => s.id === current);
  const values = useMemo(() => state.values[current] ?? {}, [state.values, current]);
  const pct = overallProgress(steps, state);

  const persist = useCallback(
    (stepId: string, next: WizardState) => {
      if (timer.current) clearTimeout(timer.current);
      setSaveState("saving");
      timer.current = setTimeout(async () => {
        const status = stepStatus(steps.find((s) => s.id === stepId)!, next);
        // Clients may only set not_started / in_progress; complete comes from live tests on the server.
        const res = await saveProgress(orgId, stepId, serialisableValues(next.values[stepId] ?? {}), status === "idle" ? "not_started" : "in_progress", next.skipped[stepId] ? "skipped" : null);
        setSaveState(res.available ? "saved" : "unavailable");
        if (!res.available) toast(`Could not save your progress: ${res.error}`);
        else router.refresh(); // sidebar progress comes from the server; keep it in step with the wizard
      }, 700);
    },
    [orgId, steps, toast, router],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function setField(id: string, v: FieldValue) {
    setState((s) => {
      const next = { ...s, values: { ...s.values, [current]: { ...(s.values[current] ?? {}), [id]: v } } };
      persist(current, next);
      return next;
    });
  }

  function setTest(testId: string, r: TestResult) {
    setState((s) => ({ ...s, tests: { ...s.tests, [current]: { ...(s.tests[current] ?? {}), [testId]: r } } }));
  }

  function toggleSkip() {
    setState((s) => {
      const next = { ...s, skipped: { ...s.skipped, [current]: !s.skipped[current] } };
      persist(current, next);
      return next;
    });
  }

  function go(id: string) {
    setCurrent(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("step", id);
      window.history.replaceState(null, "", url);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const status = stepStatus(step, state);
  const Icon = ICONS[step.icon] ?? Circle;
  const fp = stepFieldProgress(step, values);
  const skippable = canSkip(step);
  const counted = steps.filter((s) => s.id !== "review");
  const doneCount = counted.filter((s) => ["pass", "skipped"].includes(stepStatus(s, state))).length;

  return (
    <div className="flex flex-col gap-6">
      {region}
      {/* Overall progress */}
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-ink-3">
            <span className="font-display text-xl font-semibold text-ink tabular">{pct}%</span> complete ·{" "}
            <span className="tabular">
              {doneCount} of {counted.length}
            </span>{" "}
            steps working or skipped
          </p>
          <p className="text-xs text-ink-4" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : saveState === "unavailable" ? "Not saved: the onboarding API is not reachable in this environment" : ""}
          </p>
        </div>
        <Progress value={pct} label="Onboarding progress" />
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
          {(["pass", "partial", "fail", "pending", "skipped"] as StepStatus[]).map((k) => (
            <span key={k} className="tabular">
              {STATUS_LABEL[k]}: <strong className="font-semibold text-ink">{counted.filter((s) => stepStatus(s, state) === k).length}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* Stepper grouped by group */}
        <nav aria-label="Onboarding steps" className="lg:sticky lg:top-20 lg:self-start">
          <ol className="flex flex-col gap-4">
            {GROUPS.map((g) => {
              const groupSteps = steps.filter((s) => s.group === g.id);
              if (!groupSteps.length) return null;
              return (
                <li key={g.id}>
                  <p className="mb-1 px-2 text-2xs font-semibold tracking-wider text-ink-4 uppercase">{g.label}</p>
                  <ol className="flex flex-col gap-px">
                    {groupSteps.map((s) => {
                      const st = stepStatus(s, state);
                      const n = steps.indexOf(s) + 1;
                      const active = s.id === current;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => go(s.id)}
                            aria-current={active ? "step" : undefined}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                              active ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-2 hover:bg-subtle",
                            )}
                          >
                            <span className="w-4 shrink-0 text-right text-2xs text-ink-4 tabular">{n}</span>
                            <span className="min-w-0 flex-1 truncate">{s.short}</span>
                            {s.optional ? <span className="text-2xs text-ink-4">opt.</span> : null}
                            {st === "skipped" ? <SkipForward className="size-4 text-ink-4" aria-label="Skipped" /> : <StatusIcon status={STATUS_FOR_PILL[st]} />}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {/* Step header + why */}
          <section className="rounded-md border border-line bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs text-ink-4">
                    Step {idx + 1} of {steps.length} · {GROUPS.find((g) => g.id === step.group)?.label}
                    {step.optional ? " · Optional" : ""}
                  </p>
                  <h2 className="text-lg font-semibold text-ink">{step.title}</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status === "skipped" ? <Badge tone="neutral">Skipped / not applicable</Badge> : <StatusPill status={STATUS_FOR_PILL[status]} label={STATUS_LABEL[status]} />}
                {skippable && step.id !== "review" ? (
                  <Tooltip content={step.id === "github" && !step.optional ? "Skip when your blog is not in a Git repository (e.g. WordPress, Webflow, Shopify)." : "Optional step. Skipping counts as done."}>
                    <Button size="sm" variant="ghost" onClick={toggleSkip}>
                      {state.skipped[current] ? <Undo2 /> : <SkipForward />}
                      {state.skipped[current] ? "Undo skip" : "Skip / not applicable"}
                    </Button>
                  </Tooltip>
                ) : null}
              </div>
            </div>
            <div className="mx-5 mt-4 mb-5 rounded-sm bg-subtle/70 px-4 py-3">
              <p className="text-2xs font-semibold tracking-wider text-ink-4 uppercase">Why we need this</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.why}</p>
            </div>
          </section>

          {step.id === "review" ? <ReviewSummary steps={steps} state={state} onGo={go} /> : null}

          {state.skipped[current] ? (
            <p className="rounded-md border border-dashed border-line-strong px-5 py-6 text-center text-sm text-ink-3">
              You marked this step as skipped. It counts as done. Undo the skip to fill it in.
            </p>
          ) : (
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_400px]">
              <section className="rounded-md border border-line bg-surface" aria-label="Fields">
                <header className="flex items-center justify-between border-b border-line px-5 py-3">
                  <h3 className="font-sans text-md font-semibold text-ink">What we need</h3>
                  <span className="text-xs text-ink-3 tabular">
                    {fp.done} of {fp.total} required filled
                  </span>
                </header>
                <div className="px-5 py-5">
                  <FieldList fields={step.fields} values={values} onChange={setField} ctx={{ orgId, stepId: step.id, path: "" }} />
                </div>
              </section>
              <div className="flex min-w-0 flex-col gap-6">
                <InstructionsPanel step={step} values={values} placeholders={placeholders} />
                <TestsPanel orgId={orgId} step={step} values={values} results={state.tests[current] ?? {}} onResult={setTest} onError={toast} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={idx === 0} onClick={() => go(steps[idx - 1]!.id)}>
              <ArrowLeft /> Previous
            </Button>
            {idx < steps.length - 1 ? (
              <Button onClick={() => go(steps[idx + 1]!.id)}>
                Next: {steps[idx + 1]!.short} <ArrowRight />
              </Button>
            ) : (
              <SubmitButton steps={steps} state={state} orgId={orgId} orgName={orgName} orgSlug={orgSlug} onSubmitted={(at) => setState((s) => ({ ...s, submittedAt: at }))} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewSummary({ steps, state, onGo }: { steps: OnboardingStep[]; state: WizardState; onGo: (id: string) => void }) {
  return (
    <section className="rounded-md border border-line bg-surface" aria-label="Review">
      <header className="border-b border-line px-5 py-3">
        <h3 className="font-sans text-md font-semibold text-ink">Every step at a glance</h3>
        <p className="text-sm text-ink-3">Required steps must be working before you submit. Optional steps can stay skipped.</p>
      </header>
      <ul className="divide-y divide-line">
        {steps
          .filter((s) => s.id !== "review")
          .map((s) => {
            const st = stepStatus(s, state);
            const missing = st === "skipped" ? [] : stepMissing(s, state.values[s.id] ?? {});
            const failing = Object.values(state.tests[s.id] ?? {}).filter((r) => r.status !== "pass");
            return (
              <li key={s.id} className="grid grid-cols-[minmax(0,220px)_120px_minmax(0,1fr)_auto] items-start gap-4 px-5 py-3">
                <span className="text-sm font-medium text-ink">
                  {s.title}
                  {s.optional ? <span className="ml-1 text-xs font-normal text-ink-4">(optional)</span> : null}
                </span>
                <span>{st === "skipped" ? <Badge tone="neutral">Skipped</Badge> : <StatusPill status={STATUS_FOR_PILL[st]} label={STATUS_LABEL[st]} />}</span>
                <span className="text-xs text-ink-3">
                  {missing.length ? `Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}` : null}
                  {failing.length ? (
                    <span className="block text-bad">
                      {failing.length} test{failing.length > 1 ? "s" : ""} not passing: {failing.map((f) => f.summary).join("; ").slice(0, 140)}
                    </span>
                  ) : null}
                  {!missing.length && !failing.length && st !== "skipped" ? (st === "pass" ? "All good" : "Run the live tests to confirm") : null}
                </span>
                <button type="button" onClick={() => onGo(s.id)} className="text-sm font-medium text-accent hover:underline">
                  Open
                </button>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

function SubmitButton({
  steps,
  state,
  orgId,
  orgName,
  orgSlug,
  onSubmitted,
}: {
  steps: OnboardingStep[];
  state: WizardState;
  orgId: string;
  orgName: string;
  orgSlug: string;
  onSubmitted: (at: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const blocking = steps.filter((s) => s.id !== "review" && !s.optional && !["pass", "skipped"].includes(stepStatus(s, state)));
  const review = steps.find((s) => s.id === "review");
  const reviewReady = review ? stepMissing(review, state.values.review ?? {}).length === 0 : true;
  if (state.submittedAt) {
    return (
      <span className="flex items-center gap-3">
        <StatusPill status="pass" label="Submitted" />
        <Link href={`/app/${orgSlug}`} className="text-sm font-medium text-accent hover:underline">
          Go to dashboard
        </Link>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        disabled={blocking.length > 0 || !reviewReady}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const res = await saveProgress(orgId, "review", serialisableValues(state.values.review ?? {}), "in_progress", "submitted");
          setBusy(false);
          if (res.available) onSubmitted(new Date().toISOString());
          else setMsg(`Not submitted: ${res.error}`);
        }}
      >
        Submit onboarding for {orgName}
      </Button>
      {blocking.length ? <span className="text-xs text-ink-3">{blocking.length} required step{blocking.length > 1 ? "s" : ""} not working yet</span> : null}
      {msg ? <span className="text-xs text-bad" role="alert">{msg}</span> : null}
    </span>
  );
}
