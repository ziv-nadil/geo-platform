import 'server-only';
import { ARTICLE_SCHEMA, articleWordCount, lintArticle, parseArticle, type ArticleDoc } from '../../content/article';
import type { LintChanges } from '../../content/lint';
import { claudeJson, CONTENT_MODEL } from './llm';
import type { ClientContext } from './context';
import type { Brief } from './brief';
import type { ResearchResult } from './research';

export const DEFAULT_WORDS = 1800;

export function articleSystemPrompt(brand: string): string {
  return [
    `You write long-form articles that ${brand} publishes on its own site and that AI engines should cite. Write like a knowledgeable person, not a content mill.`,
    'GEO structure: (1) direct_answer: a 40-70 word answer to the target prompt, placed first. (2) Clear H2 sections (heading) with H3 subsections where useful. (3) At least one comparison table with real columns and factual cells. (4) Concrete numbers, each tied to a source in citations. (5) 5-8 FAQ entries that answer real follow-up questions in 40-80 words each. (6) item_list when the article ranks or lists products or steps, otherwise leave items empty. (7) citations with real URLs only, from the brief, research pages or official sites; leave a stat out rather than inventing it.',
    'Charts: only add a chart when you have 3+ real numbers with one source URL for all of them; put the id in the section chart_id. Otherwise charts is [] and chart_id is "".',
    `Truth: claims about ${brand} must come from the brand context and its claims or proof points. Credit competitors fairly. Mark uncertain details as "check current pricing". Disclose that the page is published by ${brand} where you compare products.`,
    'Voice: follow the say / do-not-say lists and tone. Plain, specific sentences. Mix short and long sentences. Never use em dashes, en dashes as pauses, emoji, or filler such as "delve", "in today\'s fast-paced world", "it\'s worth noting", "game-changer", "leverage", "seamless".',
    'Length: hit the target word count within about 10 percent, counting direct answer, section bodies, tables and FAQ. Section body is plain paragraphs separated by blank lines, no markdown headings inside.',
    'hero_prompt and each image_prompt describe a clean editorial illustration with no text, logos or people. Use image_prompt on at most 2 sections, "" elsewhere.',
  ].join('\n');
}

export type CopyResult =
  | { status: 'ok'; doc: ArticleDoc; words: number; changes: LintChanges; model: string; usage: { input: number; output: number } }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; message: string };

export async function writeArticle(o: { title: string; promptText: string; targetWords: number; ctx: ClientContext; brief: Brief; research: ResearchResult; gapLabel: string; siteDomain: string | null }): Promise<CopyResult> {
  const system = articleSystemPrompt(o.ctx.brand.name);
  const base = {
    task: 'Write the full article.', title: o.title, target_prompt: o.promptText, target_words: o.targetWords, gap: o.gapLabel, brief: o.brief,
    brand: { name: o.ctx.brand.name, website: o.siteDomain, tagline: o.ctx.brand.tagline, description: o.ctx.brand.description, say: o.ctx.brand.say, dont_say: o.ctx.brand.dontSay, messaging_claims_proof_points: o.ctx.brand.messaging, tone: o.ctx.brand.tone, style: o.ctx.kitStyle, value_props: o.ctx.profile.valueProps, differentiators: o.ctx.profile.differentiators, products: o.ctx.profile.products, competitors: o.ctx.brand.competitors },
    personas: o.ctx.personas, client_documents: o.ctx.docs,
    research_sources: o.research.sources.filter((s) => s.structure).map((s) => ({ url: s.url, title: s.title })),
  };
  const usage = { input: 0, output: 0 };
  let feedback = '';
  let best: ArticleDoc | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await claudeJson({ system, user: JSON.stringify(feedback ? { ...base, revision_note: feedback } : base), schema: ARTICLE_SCHEMA as unknown as Record<string, unknown>, maxTokens: Math.min(30_000, Math.round(o.targetWords * 4 + 4000)), effort: 'medium', provenance: [{ orgId: o.ctx.brand.orgId, source: 'brand_context+brief+research' }] });
    if (r.status !== 'ok') return best ? finish(best, usage) : r;
    usage.input += r.usage.input; usage.output += r.usage.output;
    const doc = parseArticle(r.data);
    if (!doc) { feedback = 'The previous draft was unusable. Return a complete article with a direct_answer and at least 3 sections.'; continue; }
    best = doc;
    const words = articleWordCount(doc);
    if (words >= o.targetWords * 0.8) break;
    feedback = `The previous draft had ${words} words; the target is ${o.targetWords}. Expand sections with specifics, examples and numbers (not padding) to reach the target.`;
  }
  return best ? finish(best, usage) : { status: 'error', message: 'The model returned an unusable draft. Try again.' };

  function finish(doc: ArticleDoc, u: { input: number; output: number }): CopyResult {
    const { doc: clean, changes } = lintArticle(doc);
    return { status: 'ok', doc: clean, words: articleWordCount(clean), changes, model: CONTENT_MODEL, usage: u };
  }
}
