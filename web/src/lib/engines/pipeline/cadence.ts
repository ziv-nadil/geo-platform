/**
 * Run planning (docs/research/ai-engine-methodology.md section 4.2), pure.
 *
 * - Google AI Overviews / AI Mode: daily, 1 run per prompt.
 * - LLM engines: weekly on the org's stagger weekday; core prompts x3 runs, tail x1.
 * - New org (no runs yet): one baseline sweep, every engine x 5 runs per prompt.
 */
import { LLM_ENGINES, SERP_ENGINES, type EngineId } from '../types';

export const CORE_RUNS = 3;
export const TAIL_RUNS = 1;
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

/** 0 = Sunday ... 6 = Saturday: the weekday this org's LLM sweep runs. */
export function staggerWeekday(orgId: string): number {
  return hash32(orgId) % 7;
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
  const llmDay = args.date.getUTCDay() === staggerWeekday(args.orgId);
  const core = corePromptIds(args.prompts);
  for (const p of args.prompts) {
    for (const engine of args.engines) {
      if (SERP_ENGINES.includes(engine)) {
        out.push({ promptId: p.id, engine, runIndex: 0, trigger: 'schedule', runDate });
      } else if (llmDay && !args.llmPaused) {
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
