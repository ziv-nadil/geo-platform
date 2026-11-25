/**
 * Per-response analysis: mentions (+adjudication), entity ranks, sentiment, citation
 * classification and the observation score. Deterministic given the judge's answers; with no
 * judge it falls back to rule-only analysis (rank from list order is then unknown).
 */
import type { Citation, EngineId } from '../engines/types';
import { classifySource, toDbSourceType, type ClassifyContext, type DbSourceType, type SourceCategory } from './citations';
import type { LlmJudge } from './judge';
import {
  adjudicationCall,
  domainCall,
  entitiesCall,
  parseAdjudication,
  parseDomainCategory,
  parseEntities,
  parseSentiment,
  sentencesAround,
  sentimentCall,
  tryJudge,
  EXTRACTOR_VERSION,
  type EntityRole,
  type ExtractedEntity,
  type SentimentResult,
} from './llm-tasks';
import {
  applyAdjudication,
  contextFor,
  detectMentions,
  summarizeMentions,
  DETECTOR_VERSION,
  type AdjudicationDecision,
  type TrackedEntity,
} from './mentions';
import { observationScore, positionScore, METRIC_VERSION } from './scoring';
import { normalizeTerm } from './text';

export const ANALYSIS_VERSION = `${DETECTOR_VERSION}+${EXTRACTOR_VERSION}+${METRIC_VERSION}`;

const MAX_ADJUDICATIONS = 8;
const MAX_DOMAIN_CLASSIFICATIONS = 10;

export interface AnalyzedMention {
  entityId: string;
  entityKind: 'brand' | 'competitor';
  entityName: string;
  surface: string;
  rank: number | null;
  firstOffset: number;
  mentionCount: number;
  matchType: string;
  confidence: number;
  role: EntityRole | null;
  sentiment: SentimentResult | null;
  snippet: string;
}

export interface AnalyzedCitation extends Citation {
  category: SourceCategory;
  sourceType: DbSourceType;
  competitorId?: string;
  isOwned: boolean;
}

export interface AnalysisOutput {
  brandMentioned: boolean;
  mentions: AnalyzedMention[];
  citations: AnalyzedCitation[];
  /** Names the engine mentioned that are neither the brand nor a tracked competitor. */
  candidates: Array<{ name: string; rank: number | null; role: EntityRole }>;
  position: number;
  ownedCited: boolean;
  score: number;
  /** Domains classified by the LLM in this call, for the source_domains cache. */
  newDomainCategories: Array<{ domain: string; category: SourceCategory; confidence: number }>;
  judgeCostUsd: number;
  analysisVersion: string;
}

export interface AnalyzeInput {
  engine: EngineId;
  text: string;
  citations: readonly Citation[];
  brand: TrackedEntity;
  competitors: readonly TrackedEntity[];
  classify?: Pick<ClassifyContext, 'cached'>;
  judge: LlmJudge | null;
}

function matchesEntity(name: string, e: TrackedEntity): boolean {
  const n = normalizeTerm(name);
  if (!n) return false;
  const aliases = [e.name, ...e.aliases].map(normalizeTerm).filter(Boolean);
  return aliases.some((a) => n === a || n.startsWith(`${a} `) || a.startsWith(`${n} `));
}

function snippetAround(text: string, start: number, end: number): string {
  const s = Math.max(0, start - 120);
  const e = Math.min(text.length, end + 120);
  return `${s > 0 ? '…' : ''}${text.slice(s, e).trim()}${e < text.length ? '…' : ''}`;
}

