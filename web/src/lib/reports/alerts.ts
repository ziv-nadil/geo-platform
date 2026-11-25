/** Pure alert thresholds. The caller supplies already-aggregated numbers; nothing here does I/O. */

/** Binomial standard error of a visibility % (0-100) over n scored runs. */
export function visibilitySe(visibilityPct: number, n: number): number {
  if (n <= 1) return 100;
  const p = Math.min(1, Math.max(0, visibilityPct / 100));
  return (100 * Math.sqrt((p * (1 - p)) / (n - 1)));
}

export type Window = { visibility: number | null; scoredRuns: number };

/**
 * Visibility drop alert. Fires only when the drop is at least the larger of the configured floor and the
 * combined 95% CI half-width of the two windows (so run-to-run LLM noise does not page anyone).
 */
export function visibilityDrop(cur: Window, prev: Window, opts: { minDrop?: number; z?: number } = {}) {
  const minDrop = opts.minDrop ?? 5;
  const z = opts.z ?? 1.96;
  if (cur.visibility === null || prev.visibility === null || cur.scoredRuns < 2 || prev.scoredRuns < 2) {
    return { fire: false as const, drop: null, threshold: minDrop };
  }
  const se = Math.sqrt(visibilitySe(cur.visibility, cur.scoredRuns) ** 2 + visibilitySe(prev.visibility, prev.scoredRuns) ** 2);
  const threshold = Math.max(minDrop, z * se);
  const drop = Math.round((prev.visibility - cur.visibility) * 100) / 100;
  return { fire: drop >= threshold, drop, threshold: Math.round(threshold * 100) / 100 };
}

export type CompetitorCitation = { competitorId: string; competitorName: string; domain: string; url: string };

/** Competitor citations in the recent window whose (competitor, domain) pair was never cited before. */
export function newCompetitorCitations(recent: CompetitorCitation[], seenBefore: ReadonlySet<string>): CompetitorCitation[] {
  const out = new Map<string, CompetitorCitation>();
  for (const c of recent) {
    const key = citationKey(c.competitorId, c.domain);
    if (!seenBefore.has(key) && !out.has(key)) out.set(key, c);
  }
  return [...out.values()];
}
export const citationKey = (competitorId: string, domain: string) => `${competitorId}|${domain.toLowerCase()}`;

export type BotHit = { bot: string; status: number | null; hits: number };

/** A crawler is "blocked" when most of a meaningful volume of requests got 401/403/429/5xx-style denials. */
export function detectCrawlerBlocks(rows: BotHit[], opts: { minHits?: number; blockedShare?: number } = {}): { bot: string; total: number; blocked: number; share: number }[] {
  const minHits = opts.minHits ?? 20;
  const blockedShare = opts.blockedShare ?? 0.8;
  const by = new Map<string, { total: number; blocked: number }>();
  for (const r of rows) {
    const e = by.get(r.bot) ?? { total: 0, blocked: 0 };
    e.total += r.hits;
    if (r.status === 401 || r.status === 403 || r.status === 429) e.blocked += r.hits;
    by.set(r.bot, e);
  }
  return [...by.entries()]
    .map(([bot, e]) => ({ bot, ...e, share: e.total ? Math.round((e.blocked / e.total) * 1000) / 1000 : 0 }))
    .filter((b) => b.total >= minHits && b.share >= blockedShare)
    .sort((a, b) => b.blocked - a.blocked);
}
