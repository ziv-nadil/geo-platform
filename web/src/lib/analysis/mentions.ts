/**
 * Brand/competitor mention detection (docs/research/ai-engine-methodology.md section 3.2):
 * exact alias match (unicode word boundaries) -> owned-domain match -> fuzzy (Jaro-Winkler /
 * Levenshtein >= 0.92 on capitalized tokens) -> ambiguity check (context cue within +-80 chars)
 * -> overlap dedupe. Fuzzy and ambiguous spans are flagged for the LLM adjudicator.
 */
import { escapeRegex, normalizeTerm, normalizeWithMap } from './text';
import { domainMatches, normalizeDomain, registrableDomain } from './url';

export const DETECTOR_VERSION = 'detector@1';

export interface TrackedEntity {
  id: string;
  kind: 'brand' | 'competitor';
  name: string;
  aliases: readonly string[];
  domains: readonly string[];
  /** Phrases that look like the brand but are not (e.g. "apple pie" for Apple). */
  negativeAliases?: readonly string[];
  /** Category/product words that disambiguate an ambiguous alias when nearby. */
  contextTerms?: readonly string[];
}

export type MatchType = 'exact' | 'domain' | 'fuzzy' | 'ambiguous' | 'llm';

export interface MentionSpan {
  entityId: string;
  entityKind: 'brand' | 'competitor';
  entityName: string;
  start: number;
  end: number;
  surface: string;
  matchType: MatchType;
  confidence: number;
  needsAdjudication: boolean;
}

/** Common English words that are also plausible brand names: matches need a context cue. */
export const COMMON_WORDS = new Set([
  'apple', 'amazon', 'notion', 'slack', 'zoom', 'square', 'stripe', 'target', 'shell', 'mercury', 'oracle',
  'monday', 'linear', 'drift', 'loom', 'box', 'gap', 'dove', 'tide', 'bolt', 'ring', 'nest', 'echo', 'jet',
  'spark', 'pulse', 'beacon', 'compass', 'anchor', 'atlas', 'summit', 'vertex', 'orbit', 'prism', 'harvest',
  'canvas', 'frame', 'figma', 'basecamp', 'buffer', 'segment', 'mixpanel', 'amplitude', 'gong', 'clear',
  'fresh', 'simple', 'smart', 'swift', 'rapid', 'scale', 'base', 'core', 'one', 'go', 'via', 'next', 'open',
  'sage', 'mint', 'chime', 'brex', 'ramp', 'gusto', 'rippling', 'lattice', 'asana', 'wrike', 'help', 'front',
]);

const FUZZY_THRESHOLD = 0.92;
const CONTEXT_WINDOW = 80;

