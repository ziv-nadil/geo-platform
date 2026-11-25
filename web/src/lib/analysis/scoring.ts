/**
 * Metrics (docs/research/ai-engine-methodology.md sections 3.3-3.8). All pure functions.
 * Weights are config and versioned with METRIC_VERSION so history can be recomputed.
 */

export const METRIC_VERSION = 'metrics@1';

export const SCORE_WEIGHTS = { base: 0.55, position: 0.25, ownedCitation: 0.2 } as const;

/** Default engine weights lambda (placeholders, tune per client; must sum to 1 over enabled engines). */
export const DEFAULT_ENGINE_WEIGHTS: Record<string, number> = {
  chatgpt: 0.35,
  google_aio: 0.15,
  google_ai_mode: 0.15,
  gemini: 0.15,
  perplexity: 0.1,
  claude: 0.1,
};

// ---------------------------------------------------------------------------
// Per observation
// ---------------------------------------------------------------------------

/** pos = 1/log2(1+rank) when ranked, else 1 - firstOffset; 0 when not mentioned. */
export function positionScore(mentioned: boolean, rank: number | null | undefined, firstOffset: number | null | undefined): number {
  if (!mentioned) return 0;
  if (rank && rank >= 1) return 1 / Math.log2(1 + rank);
  const off = Math.min(1, Math.max(0, firstOffset ?? 1));
  return 1 - off;
}

/** s=-1 -> 0.5; 0 -> 0.75; +1 -> 1.0. Unknown sentiment counts as neutral. */
export function sentFactor(s: number | null | undefined): number {
  const v = Math.min(1, Math.max(-1, s ?? 0));
  return 0.5 + 0.25 * (v + 1);
}

