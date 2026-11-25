/** Pure dedupe / cluster / score logic for prompt discovery. */
export type DiscoverySource = 'gsc' | 'keyword_planner' | 'paa' | 'llm';

export interface Candidate {
  text: string; source: DiscoverySource; volume?: number | null;
  topic?: string | null; persona?: string | null; funnel?: string | null;
}
export interface Suggestion {
  text: string; normKey: string; clusterKey: string; topic: string | null; persona: string | null; funnel: string | null;
  sources: DiscoverySource[]; volume: number | null; intent: number; competitorPresence: number; score: number;
  parts: { volume: number; intent: number; competitor: number };
}

const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'for', 'to', 'of', 'in', 'on', 'and', 'or', 'with', 'what', 'which', 'how', 'do', 'does', 'i', 'my', 'me', 'can', 'should', 'best', 'top']);

const stem = (w: string): string => (w.length > 4 && w.endsWith('sses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

export const tokens = (s: string): string[] =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem);

export const normKey = (s: string): string => [...new Set(tokens(s))].sort().join(' ');

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}

const COMMERCIAL = /\b(best|top|vs|versus|alternative|alternatives|compare|comparison|pricing|price|cost|review|reviews|worth|recommend|should i)\b/i;
const QUESTION = /^(what|which|how|why|who|when|where|can|does|do|is|are|should)\b/i;

/** 0.2..1: conversational/commercial queries read like AI prompts; bare keywords do not. */
export function intentScore(text: string): number {
  const words = text.trim().split(/\s+/).length;
  let s = 0.2;
  if (QUESTION.test(text) || text.includes('?')) s += 0.3;
  if (COMMERCIAL.test(text)) s += 0.3;
  if (words >= 6) s += 0.2; else if (words >= 4) s += 0.1;
  return Math.min(1, s);
}

/** 0..1 share of competitor names that appear in the text (1 name already saturates at 0.6). */
export function competitorPresence(text: string, competitors: string[]): number {
  const t = text.toLowerCase();
  const hits = competitors.filter((c) => c.trim().length > 1 && t.includes(c.toLowerCase())).length;
  return hits === 0 ? 0 : Math.min(1, 0.6 + 0.2 * (hits - 1));
}

export const volumeNorm = (v: number | null | undefined): number => (v && v > 0 ? Math.min(1, Math.log10(1 + v) / 5) : 0);

export function scoreSuggestion(s: { volume: number | null; intent: number; competitorPresence: number }) {
  const parts = { volume: volumeNorm(s.volume), intent: s.intent, competitor: 1 + s.competitorPresence };
  // Unknown volume (LLM-generated) gets a neutral floor so it is not buried under zero.
  const score = (s.volume == null ? 0.25 : Math.max(0.05, parts.volume)) * parts.intent * parts.competitor;
  return { score: Math.round(score * 10_000) / 10_000, parts };
}

/** Merge near-duplicates (token-set Jaccard >= threshold), union sources, keep max volume and the longest wording. */
export function dedupe(cands: Candidate[], threshold = 0.8): Candidate[][] {
  const groups: { toks: string[]; items: Candidate[] }[] = [];
  for (const c of cands) {
    const text = c.text.trim();
    if (text.length < 8) continue;
    const toks = tokens(text);
    if (!toks.length) continue;
    const g = groups.find((x) => jaccard(x.toks, toks) >= threshold);
    if (g) g.items.push({ ...c, text }); else groups.push({ toks, items: [{ ...c, text }] });
  }
  return groups.map((g) => g.items);
}

/** Cluster label = the most frequent significant token pair/word among the group's topic or text. */
export function clusterLabel(text: string, topic?: string | null): string {
  if (topic?.trim()) return topic.trim().toLowerCase();
  const t = tokens(text);
  return t.slice(0, 2).join(' ') || 'general';
}

export function buildSuggestions(cands: Candidate[], competitors: string[], opts: { threshold?: number } = {}): Suggestion[] {
  return dedupe(cands, opts.threshold).map((items) => {
    const best = [...items].sort((a, b) => b.text.length - a.text.length)[0]!;
    const volumes = items.map((i) => i.volume).filter((v): v is number => typeof v === 'number');
    const volume = volumes.length ? Math.max(...volumes) : null;
    const first = <K extends 'topic' | 'persona' | 'funnel'>(k: K) => items.find((i) => i[k])?.[k] ?? null;
    const intent = intentScore(best.text);
    const cp = competitorPresence(best.text, competitors);
    const { score, parts } = scoreSuggestion({ volume, intent, competitorPresence: cp });
    return {
      text: best.text, normKey: normKey(best.text), clusterKey: clusterLabel(best.text, first('topic')),
      topic: first('topic'), persona: first('persona'), funnel: first('funnel'),
      sources: [...new Set(items.map((i) => i.source))], volume, intent, competitorPresence: cp, score, parts,
    };
  }).sort((a, b) => b.score - a.score);
}

/** GSC rows worth turning into prompts: informational/commercial, >=4 words or question-shaped. */
export const gscEligible = (q: string): boolean => {
  const w = q.trim().split(/\s+/).length;
  return (w >= 4 || QUESTION.test(q)) && w <= 30;
};
