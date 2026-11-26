import 'server-only';
import { claudeJson } from './llm';
import type { ClientContext } from './context';
import type { ResearchResult } from './research';

const arr = { type: 'array', items: { type: 'string' } } as const;
export const BRIEF_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['search_intent', 'angle', 'how_we_beat_them', 'competitor_weaknesses', 'must_cover', 'structure', 'tables', 'stats_to_use', 'faq_questions', 'brand_proof_points', 'avoid'],
  properties: {
    search_intent: { type: 'string' }, angle: { type: 'string' }, how_we_beat_them: arr, competitor_weaknesses: arr, must_cover: arr,
    structure: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'purpose'], properties: { heading: { type: 'string' }, purpose: { type: 'string' } } } },
    tables: arr, stats_to_use: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['stat', 'source_url'], properties: { stat: { type: 'string' }, source_url: { type: 'string' } } } },
    faq_questions: arr, brand_proof_points: arr, avoid: arr,
  },
} as const;
export interface Brief { search_intent: string; angle: string; how_we_beat_them: string[]; competitor_weaknesses: string[]; must_cover: string[]; structure: { heading: string; purpose: string }[]; tables: string[]; stats_to_use: { stat: string; source_url: string }[]; faq_questions: string[]; brand_proof_points: string[]; avoid: string[] }

export async function writeBrief(o: { title: string; promptText: string; targetWords: number; ctx: ClientContext; research: ResearchResult; gapLabel: string }) {
  const s = o.research.summary;
  const system =
    'You are a GEO content strategist writing a "how we beat them" brief for an article. The goal is to be cited by AI engines for the target prompt. ' +
    'Use the research benchmarks: match table stakes (tables, FAQ, schema, freshness) and beat the cited pages on depth, specificity, evidence and clarity. ' +
    'Stats must come from the research pages, the brand claims, or well-known official sources, each with a real source URL. Never invent numbers. Respect the brand say/do-not-say lists.';
  const user = JSON.stringify({
    title: o.title, target_prompt: o.promptText, gap: o.gapLabel, target_words: o.targetWords,
    brand: { name: o.ctx.brand.name, claims_and_proof: o.ctx.brand.messaging, say: o.ctx.brand.say, dont_say: o.ctx.brand.dontSay, competitors: o.ctx.brand.competitors, personas: o.ctx.personas },
    benchmarks: s,
    competing_pages: o.research.sources.filter((x) => x.structure).map((x) => ({ url: x.url, kind: x.kind, rank: x.rank, ai_citations: x.citations, words: x.structure!.words, h2: x.structure!.h2, tables: x.structure!.tables, faq: x.structure!.faq, stats: x.structure!.stats, schema: x.structure!.schemaTypes, age_days: x.structure!.ageDays, headings: x.structure!.headings.slice(0, 10) })),
    research_notes: o.research.notes,
  });
  const r = await claudeJson({ system, user, schema: BRIEF_SCHEMA as unknown as Record<string, unknown>, maxTokens: 6000, effort: 'medium', provenance: [{ orgId: o.ctx.brand.orgId, source: 'brand_context+research' }] });
  return r.status === 'ok' ? ({ status: 'ok', brief: r.data as Brief } as const) : r;
}