export async function analyzeResponse(input: AnalyzeInput): Promise<AnalysisOutput> {
  const { text, brand, competitors, judge } = input;
  const cost = { usd: 0 };
  const entities = [brand, ...competitors];
  const byId = new Map(entities.map((e) => [e.id, e]));

  // 1. Mentions + adjudication
  const raw = detectMentions(text, entities);
  const decisions = new Map<number, AdjudicationDecision>();
  let budget = MAX_ADJUDICATIONS;
  for (let i = 0; i < raw.length && budget > 0; i++) {
    const s = raw[i];
    if (!s.needsAdjudication) continue;
    budget--;
    const e = byId.get(s.entityId)!;
    const ctx = [e.domains[0], ...(e.contextTerms ?? []).slice(0, 3)].filter(Boolean).join(', ');
    const d = await tryJudge(judge, adjudicationCall(e.name, ctx, s.surface, contextFor(text, s)), parseAdjudication, cost);
    if (d) decisions.set(i, d);
  }
  const accepted = applyAdjudication(raw, decisions);
  const summaries = summarizeMentions(text, accepted);

  // 2. Entity extraction (rank + role + unknown entities)
  let extracted: { isList: boolean; entities: ExtractedEntity[] } | null = null;
  if (text.trim()) extracted = await tryJudge(judge, entitiesCall(text), parseEntities, cost);
  const extractedFor = (e: TrackedEntity) => extracted?.entities.find((x) => matchesEntity(x.name, e)) ?? null;
  const candidates = (extracted?.entities ?? [])
    .filter((x) => x.role !== 'source_only' && !entities.some((e) => matchesEntity(x.name, e)))
    .map((x) => ({ name: x.name, rank: extracted!.isList ? x.rank : null, role: x.role }));

  // 3. Sentiment for the brand only (competitor sentiment is not part of the score)
  const brandSummary = summaries.find((s) => s.entityId === brand.id) ?? null;
  let sentiment: SentimentResult | null = null;
  if (brandSummary) {
    const sentences = sentencesAround(text, brandSummary.spans);
    sentiment = await tryJudge(judge, sentimentCall(brand.name, sentences), parseSentiment, cost);
  }

  // 4. Citations
  const classifyCtx: ClassifyContext = {
    ownedDomains: brand.domains,
    competitorDomains: competitors.map((c) => ({ competitorId: c.id, domains: c.domains })),
    cached: input.classify?.cached,
  };
  const newDomainCategories: AnalysisOutput['newDomainCategories'] = [];
  const llmDone = new Map<string, SourceCategory>();
  const citations: AnalyzedCitation[] = [];
  for (const c of input.citations) {
    let cls = classifySource(c.urlCanonical, c.domain, classifyCtx);
    if (cls.source === 'unknown') {
      const prior = llmDone.get(c.domain);
      if (prior) cls = { category: prior, source: 'cache' };
      else if (newDomainCategories.length < MAX_DOMAIN_CLASSIFICATIONS) {
        const r = await tryJudge(judge, domainCall(c.domain, c.title, c.snippet), parseDomainCategory, cost);
        if (r) {
          llmDone.set(c.domain, r.category);
          newDomainCategories.push({ domain: c.domain, ...r });
          cls = { category: r.category, source: 'cache' };
        }
      }
    }
    citations.push({
      ...c,
      category: cls.category,
      sourceType: toDbSourceType(cls.category),
      competitorId: cls.competitorId,
      isOwned: cls.category === 'owned',
    });
  }
  const ownedCited = citations.some((c) => c.cited && c.isOwned);

  // 5. Mentions out
  const mentions: AnalyzedMention[] = summaries.map((s) => {
    const x = extractedFor(byId.get(s.entityId)!);
    return {
      entityId: s.entityId,
      entityKind: s.entityKind,
      entityName: s.entityName,
      surface: s.surface,
      rank: extracted?.isList && x?.rank ? x.rank : null,
      firstOffset: Math.round(s.firstOffset * 10000) / 10000,
      mentionCount: s.mentionCount,
      matchType: s.matchType,
      confidence: s.confidence,
      role: x?.role ?? null,
      sentiment: s.entityId === brand.id ? sentiment : null,
      snippet: snippetAround(text, s.spans[0].start, s.spans[0].end),
    };
  });

  const brandMention = mentions.find((m) => m.entityId === brand.id);
  const position = positionScore(!!brandMention, brandMention?.rank, brandMention?.firstOffset);
  const score = observationScore({ mentioned: !!brandMention, pos: position, ownedCited, sentiment: sentiment?.score });

  return {
    brandMentioned: !!brandMention,
    mentions,
    citations,
    candidates,
    position: Math.round(position * 10000) / 10000,
    ownedCited,
    score: Math.round(score * 10000) / 10000,
    newDomainCategories,
    judgeCostUsd: Math.round(cost.usd * 1e6) / 1e6,
    analysisVersion: ANALYSIS_VERSION,
  };
}