/** score_o in [0,1]. */
export function observationScore(o: { mentioned: boolean; pos: number; ownedCited: boolean; sentiment?: number | null }): number {
  if (!o.mentioned) return 0;
  const w = SCORE_WEIGHTS;
  return (w.base + w.position * o.pos + w.ownedCitation * (o.ownedCited ? 1 : 0)) * sentFactor(o.sentiment);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface Observation {
  promptId: string;
  engine: string;
  score: number;
  mentioned: boolean;
  /** Prompt importance omega_p (default 1). */
  importance?: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** VS_e = 100 * sum_p omega_p * cell(p,e) / sum_p omega_p, cell = mean score over runs. */
export function engineVisibility(obs: readonly Observation[]): number {
  const cells = new Map<string, { scores: number[]; w: number }>();
  for (const o of obs) {
    const c = cells.get(o.promptId) ?? { scores: [], w: o.importance ?? 1 };
    c.scores.push(o.score);
    cells.set(o.promptId, c);
  }
  let num = 0;
  let den = 0;
  for (const c of cells.values()) {
    num += c.w * mean(c.scores);
    den += c.w;
  }
  return den ? (100 * num) / den : 0;
}

/** VS = sum_e lambda_e * VS_e, lambda renormalized over engines that have data. */
export function overallVisibility(
  byEngine: Readonly<Record<string, number>>,
  weights: Readonly<Record<string, number>> = DEFAULT_ENGINE_WEIGHTS,
): number {
  const engines = Object.keys(byEngine);
  const total = engines.reduce((s, e) => s + (weights[e] ?? 0), 0);
  if (!total) return engines.length ? mean(engines.map((e) => byEngine[e])) : 0;
  return engines.reduce((s, e) => s + ((weights[e] ?? 0) / total) * byEngine[e], 0);
}

/** Per-response entity entry for SoV. rank null = mentioned but unranked. */
export interface SovEntry {
  entity: string;
  mentioned: boolean;
  rank?: number | null;
}

/** SoV_mention and SoV_weighted for every entity seen (incl. confirmed unknown entities). */
export function shareOfVoice(responses: ReadonlyArray<readonly SovEntry[]>): Record<string, { mention: number; weighted: number }> {
  const mentionCount = new Map<string, number>();
  const weightSum = new Map<string, number>();
  let mTotal = 0;
  let wTotal = 0;
  for (const r of responses) {
    for (const e of r) {
      if (!e.mentioned) continue;
      const w = e.rank && e.rank >= 1 ? 1 / Math.log2(1 + e.rank) : 1;
      mentionCount.set(e.entity, (mentionCount.get(e.entity) ?? 0) + 1);
      weightSum.set(e.entity, (weightSum.get(e.entity) ?? 0) + w);
      mTotal += 1;
      wTotal += w;
    }
  }
  const out: Record<string, { mention: number; weighted: number }> = {};
  for (const [k, v] of mentionCount) out[k] = { mention: mTotal ? v / mTotal : 0, weighted: wTotal ? weightSum.get(k)! / wTotal : 0 };
  return out;
}

/** Response-level citation rate and URL-share per domain (section 3.5). Input: cited domains per response, deduped by URL. */
export function citationMetrics(responses: ReadonlyArray<ReadonlyArray<{ domain: string; urlCanonical: string; cited: boolean }>>) {
  const respHits = new Map<string, number>();
  const urlHits = new Map<string, number>();
  let totalUrls = 0;
  for (const r of responses) {
    const urls = new Map<string, string>();
    for (const c of r) if (c.cited) urls.set(c.urlCanonical, c.domain);
    const domains = new Set(urls.values());
    for (const d of domains) respHits.set(d, (respHits.get(d) ?? 0) + 1);
    for (const d of urls.values()) urlHits.set(d, (urlHits.get(d) ?? 0) + 1);
    totalUrls += urls.size;
  }
  const n = responses.length;
  const out: Record<string, { rate: number; share: number }> = {};
  for (const [d, h] of respHits) out[d] = { rate: n ? h / n : 0, share: totalUrls ? (urlHits.get(d) ?? 0) / totalUrls : 0 };
  return out;
}

export function netSentiment(labels: ReadonlyArray<'positive' | 'neutral' | 'negative' | 'mixed'>): number {
  if (!labels.length) return 0;
  const pos = labels.filter((l) => l === 'positive').length;
  const neg = labels.filter((l) => l === 'negative').length;
  return (pos - neg) / labels.length;
}

// ---------------------------------------------------------------------------
// Confidence intervals (section 3.8)
// ---------------------------------------------------------------------------

export interface Interval {
  value: number;
  lo: number;
  hi: number;
}

/** Fixed-panel visibility rate: V = mean_i p_i, Var = (1/M^2) sum p_i(1-p_i)/(R_i-1) for R_i >= 2. */
export function visibilityCI(cells: ReadonlyArray<{ runs: number; mentioned: number }>, z = 1.96): Interval & { se: number } {
  const valid = cells.filter((c) => c.runs > 0);
  const M = valid.length;
  if (!M) return { value: 0, lo: 0, hi: 0, se: 0 };
  const p = valid.map((c) => c.mentioned / c.runs);
  const V = mean(p);
  let varSum = 0;
  valid.forEach((c, i) => {
    if (c.runs >= 2) varSum += (p[i] * (1 - p[i])) / (c.runs - 1);
  });
  const se = Math.sqrt(varSum) / M;
  return { value: V, lo: Math.max(0, V - z * se), hi: Math.min(1, V + z * se), se };
}

/** Wilson score interval for k of n (per-cell display "mentioned in 4 of 6 runs"). */
export function wilsonInterval(k: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { value: 0, lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { value: p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/** Beta(1+k, 1+n-k) posterior mean with a normal-approximation credible interval. */
export function betaPosterior(k: number, n: number, z = 1.96): Interval {
  const a = 1 + k;
  const b = 1 + n - k;
  const m = a / (a + b);
  const v = (a * b) / ((a + b) ** 2 * (a + b + 1));
  const sd = Math.sqrt(v);
  return { value: m, lo: Math.max(0, m - z * sd), hi: Math.min(1, m + z * sd) };
}

/** Seeded PRNG (mulberry32) for reproducible bootstraps. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Change detection between two windows: bootstrap runs within prompts, flag only when the 95% CI
 * of the difference excludes 0 AND |diff| >= minAbs (default 3 pp).
 * Each window: promptId -> array of 0/1 mention outcomes.
 */
export function detectChange(
  before: ReadonlyMap<string, readonly number[]>,
  after: ReadonlyMap<string, readonly number[]>,
  opts: { iterations?: number; seed?: number; minAbs?: number } = {},
): { diff: number; lo: number; hi: number; significant: boolean } {
  const iters = opts.iterations ?? 1000;
  const rnd = mulberry32(opts.seed ?? 42);
  const minAbs = opts.minAbs ?? 0.03;
  const prompts = [...before.keys()].filter((p) => after.has(p) && before.get(p)!.length && after.get(p)!.length);
  if (!prompts.length) return { diff: 0, lo: 0, hi: 0, significant: false };
  const v = (w: ReadonlyMap<string, readonly number[]>) => mean(prompts.map((p) => mean([...w.get(p)!])));
  const diff = v(after) - v(before);
  const resample = (xs: readonly number[]) => {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rnd() * xs.length)];
    return s / xs.length;
  };
  const diffs: number[] = [];
  for (let it = 0; it < iters; it++) {
    const a = mean(prompts.map((p) => resample(after.get(p)!)));
    const b = mean(prompts.map((p) => resample(before.get(p)!)));
    diffs.push(a - b);
  }
  diffs.sort((x, y) => x - y);
  const lo = diffs[Math.floor(0.025 * iters)];
  const hi = diffs[Math.min(iters - 1, Math.ceil(0.975 * iters) - 1)];
  return { diff, lo, hi, significant: (lo > 0 || hi < 0) && Math.abs(diff) >= minAbs };
}
