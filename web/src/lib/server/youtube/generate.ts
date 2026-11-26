import 'server-only';
import type { ArticleDoc } from '../../content/article';
import { claudeJson } from '../content-pipeline/llm';
import type { ClientContext } from '../content-pipeline/context';
import { buildChapters, buildDescription, cleanTags, cleanTitle, CATEGORY_EDUCATION, type VideoMetadata } from '../../youtube/metadata';
import { fixScript, parseScript, SCRIPT_SCHEMA, timeline, type VideoScript } from '../../youtube/script';

const str = { type: 'string' } as const;
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['script', 'title_variants', 'tags', 'takeaways', 'playlist', 'thumbnail_prompt', 'thumbnail_text', 'answer_line'],
  properties: {
    script: SCRIPT_SCHEMA,
    title_variants: { type: 'array', items: str }, tags: { type: 'array', items: str }, takeaways: { type: 'array', items: str },
    playlist: str, thumbnail_prompt: str, thumbnail_text: str, answer_line: str,
  },
} as const;

export function videoSystemPrompt(brand: string, persona: string): string {
  return [
    `You write short educational videos for ${brand}'s separate expert-education YouTube channel. The presenter is "${persona}", a branded AI presenter for ${brand}'s team, not a real person.`,
    'Hard rules: never claim personal credentials, years of experience, job titles, degrees, customers or results unless the article or brand claims state them. Do not say "I have" or "in my career". "We" means the brand team. The voice is read by an AI, so do not pretend to be human.',
    'Script: 190 to 260 spoken words total (60 to 120 seconds). hook = one or two sentences that state the question the viewer has. 5 or 6 scenes, each 25 to 50 words, one idea per scene, short speakable sentences (under 22 words), contractions are fine, plain human tone, no hype. outro = one sentence pointing to the full guide linked in the description (do not read a URL aloud).',
    'Facts only from the article. Never invent numbers. A scene may show a chart only if its chart_id is one of the article charts, else chart_id is "". Every scene needs an image_prompt (clean editorial illustration, no text, no logos, no real people) unless it uses a chart (then ""). on_screen is a 2 to 5 word chapter label.',
    'Style: never use em dashes, en dashes or " -- ". No emoji. Avoid "delve", "game-changer", "in today\'s fast-paced world", "dive in", "unlock".',
    'Metadata: title_variants = 3 titles under 70 characters, each phrased as the question or promise the article answers, brand name not required. tags = 8 to 12 search phrases people type, lower case. takeaways = 3 to 5 short factual bullet lines. playlist = a 2 to 4 word topic playlist name. thumbnail_prompt = a bold simple illustration, no text. thumbnail_text = at most 4 words. answer_line = one sentence of at most 140 characters that answers the question directly (it opens the description).',
  ].join('\n');
}

export const articleBlogUrl = (i: { published_url?: string | null; cms_post_url?: string | null; target_url?: string | null }) => i.published_url || i.cms_post_url || i.target_url || '';

function digest(a: ArticleDoc): string {
  const secs = a.sections.slice(0, 8).map((s) => `## ${s.heading}\n${s.body.slice(0, 700)}`).join('\n\n');
  const charts = a.charts.map((c) => `chart ${c.id}: ${c.title} (${c.unit}) ${c.points.map((p) => `${p.label}=${p.value}`).join(', ')}`).join('\n');
  return [`Title: ${a.title}`, `Direct answer: ${a.directAnswer}`, secs, charts && `Charts available:\n${charts}`, `FAQ: ${a.faq.slice(0, 4).map((f) => f.question).join(' | ')}`].filter(Boolean).join('\n\n');
}

export type GenResult =
  | { status: 'ok'; script: VideoScript; meta: VideoMetadata; usage: { input: number; output: number } }
  | { status: 'not_configured'; missing: string[] } | { status: 'error'; message: string };

export async function generateVideoPlan(o: { article: ArticleDoc; blogUrl: string; ctx: ClientContext; persona: string; language?: string }): Promise<GenResult> {
  const brand = o.ctx.brand.name;
  const say = o.ctx.brand.say.length ? `Say: ${o.ctx.brand.say.slice(0, 15).join('; ')}` : '';
  const dont = o.ctx.brand.dontSay.length ? `Never say: ${o.ctx.brand.dontSay.slice(0, 15).map((d) => d.term).join('; ')}` : '';
  const r = await claudeJson({ system: videoSystemPrompt(brand, o.persona), user: [`Brand: ${brand}`, say, dont, '', digest(o.article)].filter(Boolean).join('\n'), schema: SCHEMA as unknown as Record<string, unknown>, maxTokens: 6000, effort: 'medium', provenance: [{ orgId: o.ctx.brand.orgId, source: 'brand_context+article' }] });
  if (r.status !== 'ok') return r;
  const d = r.data as Record<string, unknown>;
  const script0 = parseScript(d.script, o.article.charts.map((c) => c.id));
  if (!script0) return { status: 'error', message: 'The model returned an unusable script. Try again.' };
  const script = fixScript(script0);
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').slice(0, n);
  const titles = strs(d.title_variants, 3).map(cleanTitle).filter(Boolean);
  if (!titles.length) titles.push(cleanTitle(o.article.title));
  const t = timeline(script);
  const chapters = buildChapters(t.sceneBounds, script.scenes.map((s) => s.onScreen), t.total);
  const takeaways = strs(d.takeaways, 5);
  const tags = cleanTags([...strs(d.tags, 14), ...o.ctx.brand.name.split(/\s+/).slice(0, 1)]);
  const answer = (typeof d.answer_line === 'string' && d.answer_line.trim()) || o.article.directAnswer.slice(0, 140);
  const playlist = (typeof d.playlist === 'string' && d.playlist.trim()) || 'Guides';
  const meta: VideoMetadata = {
    title: titles[0], titleVariants: titles, tags, categoryId: CATEGORY_EDUCATION, playlist: playlist.slice(0, 60), chapters, language: o.language ?? 'en',
    thumbnailPrompt: typeof d.thumbnail_prompt === 'string' ? d.thumbnail_prompt.slice(0, 400) : '', thumbnailText: typeof d.thumbnail_text === 'string' ? d.thumbnail_text.slice(0, 30) : '',
    containsSyntheticMedia: true, blogUrl: o.blogUrl,
    description: buildDescription({ answer, blogUrl: o.blogUrl || 'https://invalid.local', blogTitle: o.article.title, chapters, takeaways, sources: o.article.citations, brandName: brand, personaName: o.persona, hashtags: tags.slice(0, 3) }),
  };
  if (!o.blogUrl) meta.description = meta.description.replace(/https:\/\/invalid\.local\S*/g, '').replace(/\s+Full guide:\s*/, ' ');
  return { status: 'ok', script, meta, usage: r.usage };
}
