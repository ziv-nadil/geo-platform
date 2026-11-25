/**
 * Prompts, JSON schemas and validating parsers for the judge tasks. Parsers are pure and clamp
 * everything, so a malformed judge answer degrades to "unknown" instead of corrupting metrics.
 */
import { SOURCE_CATEGORIES, type SourceCategory } from './citations';
import type { LlmJudge } from './judge';
import { sentenceRanges } from './text';

export const RUBRIC_VERSION = 'sentiment-rubric@1';
export const EXTRACTOR_VERSION = 'entities@1';

const clamp = (n: unknown, lo: number, hi: number, dflt: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

// ---------------------------------------------------------------------------
// Adjudication of ambiguous/fuzzy mentions
// ---------------------------------------------------------------------------

export const ADJUDICATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_brand', 'confidence'],
  properties: { is_brand: { type: 'boolean' }, confidence: { type: 'number' } },
};

export function adjudicationCall(entityName: string, entityContext: string, surface: string, context: string) {
  return {
    task: 'adjudicate_mention',
    system:
      'You decide whether a phrase in an AI-generated answer refers to a specific company/brand. ' +
      'Answer only from the passage. confidence is 0..1.',
    user:
      `Brand: ${entityName}${entityContext ? ` (${entityContext})` : ''}\n` +
      `Phrase: "${surface}"\nPassage:\n"""${context}"""\n` +
      'Does the phrase refer to this brand (not a common word, a different company, or a misspelling of something else)?',
    schema: ADJUDICATE_SCHEMA,
    maxTokens: 200,
  };
}

export function parseAdjudication(data: unknown): { isBrand: boolean; confidence: number } {
  const d = (data ?? {}) as Record<string, unknown>;
  return { isBrand: d.is_brand === true, confidence: clamp(d.confidence, 0, 1, 0) };
}

// ---------------------------------------------------------------------------
// Entity + rank extraction
// ---------------------------------------------------------------------------

export type EntityRole = 'recommended' | 'neutral' | 'negative' | 'source_only';
export interface ExtractedEntity {
  name: string;
  rank: number | null;
  role: EntityRole;
}

export const ENTITIES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_list', 'entities'],
  properties: {
    is_list: { type: 'boolean' },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rank', 'role'],
        properties: {
          name: { type: 'string' },
          rank: { type: ['integer', 'null'] },
          role: { type: 'string', enum: ['recommended', 'neutral', 'negative', 'source_only'] },
        },
      },
    },
  },
};

export function entitiesCall(answer: string) {
  return {
    task: 'extract_entities',
    system:
      'Extract every company, brand or product organization named in the answer, in order of first appearance. ' +
      'If the answer ranks or lists options, rank = position in that list (1 = first recommended); otherwise rank = null ' +
      'and is_list = false. role: recommended (presented as a good choice), neutral, negative (warned against), ' +
      'source_only (only cited as a source). Use the canonical brand name.',
    user: `Answer:\n"""${answer.slice(0, 12_000)}"""`,
    schema: ENTITIES_SCHEMA,
    maxTokens: 1500,
  };
}

export function parseEntities(data: unknown): { isList: boolean; entities: ExtractedEntity[] } {
  const d = (data ?? {}) as Record<string, unknown>;
  const roles = new Set(['recommended', 'neutral', 'negative', 'source_only']);
  const seen = new Set<string>();
  const entities: ExtractedEntity[] = [];
  for (const raw of Array.isArray(d.entities) ? d.entities : []) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const name = str(e.name, 120).trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const rank = typeof e.rank === 'number' && Number.isInteger(e.rank) && e.rank >= 1 && e.rank <= 100 ? e.rank : null;
    entities.push({ name, rank, role: (roles.has(e.role as string) ? e.role : 'neutral') as EntityRole });
  }
  return { isList: d.is_list === true, entities };
}

// ---------------------------------------------------------------------------
// Sentiment (rubric verbatim from methodology section 3.6)
// ---------------------------------------------------------------------------

export const SENTIMENT_RUBRIC = `Score the brand's portrayal, not the writing tone.
+1.0 clear recommendation / "best", "top choice", strong endorsement
+0.5 favorable, lists real advantages, no notable negatives
 0.0 neutral/factual mention, or balanced pros and cons of equal weight
-0.5 unfavorable: notable drawbacks, "may not be ideal", recommends alternatives instead
-1.0 explicit warning, accusation (fraud, safety, legal), "avoid"
Return: label(positive|neutral|negative|mixed), score(-1..1), aspects[{name: price|quality|support|trust|features|ux, polarity}], evidence_quote (≤200 chars), confidence(0..1)
If the brand is only listed as a source/citation and not described, label "neutral" with score 0 and aspects [].`;

export const SENTIMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'score', 'aspects', 'evidence_quote', 'confidence'],
  properties: {
    label: { type: 'string', enum: ['positive', 'neutral', 'negative', 'mixed'] },
    score: { type: 'number' },
    aspects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'polarity'],
        properties: {
          name: { type: 'string', enum: ['price', 'quality', 'support', 'trust', 'features', 'ux'] },
          polarity: { type: 'integer', enum: [-1, 0, 1] },
        },
      },
    },
    evidence_quote: { type: 'string' },
    confidence: { type: 'number' },
  },
};

