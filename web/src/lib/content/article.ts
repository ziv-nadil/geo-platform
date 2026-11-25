/** GEO article model, LLM schema, validating parser, lint pass, renderers and JSON-LD (pure). */
import { lintText, type LintChanges } from './lint';
import { slugify } from '../content-gaps/listicle';

export interface ArticleTable { caption: string; columns: string[]; rows: string[][] }
export interface ArticleSection {
  heading: string; body: string; table: ArticleTable | null; chartId: string | null; imagePrompt: string | null;
  subsections: { heading: string; body: string }[];
}
export interface ChartSpec {
  id: string; title: string; unit: string; sourceUrl: string; sourceTitle: string;
  points: { label: string; value: number }[];
}
export interface ArticleDoc {
  title: string; slug: string; metaDescription: string; directAnswer: string;
  heroPrompt: string; heroAlt: string;
  sections: ArticleSection[];
  itemList: { name: string; items: { name: string; url: string | null; description: string }[] } | null;
  faq: { question: string; answer: string }[];
  charts: ChartSpec[];
  citations: { title: string; url: string }[];
}
export interface ImageRef { url: string; alt: string; /** Inline SVG markup used instead of <img> when the CMS cannot host SVG files. */ inline?: string }
export type AssetMap = Record<string, ImageRef>;

const str = { type: 'string' } as const;
const strs = { type: 'array', items: str } as const;
export const ARTICLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'slug', 'meta_description', 'direct_answer', 'hero_prompt', 'hero_alt', 'sections', 'item_list', 'faq', 'charts', 'citations'],
  properties: {
    title: str, slug: str, meta_description: str, direct_answer: str, hero_prompt: str, hero_alt: str,
    sections: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['heading', 'body', 'table', 'chart_id', 'image_prompt', 'subsections'],
      properties: {
        heading: str, body: str, chart_id: str, image_prompt: str,
        table: { type: 'object', additionalProperties: false, required: ['caption', 'columns', 'rows'],
          properties: { caption: str, columns: strs, rows: { type: 'array', items: strs } } },
        subsections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'body'], properties: { heading: str, body: str } } },
      } } },
    item_list: { type: 'object', additionalProperties: false, required: ['name', 'items'],
      properties: { name: str, items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'url', 'description'], properties: { name: str, url: str, description: str } } } } },
    faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'answer'], properties: { question: str, answer: str } } },
    charts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'unit', 'source_url', 'source_title', 'points'],
      properties: { id: str, title: str, unit: str, source_url: str, source_title: str,
        points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: str, value: { type: 'number' } } } } } } },
    citations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'url'], properties: { title: str, url: str } } },
  },
} as const;

const s = (v: unknown, max = 6000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = <T>(v: unknown, f: (x: unknown) => T | null, max = 50): T[] => (Array.isArray(v) ? v : []).slice(0, max).map(f).filter((x): x is T => x !== null);
const httpUrl = (v: unknown): string | null => { try { const u = new URL(s(v, 500)); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null; } catch { return null; } };

export const countWords = (t: string) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Clamp a model answer into an ArticleDoc. Charts survive only with a real source URL and >= 2 finite points. null when unusable. */
export function parseArticle(data: unknown): ArticleDoc | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const title = s(d.title, 200);
  const sections = arr<ArticleSection>(d.sections, (x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const heading = s(o.heading, 200), body = s(o.body);
    if (!heading || !body) return null;
    const t = (o.table ?? {}) as Record<string, unknown>;
    const columns = arr(t.columns, (c) => s(c, 80) || null, 8);
    const rows = arr(t.rows, (r) => (Array.isArray(r) ? columns.map((_, i) => s(r[i], 300)) : null), 30);
    return {
      heading, body, chartId: s(o.chart_id, 60) || null, imagePrompt: s(o.image_prompt, 400) || null,
      table: columns.length >= 2 && rows.length ? { caption: s(t.caption, 200), columns, rows } : null,
      subsections: arr(o.subsections, (y) => { const p = (y ?? {}) as Record<string, unknown>; const h = s(p.heading, 200), b = s(p.body); return h && b ? { heading: h, body: b } : null; }, 8),
    };
  }, 20);
  if (!title || sections.length < 3 || !s(d.direct_answer)) return null;
  const charts = arr<ChartSpec>(d.charts, (x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const sourceUrl = httpUrl(o.source_url);
    const points = arr(o.points, (p) => { const q = (p ?? {}) as Record<string, unknown>; const label = s(q.label, 60); return label && typeof q.value === 'number' && Number.isFinite(q.value) ? { label, value: q.value } : null; }, 12);
    const id = slugify(s(o.id, 60));
    return sourceUrl && points.length >= 2 && id ? { id, title: s(o.title, 160), unit: s(o.unit, 24), sourceUrl, sourceTitle: s(o.source_title, 200) || sourceUrl, points } : null;
  }, 6);
  const ids = new Set(charts.map((c) => c.id));
  for (const sec of sections) if (sec.chartId && !ids.has(slugify(sec.chartId))) sec.chartId = null; else if (sec.chartId) sec.chartId = slugify(sec.chartId);
  const il = (d.item_list ?? {}) as Record<string, unknown>;
  const items = arr(il.items, (x) => { const o = (x ?? {}) as Record<string, unknown>; const name = s(o.name, 160); return name ? { name, url: httpUrl(o.url), description: s(o.description, 400) } : null; }, 25);
  return {
    title, slug: slugify(s(d.slug, 100) || title), metaDescription: s(d.meta_description, 300), directAnswer: s(d.direct_answer, 1200),
    heroPrompt: s(d.hero_prompt, 500), heroAlt: s(d.hero_alt, 300) || title, sections, charts,
    itemList: items.length >= 3 ? { name: s(il.name, 200) || title, items } : null,
    faq: arr(d.faq, (q) => { const o = (q ?? {}) as Record<string, unknown>; const question = s(o.question, 300), answer = s(o.answer, 1500); return question && answer ? { question, answer } : null; }, 12),
    citations: arr(d.citations, (c) => { const o = (c ?? {}) as Record<string, unknown>; const url = httpUrl(o.url); return url ? { title: s(o.title, 200) || url, url } : null; }, 25),
  };
}

