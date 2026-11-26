import type { FieldDef, OnboardingStep, TestDef } from "@/config/onboarding";
import type { TestResult } from "./api-client";

/** A stored file reference (the binary lives in Supabase Storage, never in client state). */
export interface FileRef {
  kind: "file";
  name: string;
  size: number;
  type: string;
  path?: string;
  previewUrl?: string;
  status: "uploading" | "stored" | "local";
  note?: string;
}

/** A secret reference. The secret value itself is never held in state. */
export interface SecretRef {
  kind: "secret";
  stored: boolean;
  ref?: string;
  last4?: string;
  storedAt?: string;
}

export type Row = Record<string, FieldValue>;
export type FieldValue = string | string[] | Row[] | FileRef | SecretRef | undefined;
export type StepValues = Record<string, FieldValue>;

export type StepStatus = "idle" | "pending" | "pass" | "partial" | "fail" | "skipped";

export interface WizardState {
  values: Record<string, StepValues>;
  tests: Record<string, Record<string, TestResult>>;
  skipped: Record<string, boolean>;
  /** Status stored on the server (onboarding_progress), used until a test runs in this session. */
  serverStatus?: Record<string, StepStatus>;
  submittedAt?: string;
}

export const GROUPS: { id: OnboardingStep["group"]; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "brand", label: "Brand" },
  { id: "access", label: "Access" },
  { id: "stack", label: "Tools & stack" },
];

/** showIf is evaluated against the scope the field lives in: the step, or a repeater/table row. */
export function isVisible(field: FieldDef, scope: Record<string, FieldValue>): boolean {
  if (!field.showIf) return true;
  const v = scope[field.showIf.field];
  const want = field.showIf.equals;
  if (Array.isArray(v)) return Array.isArray(want) ? want.some((w) => (v as string[]).includes(w)) : (v as string[]).includes(want);
  return Array.isArray(want) ? want.includes(String(v ?? "")) : v === want;
}

export function isFilled(field: FieldDef, value: FieldValue): boolean {
  if (value === undefined || value === null) return false;
  switch (field.type) {
    case "multiselect":
      return Array.isArray(value) && value.length > 0;
    case "file":
      return typeof value === "object" && !Array.isArray(value) && value.kind === "file" && value.status === "stored";
    case "secret":
      return typeof value === "object" && !Array.isArray(value) && value.kind === "secret" && value.stored;
    case "table":
    case "repeater": {
      if (!Array.isArray(value)) return false;
      const rows = value as Row[];
      const min = field.min ?? 1;
      if (rows.length < min) return false;
      const children = field.columns ?? field.fields ?? [];
      return rows.every((row) => children.every((c) => !c.required || !isVisible(c, row) || isFilled(c, row[c.id])));
    }
    default:
      return typeof value === "string" && value.trim().length > 0;
  }
}

/** Human-readable list of what is missing in a field (for repeaters: "Profile 2 › Personas: needs 2"). */
export function missingIn(field: FieldDef, value: FieldValue, prefix = ""): string[] {
  const label = `${prefix}${field.label}`;
  if (field.type !== "table" && field.type !== "repeater") return isFilled(field, value) ? [] : [label];
  const rows = Array.isArray(value) ? (value as Row[]) : [];
  const out: string[] = [];
  const min = field.min ?? (field.required ? 1 : 0);
  if (rows.length < min) out.push(`${label}: ${rows.length} of ${min} added`);
  const children = field.columns ?? field.fields ?? [];
  rows.forEach((row, i) => {
    for (const c of children) {
      if (c.required && isVisible(c, row) && !isFilled(c, row[c.id])) out.push(...missingIn(c, row[c.id], `${field.label} ${i + 1} › `));
    }
  });
  return out;
}

export function requiredFields(step: OnboardingStep, values: StepValues): FieldDef[] {
  return step.fields.filter((f) => f.required && isVisible(f, values));
}

export function stepMissing(step: OnboardingStep, values: StepValues): string[] {
  return requiredFields(step, values).flatMap((f) => missingIn(f, values[f.id]));
}

export function stepFieldProgress(step: OnboardingStep, values: StepValues): { done: number; total: number } {
  const req = requiredFields(step, values);
  return { done: req.filter((f) => isFilled(f, values[f.id])).length, total: req.length };
}

/** A test runs only when every `requires` field is visible and filled. */
export function testRunnable(step: OnboardingStep, test: TestDef, values: StepValues): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const id of test.requires) {
    const f = step.fields.find((x) => x.id === id);
    if (!f) continue;
    if (!isVisible(f, values)) {
      missing.push(`${f.label} (hidden by your choices: test not applicable)`);
      continue;
    }
    if (!isFilled(f, values[id])) missing.push(f.label);
  }
  return { ok: missing.length === 0, missing };
}

