import { EST_USD_PER_ITEM, EST_USD_PER_RUN_START, type Platform } from './config';

export interface BudgetState {
  killSwitch: boolean;
  monthSpentUsd: number;
  monthlyBudgetUsd: number;
  runsToday: number;
  maxRunsPerDay: number;
}
export type BudgetVerdict = { ok: true; maxTotalChargeUsd: number } | { ok: false; reason: 'kill_switch' | 'monthly_budget' | 'daily_runs'; message: string };

export function estimateRunUsd(platform: Platform, maxItems: number): number {
  return Math.round((EST_USD_PER_RUN_START + EST_USD_PER_ITEM[platform] * maxItems) * 10000) / 10000;
}

/** Decide whether one more actor run may start. The returned cap is passed to Apify as maxTotalChargeUsd (hard stop). */
export function checkBudget(s: BudgetState, platform: Platform, maxItems: number): BudgetVerdict {
  if (s.killSwitch) return { ok: false, reason: 'kill_switch', message: 'Social pulse is switched off globally.' };
  if (s.runsToday >= s.maxRunsPerDay) return { ok: false, reason: 'daily_runs', message: `Daily run cap reached (${s.maxRunsPerDay}).` };
  const remaining = s.monthlyBudgetUsd - s.monthSpentUsd;
  const est = estimateRunUsd(platform, maxItems);
  if (remaining <= 0 || remaining < est) {
    return { ok: false, reason: 'monthly_budget', message: `Monthly budget guard: $${Math.max(0, remaining).toFixed(2)} left, this run needs about $${est.toFixed(2)}.` };
  }
  return { ok: true, maxTotalChargeUsd: Math.round(Math.min(remaining, est * 2) * 10000) / 10000 };
}

/** Stable per-org hour (UTC) so orgs do not all run at once. */
export function staggerHour(orgId: string): number {
  let h = 0;
  for (const c of orgId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 24;
}
export function dueNow(orgId: string, lastRunOn: string | null, now = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  return lastRunOn !== today && now.getUTCHours() >= staggerHour(orgId);
}