/** Run the human-style lint over every prose field. Returns the cleaned doc and the summed change counts. */
export function lintArticle(doc: ArticleDoc): { doc: ArticleDoc; changes: LintChanges } {
  const total: LintChanges = { emDash: 0, enDash: 0, filler: 0, emoji: 0, variety: 0 };
  const fix = (t: string) => { const r = lintText(t); for (const k of Object.keys(total) as (keyof LintChanges)[]) total[k] += r.changes[k]; return r.text; };
  const out: ArticleDoc = {
    ...doc,
    title: fix(doc.title), metaDescription: fix(doc.metaDescription), directAnswer: fix(doc.directAnswer), heroAlt: fix(doc.heroAlt),
    sections: doc.sections.map((x) => ({
      ...x, heading: fix(x.heading), body: fix(x.body),
      table: x.table ? { caption: fix(x.table.caption), columns: x.table.columns.map(fix), rows: x.table.rows.map((r) => r.map(fix)) } : null,
      subsections: x.subsections.map((y) => ({ heading: fix(y.heading), body: fix(y.body) })),
    })),
    itemList: doc.itemList ? { name: fix(doc.itemList.name), items: doc.itemList.items.map((i) => ({ ...i, name: fix(i.name), description: fix(i.description) })) } : null,
    faq: doc.faq.map((q) => ({ question: fix(q.question), answer: fix(q.answer) })),
    charts: doc.charts.map((c) => ({ ...c, title: fix(c.title) })),
  };
  return { doc: out, changes: total };
}

/** Words a reader sees (answer, sections, tables, FAQ). */
export function articleWordCount(doc: ArticleDoc): number {
  return countWords([doc.directAnswer, ...doc.sections.flatMap((x) => [x.heading, x.body, ...(x.table ? [...x.table.columns, ...x.table.rows.flat()] : []), ...x.subsections.flatMap((y) => [y.heading, y.body])]), ...doc.faq.flatMap((q) => [q.question, q.answer])].join(' '));
}

const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const h = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const para = (t: string) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

export function renderArticleMarkdown(doc: ArticleDoc, assets: AssetMap = {}): string {
  const out: string[] = [`# ${doc.title}`, ''];
  if (assets.hero) out.push(`![${assets.hero.alt}](${assets.hero.url})`, '');
  out.push(`**${doc.directAnswer}**`, '');
  doc.sections.forEach((x, i) => {
    out.push(`## ${x.heading}`, '', x.body, '');
    if (x.table) out.push(...(x.table.caption ? [`*${x.table.caption}*`, ''] : []), `| ${x.table.columns.map(esc).join(' | ')} |`, `| ${x.table.columns.map(() => '---').join(' | ')} |`, ...x.table.rows.map((r) => `| ${r.map(esc).join(' | ')} |`), '');
    const chart = x.chartId ? assets[`chart-${x.chartId}`] : null;
    if (chart) out.push(`![${chart.alt}](${chart.url})`, '');
    const ill = assets[`illustration-${i}`];
    if (ill) out.push(`![${ill.alt}](${ill.url})`, '');
    for (const y of x.subsections) out.push(`### ${y.heading}`, '', y.body, '');
  });
  if (doc.faq.length) out.push('## FAQ', '', ...doc.faq.flatMap((q) => [`### ${q.question}`, '', q.answer, '']));
  if (doc.citations.length) out.push('## Sources', '', ...doc.citations.map((c) => `- [${c.title}](${c.url})`), '');
  return out.join('\n');
}