/** Tests whose required fields are hidden by showIf do not apply to this configuration. */
export function applicableTests(step: OnboardingStep, values: StepValues): TestDef[] {
  return step.tests.filter((t) => t.requires.every((id) => {
    const f = step.fields.find((x) => x.id === id);
    return !f || isVisible(f, values);
  }));
}

/** Git is only used for draft-PR delivery: the GitHub step is skipped automatically unless the chosen CMS is Git-based. */
export function autoSkipReason(step: OnboardingStep, st: WizardState): string | null {
  if (step.id !== "github") return null;
  const cms = st.values.cms?.cms_platform;
  if (typeof cms === "string" && cms !== "" && cms !== "git") return "Your CMS is not Git-based, so we do not need a repository. Skipped automatically.";
  return null;
}

export function stepStatus(step: OnboardingStep, st: WizardState): StepStatus {
  if (st.skipped[step.id] || autoSkipReason(step, st)) return "skipped";
  const computed = computedStatus(step, st);
  const server = st.serverStatus?.[step.id];
  if (server && server !== "idle" && (computed === "idle" || computed === "pending")) return server;
  return computed;
}

function computedStatus(step: OnboardingStep, st: WizardState): StepStatus {
  const values = st.values[step.id] ?? {};
  const { done, total } = stepFieldProgress(step, values);
  const tests = applicableTests(step, values);
  const results = tests.map((t) => st.tests[step.id]?.[t.id]).filter(Boolean) as TestResult[];
  if (tests.length === 0) {
    if (total === 0) return Object.values(values).some((v) => v !== undefined && v !== "") ? "pass" : "idle";
    return done === total ? "pass" : done > 0 ? "pending" : "idle";
  }
  if (results.length === tests.length) {
    if (results.every((r) => r.status === "pass")) return done === total ? "pass" : "partial";
    if (results.some((r) => r.status === "fail")) return "fail";
    return "partial";
  }
  if (results.some((r) => r.status === "fail")) return "fail";
  const touched = done > 0 || Object.values(values).some((v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0));
  return touched ? "pending" : "idle";
}

/** Can this step be marked "skip / not applicable"? Optional steps always; GitHub when the CMS is not Git-based. */
export function canSkip(step: OnboardingStep): boolean {
  return Boolean(step.optional) || step.id === "github";
}

export function overallProgress(steps: OnboardingStep[], st: WizardState): number {
  const counted = steps.filter((s) => s.id !== "review");
  if (!counted.length) return 0;
  let score = 0;
  for (const s of counted) {
    const status = stepStatus(s, st);
    if (status === "pass" || status === "skipped") score += 1;
    else if (status === "partial") score += 0.5;
  }
  return Math.round((score / counted.length) * 100);
}

/** Selector field for variant instruction blocks: the select/radio whose options include a block variant. */
export function variantSelector(step: OnboardingStep): FieldDef | undefined {
  const variants = new Set(step.instructions.map((b) => b.variant).filter(Boolean) as string[]);
  if (!variants.size) return undefined;
  return step.fields.find((f) => (f.type === "select" || f.type === "radio") && f.options?.some((o) => variants.has(o.value)));
}

/** Replace {{KEYS}}; unset keys stay as-is, or become `fallback` when given. */
export function substitute(text: string, placeholders: Record<string, string>, fallback?: string): string {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k: string) => placeholders[k] || fallback || m);
}

/** Human label for an instruction variant: the selector option label, else the block title, never the raw key. */
export function variantLabel(step: OnboardingStep, selector: FieldDef | undefined, variant: string): string {
  const fromOption = selector?.options?.find((o) => o.value === variant)?.label;
  if (fromOption) return fromOption;
  const title = step.instructions.find((b) => b.variant === variant)?.title;
  if (title) return title;
  const words = variant.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Strip non-serialisable or sensitive parts before sending values to the server. */
export function serialisableValues(values: StepValues): StepValues {
  const out: StepValues = {};
  for (const [k, v] of Object.entries(values)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (v.kind === "secret") continue; // secrets are stored in the vault only; never in progress data
      else out[k] = { kind: "file", name: v.name, size: v.size, type: v.type, path: v.path, status: v.status };
    } else if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      out[k] = (v as Row[]).map((r) => serialisableValues(r) as Row);
    } else out[k] = v;
  }
  return out;
}