export interface SentimentResult {
  label: 'positive' | 'neutral' | 'negative' | 'mixed';
  score: number;
  aspects: Array<{ name: string; polarity: -1 | 0 | 1 }>;
  evidenceQuote: string;
  confidence: number;
  rubricVersion: string;
}

/** Sentences containing any span, plus one sentence of context either side (deduped, in order). */
export function sentencesAround(text: string, spans: ReadonlyArray<{ start: number; end: number }>): string[] {
  const ranges = sentenceRanges(text);
  const keep = new Set<number>();
  ranges.forEach(([s, e], i) => {
    if (spans.some((sp) => sp.start < e && s < sp.end)) {
      keep.add(i - 1);
      keep.add(i);
      keep.add(i + 1);
    }
  });
  return [...keep]
    .filter((i) => i >= 0 && i < ranges.length)
    .sort((a, b) => a - b)
    .map((i) => text.slice(ranges[i][0], ranges[i][1]).trim())
    .filter(Boolean);
}

export function sentimentCall(brandName: string, sentences: readonly string[]) {
  return {
    task: 'judge_sentiment',
    system: `You rate how an AI answer portrays a brand.\n${SENTIMENT_RUBRIC}`,
    user: `Brand: ${brandName}\nExcerpt:\n"""${sentences.join('\n').slice(0, 6000)}"""`,
    schema: SENTIMENT_SCHEMA,
    maxTokens: 500,
  };
}

export function parseSentiment(data: unknown): SentimentResult {
  const d = (data ?? {}) as Record<string, unknown>;
  const labels = new Set(['positive', 'neutral', 'negative', 'mixed']);
  const aspectNames = new Set(['price', 'quality', 'support', 'trust', 'features', 'ux']);
  const aspects = (Array.isArray(d.aspects) ? d.aspects : [])
    .map((a) => (a ?? {}) as Record<string, unknown>)
    .filter((a) => aspectNames.has(a.name as string))
    .map((a) => ({ name: a.name as string, polarity: (Math.sign(Number(a.polarity) || 0) as -1 | 0 | 1) }));
  return {
    label: (labels.has(d.label as string) ? d.label : 'neutral') as SentimentResult['label'],
    score: Math.round(clamp(d.score, -1, 1, 0) * 1000) / 1000,
    aspects,
    evidenceQuote: str(d.evidence_quote, 200),
    confidence: clamp(d.confidence, 0, 1, 0),
    rubricVersion: RUBRIC_VERSION,
  };
}

/** DB enum public.sentiment has no 'mixed': mixed maps to neutral (score keeps the nuance). */
export function toDbSentiment(label: SentimentResult['label']): 'positive' | 'neutral' | 'negative' {
  return label === 'mixed' ? 'neutral' : label;
}

// ---------------------------------------------------------------------------
// Domain classification (unknown domains only; cached in source_domains)
// ---------------------------------------------------------------------------

const LLM_CATEGORIES = SOURCE_CATEGORIES.filter((c) => c !== 'owned' && c !== 'competitor');

export const DOMAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'confidence'],
  properties: { category: { type: 'string', enum: LLM_CATEGORIES }, confidence: { type: 'number' } },
};

export function domainCall(domain: string, title?: string, snippet?: string) {
  return {
    task: 'classify_domain',
    system:
      'Classify a website by what kind of source it is. ugc_social = forums/social/user posts; video = video platforms; ' +
      'review_aggregator = review/comparison marketplaces; earned_media = news, magazines, trade press, independent blogs/analysts; ' +
      'reference = encyclopedias/dictionaries/standards; institutional = government, education, research bodies; ' +
      'marketplace_ecom = online stores; other = vendor/company sites and anything else.',
    user: `Domain: ${domain}\nTitle: ${title ?? ''}\nSnippet: ${(snippet ?? '').slice(0, 200)}`,
    schema: DOMAIN_SCHEMA,
    maxTokens: 100,
  };
}

export function parseDomainCategory(data: unknown): { category: SourceCategory; confidence: number } {
  const d = (data ?? {}) as Record<string, unknown>;
  const cat = (LLM_CATEGORIES as readonly string[]).includes(d.category as string) ? (d.category as SourceCategory) : 'other';
  return { category: cat, confidence: clamp(d.confidence, 0, 1, 0) };
}

/** Run a judge task; returns null on failure (analysis degrades, never throws). */
export async function tryJudge<T>(
  judge: LlmJudge | null,
  call: Parameters<LlmJudge['json']>[0],
  parse: (d: unknown) => T,
  cost: { usd: number },
): Promise<T | null> {
  if (!judge) return null;
  try {
    const { data, costUsd } = await judge.json(call);
    cost.usd += costUsd;
    return parse(data);
  } catch {
    return null;
  }
}
