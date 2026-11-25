/**
 * Run planning (docs/research/ai-engine-methodology.md section 4.2), pure.
 *
 * - Every engine (LLM and SERP): twice a week, 1 run per prompt, on two org-staggered weekdays
 *   (Mon + Thu shifted by the org's stagger offset 0..2, so the gap stays 3/4 days).
 * - New org (no runs yet): one baseline sweep, every engine x 5 runs per prompt (SERP x1).
 */
import { LLM_ENGINES, SERP_ENGINES, type EngineId } from '../types';

export const CORE_RUNS = 1;
export const TAIL_RUNS = 1;
export const SWEEP_DAYS = [1, 4] as const; // Monday, Thursday
export const BASELINE_RUNS = 5;
export const FALLBACK_CORE_SIZE = 25;

export interface PlanPrompt {
  id: string;
  tier: 'core' | 'tail';
  funnelStage: string | null;
  createdAt: string;
}

export interface PlannedRun {
  promptId: string;
  engine: EngineId;
  runIndex: number;
  trigger: 'schedule' | 'baseline';
  runDate: string; // YYYY-MM-DD (UTC)
}

/** FNV-1a 32-bit, stable across runtimes. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 0..2 day offset applied to Mon + Thu so orgs spread over Mon-Wed and Thu-Sat. */
export function staggerOffset(orgId: string): number {
  return hash32(orgId) % 3;
}

/** The two weekdays (0 = Sunday) this org's engines run. */
export function sweepWeekdays(orgId: string): [number, number] {
  const o = staggerOffset(orgId);
  return [SWEEP_DAYS[0] + o, SWEEP_DAYS[1] + o];
}

/** First sweep weekday, kept for callers that need one stagger day. */
export function staggerWeekday(orgId: string): number {
  return sweepWeekdays(orgId)[0];
}

export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const STAGE_ORDER: Record<string, number> = { decision: 0, consideration: 1, retention: 2, awareness: 3 };

/** Explicit tier wins; if the org flagged no core prompts, the first 25 BOFU-first prompts are core. */
export function corePromptIds(prompts: readonly PlanPrompt[]): Set<string> {
  const flagged = prompts.filter((p) => p.tier === 'core');
  if (flagged.length) return new Set(flagged.map((p) => p.id));
  const sorted = [...prompts].sort(
    (a, b) =>
      (STAGE_ORDER[a.funnelStage ?? ''] ?? 9) - (STAGE_ORDER[b.funnelStage ?? ''] ?? 9) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  return new Set(sorted.slice(0, FALLBACK_CORE_SIZE).map((p) => p.id));
}

export function planRuns(args: {
  orgId: string;
  prompts: readonly PlanPrompt[];
  engines: readonly EngineId[];
  date: Date;
  baseline?: boolean;
  /** Skip LLM engines (budget guard). */
  llmPaused?: boolean;
}): PlannedRun[] {
  const runDate = utcDate(args.date);
  const out: PlannedRun[] = [];
  if (args.baseline) {
    for (const p of args.prompts)
      for (const engine of args.engines) {
        if (args.llmPaused && LLM_ENGINES.includes(engine)) continue;
        const n = SERP_ENGINES.includes(engine) ? 1 : BASELINE_RUNS;
        for (let i = 0; i < n; i++) out.push({ promptId: p.id, engine, runIndex: i, trigger: 'baseline', runDate });
      }
    return out;
  }
  const sweepDay = sweepWeekdays(args.orgId).includes(args.date.getUTCDay());
  const core = corePromptIds(args.prompts);
  for (const p of args.prompts) {
    for (const engine of args.engines) {
      if (!sweepDay) continue;
      if (SERP_ENGINES.includes(engine)) {
        out.push({ promptId: p.id, engine, runIndex: 0, trigger: 'schedule', runDate });
      } else if (!args.llmPaused) {
        const n = core.has(p.id) ? CORE_RUNS : TAIL_RUNS;
        for (let i = 0; i < n; i++) out.push({ promptId: p.id, engine, runIndex: i, trigger: 'schedule', runDate });
      }
    }
  }
  return out;
}

/** Retry delay for a failed attempt (DB-level requeue): 2, 8, 30 minutes, honouring retry-after. */
export function requeueDelayMs(attempts: number, retryAfterMs?: number): number {
  const steps = [2, 8, 30].map((m) => m * 60_000);
  return Math.max(steps[Math.min(attempts - 1, steps.length - 1)] ?? steps[0], retryAfterMs ?? 0);
}