export function renderArticleHtml(doc: ArticleDoc, assets: AssetMap = {}): string {
  const img = (r?: ImageRef) => (r?.inline ? `<figure role="img" aria-label="${h(r.alt)}">${r.inline}</figure>` : r ? `<figure><img src="${h(r.url)}" alt="${h(r.alt)}" loading="lazy"></figure>` : '');
  const o: string[] = [img(assets.hero), `<p><strong>${h(doc.directAnswer)}</strong></p>`];
  doc.sections.forEach((x, i) => {
    o.push(`<h2>${h(x.heading)}</h2>`, ...para(x.body).map((p) => `<p>${h(p)}</p>`));
    if (x.table) o.push(`<table>${x.table.caption ? `<caption>${h(x.table.caption)}</caption>` : ''}<thead><tr>${x.table.columns.map((c) => `<th>${h(c)}</th>`).join('')}</tr></thead><tbody>${x.table.rows.map((r) => `<tr>${r.map((v) => `<td>${h(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    o.push(img(x.chartId ? assets[`chart-${x.chartId}`] : undefined), img(assets[`illustration-${i}`]));
    for (const y of x.subsections) o.push(`<h3>${h(y.heading)}</h3>`, ...para(y.body).map((p) => `<p>${h(p)}</p>`));
  });
  if (doc.faq.length) o.push('<h2>FAQ</h2>', ...doc.faq.map((q) => `<h3>${h(q.question)}</h3><p>${h(q.answer)}</p>`));
  if (doc.citations.length) o.push('<h2>Sources</h2><ul>' + doc.citations.map((c) => `<li><a href="${h(c.url)}">${h(c.title)}</a></li>`).join('') + '</ul>');
  return o.filter(Boolean).join('\n');
}

export type ArticleJsonLd = { '@context': 'https://schema.org'; '@graph': Record<string, unknown>[] };

/** Article + FAQPage (+ ItemList when the article ranks things) in one @graph. */
export function buildArticleJsonLd(doc: ArticleDoc, o: { pageUrl?: string | null; author?: string | null; publisher?: string | null; heroUrl?: string | null; published?: string | null } = {}): ArticleJsonLd {
  const org = (name: string) => ({ '@type': 'Organization', name });
  const g: Record<string, unknown>[] = [{
    '@type': 'Article', headline: doc.title, ...(doc.metaDescription ? { description: doc.metaDescription } : {}),
    ...(o.pageUrl ? { mainEntityOfPage: o.pageUrl } : {}), ...(o.heroUrl ? { image: [o.heroUrl] } : {}),
    datePublished: o.published ?? new Date().toISOString().slice(0, 10), dateModified: new Date().toISOString().slice(0, 10),
    ...(o.author ? { author: org(o.author) } : {}), ...(o.publisher ? { publisher: org(o.publisher) } : {}),
    wordCount: articleWordCount(doc),
  }];
  if (doc.itemList) g.push({ '@type': 'ItemList', name: doc.itemList.name, numberOfItems: doc.itemList.items.length, itemListElement: doc.itemList.items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, ...(it.url ? { url: it.url } : {}), ...(it.description ? { description: it.description } : {}) })) });
  if (doc.faq.length) g.push({ '@type': 'FAQPage', mainEntity: doc.faq.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })) });
  return { '@context': 'https://schema.org', '@graph': g };
}

/** Edited doc → same validation as a model answer. */
export function sanitizeArticle(d: ArticleDoc): ArticleDoc | null {
  return parseArticle({
    title: d.title, slug: d.slug, meta_description: d.metaDescription, direct_answer: d.directAnswer, hero_prompt: d.heroPrompt, hero_alt: d.heroAlt,
    sections: d.sections.map((x) => ({ heading: x.heading, body: x.body, chart_id: x.chartId ?? '', image_prompt: x.imagePrompt ?? '', table: x.table ?? { caption: '', columns: [], rows: [] }, subsections: x.subsections })),
    item_list: d.itemList ?? { name: '', items: [] }, faq: d.faq,
    charts: d.charts.map((c) => ({ id: c.id, title: c.title, unit: c.unit, source_url: c.sourceUrl, source_title: c.sourceTitle, points: c.points })), citations: d.citations,
  });
}