// ---------------------------------------------------------------------------
// String similarity
// ---------------------------------------------------------------------------

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aM = new Array<boolean>(a.length).fill(false);
  const bM = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bM[j] || a[i] !== b[j]) continue;
      aM[i] = bM[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export function similarity(a: string, b: string): number {
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return Math.max(jaroWinkler(a, b), lev);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function isAmbiguousAlias(alias: string): boolean {
  return alias.length <= 3 || COMMON_WORDS.has(alias);
}

function aliasesOf(e: TrackedEntity): string[] {
  const all = [e.name, ...e.aliases].map(normalizeTerm).filter((a) => a.length >= 2);
  return [...new Set(all)].sort((a, b) => b.length - a.length);
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

const DOMAIN_RE = /\b(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?=[/\s)\],.;:!?'"]|$)/gi;

function hasContextCue(text: string, start: number, end: number, e: TrackedEntity, strongAliases: string[]): boolean {
  const lo = Math.max(0, start - CONTEXT_WINDOW);
  const hi = Math.min(text.length, end + CONTEXT_WINDOW);
  const window = normalizeTerm(text.slice(lo, start) + ' ' + text.slice(end, hi));
  const cues = [...(e.contextTerms ?? []).map(normalizeTerm), ...strongAliases, ...e.domains.map((d) => normalizeDomain(d))];
  if (cues.some((c) => c && new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(c)}(?![\\p{L}\\p{N}])`, 'u').test(window))) return true;
  // Proper-noun signal: capitalized in the original and not at a sentence start.
  const surface = text.slice(start, end);
  if (/^\p{Lu}/u.test(surface)) {
    const before = text.slice(Math.max(0, start - 3), start);
    const sentenceStart = start === 0 || /[.!?\n]\s*$|^\s*[-*\d.]+\s*$/.test(before) || /\n\s*$/.test(text.slice(0, start));
    if (!sentenceStart) return true;
  }
  return false;
}

function exactSpans(text: string, e: TrackedEntity): MentionSpan[] {
  const { norm, map } = normalizeWithMap(text);
  const aliases = aliasesOf(e);
  const strong = aliases.filter((a) => !isAmbiguousAlias(a));
  const negatives = (e.negativeAliases ?? []).map(normalizeTerm).filter(Boolean);
  const negRanges: Array<{ start: number; end: number }> = [];
  for (const n of negatives) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(n)}(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of norm.matchAll(re)) negRanges.push({ start: map[m.index!], end: map[m.index! + m[0].length - 1] + 1 });
  }
  const spans: MentionSpan[] = [];
  for (const alias of aliases) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(alias)}(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of norm.matchAll(re)) {
      const start = map[m.index!];
      const end = map[m.index! + m[0].length - 1] + 1;
      const span = { start, end };
      if (spans.some((s) => overlaps(s, span))) continue; // longer alias already matched here
      if (negRanges.some((r) => overlaps(r, span))) continue;
      const ambiguous = isAmbiguousAlias(alias) && !hasContextCue(text, start, end, e, strong);
      spans.push({
        entityId: e.id,
        entityKind: e.kind,
        entityName: e.name,
        start,
        end,
        surface: text.slice(start, end),
        matchType: ambiguous ? 'ambiguous' : 'exact',
        confidence: ambiguous ? 0.5 : isAmbiguousAlias(alias) ? 0.9 : 1,
        needsAdjudication: ambiguous,
      });
    }
  }
  return spans;
}

function domainSpans(text: string, e: TrackedEntity): MentionSpan[] {
  const owned = e.domains.map(normalizeDomain).filter(Boolean);
  if (!owned.length) return [];
  const spans: MentionSpan[] = [];
  for (const m of text.matchAll(DOMAIN_RE)) {
    const host = m[1].toLowerCase();
    const domain = registrableDomain(host);
    if (!domainMatches(domain, owned)) continue;
    const start = m.index! + m[0].indexOf(m[1]);
    spans.push({
      entityId: e.id,
      entityKind: e.kind,
      entityName: e.name,
      start,
      end: start + m[1].length,
      surface: m[1],
      matchType: 'domain',
      confidence: 1,
      needsAdjudication: false,
    });
  }
  return spans;
}

function fuzzySpans(text: string, e: TrackedEntity, taken: MentionSpan[]): MentionSpan[] {
  const aliases = aliasesOf(e).filter((a) => a.replace(/\s/g, '').length >= 6);
  if (!aliases.length) return [];
  const tokens = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'&.-]*/gu)].map((m) => ({
    start: m.index!,
    end: m.index! + m[0].replace(/[.'-]+$/, '').length,
  }));
  const spans: MentionSpan[] = [];
  for (const alias of aliases) {
    const n = alias.split(' ').length;
    for (let i = 0; i + n <= tokens.length; i++) {
      const start = tokens[i].start;
      const end = tokens[i + n - 1].end;
      if (!/^\p{Lu}/u.test(text[start])) continue; // brand-like tokens only
      const span = { start, end };
      if (taken.some((s) => overlaps(s, span)) || spans.some((s) => overlaps(s, span))) continue;
      const cand = normalizeTerm(text.slice(start, end));
      if (!cand || cand === alias || COMMON_WORDS.has(cand)) continue;
      if (Math.abs(cand.length - alias.length) > Math.max(2, alias.length * 0.25)) continue;
      const score = similarity(cand, alias);
      if (score < FUZZY_THRESHOLD) continue;
      spans.push({
        entityId: e.id,
        entityKind: e.kind,
        entityName: e.name,
        start,
        end,
        surface: text.slice(start, end),
        matchType: 'fuzzy',
        confidence: Math.round(score * 1000) / 1000,
        needsAdjudication: true,
      });
    }
  }
  return spans;
}

/** Overlapping spans of different entities: keep the longer, then the more confident. */
export function dedupeOverlaps(spans: MentionSpan[]): MentionSpan[] {
  const sorted = [...spans].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || b.confidence - a.confidence || a.start - b.start,
  );
  const kept: MentionSpan[] = [];
  for (const s of sorted) {
    const clash = kept.find((k) => overlaps(k, s));
    if (!clash) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function detectMentions(text: string, entities: readonly TrackedEntity[]): MentionSpan[] {
  if (!text) return [];
  const all: MentionSpan[] = [];
  for (const e of entities) {
    // Domain spans win over alias hits inside a hostname ("acmecrm" in docs.acmecrm.com).
    const dom = domainSpans(text, e);
    const exact = exactSpans(text, e).filter((x) => !dom.some((d) => overlaps(x, d)));
    const fuzzy = fuzzySpans(text, e, [...exact, ...dom]);
    all.push(...exact, ...dom, ...fuzzy);
  }
  return dedupeOverlaps(all);
}

// ---------------------------------------------------------------------------
// Adjudication
// ---------------------------------------------------------------------------

export interface AdjudicationDecision {
  isBrand: boolean;
  confidence: number;
}

/**
 * Apply LLM decisions (keyed by span index in `spans`). Without a decision, fall back to a
 * conservative rule: fuzzy >= 0.95 accepted, ambiguous rejected.
 */
export function applyAdjudication(
  spans: readonly MentionSpan[],
  decisions: ReadonlyMap<number, AdjudicationDecision> = new Map(),
): MentionSpan[] {
  const out: MentionSpan[] = [];
  spans.forEach((s, i) => {
    if (!s.needsAdjudication) return out.push(s);
    const d = decisions.get(i);
    if (d) {
      if (d.isBrand && d.confidence >= 0.5) out.push({ ...s, matchType: 'llm', confidence: d.confidence, needsAdjudication: false });
      return;
    }
    if (s.matchType === 'fuzzy' && s.confidence >= 0.95) out.push({ ...s, needsAdjudication: false });
  });
  return out;
}

export function contextFor(text: string, s: { start: number; end: number }, radius = 200): string {
  return text.slice(Math.max(0, s.start - radius), Math.min(text.length, s.end + radius));
}

export interface EntityMentionSummary {
  entityId: string;
  entityKind: 'brand' | 'competitor';
  entityName: string;
  mentionCount: number;
  firstStart: number;
  firstOffset: number; // first_span.start / len(text), in [0,1]
  surface: string;
  matchType: MatchType;
  confidence: number;
  spans: MentionSpan[];
}

/** Collapse accepted spans to one summary per entity, ordered by first appearance. */
export function summarizeMentions(text: string, spans: readonly MentionSpan[]): EntityMentionSummary[] {
  const by = new Map<string, MentionSpan[]>();
  for (const s of spans) {
    if (s.needsAdjudication) continue;
    const arr = by.get(s.entityId) ?? [];
    arr.push(s);
    by.set(s.entityId, arr);
  }
  const out: EntityMentionSummary[] = [];
  for (const arr of by.values()) {
    arr.sort((a, b) => a.start - b.start);
    const first = arr[0];
    const best = arr.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    out.push({
      entityId: first.entityId,
      entityKind: first.entityKind,
      entityName: first.entityName,
      mentionCount: arr.length,
      firstStart: first.start,
      firstOffset: text.length ? first.start / text.length : 0,
      surface: first.surface,
      matchType: best.matchType,
      confidence: best.confidence,
      spans: arr,
    });
  }
  return out.sort((a, b) => a.firstStart - b.firstStart);
}
