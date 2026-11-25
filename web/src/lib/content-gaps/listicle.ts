/** Listicle document model, LLM schema, validating parser and Markdown renderer (pure). */
import { buildJsonLd, jsonLdScript, type JsonLd } from './jsonld';

export interface ListicleItem {
  name: string;
  url: string | null;
  summary: string;
  bestFor: string;
  pros: string[];
  cons: string[];
  isClient: boolean;
}
export interface ListicleDoc {
  title: string;
  slug: string;
  metaDescription: string;
  intro: string;
  items: ListicleItem[];
  comparison: { columns: string[]; rows: { item: string; values: string[] }[] };
  faq: { question: string; answer: string }[];
  citations: { title: string; url: string }[];
  methodology: string;
}

export const LISTICLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'slug', 'meta_description', 'intro', 'items', 'comparison', 'faq', 'citations', 'methodology'],
  properties: {
    title: { type: 'string' }, slug: { type: 'string' }, meta_description: { type: 'string' }, intro: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['name', 'url', 'summary', 'best_for', 'pros', 'cons', 'is_client'],
      properties: { name: { type: 'string' }, url: { type: 'string' }, summary: { type: 'string' }, best_for: { type: 'string' },
        pros: { type: 'array', items: { type: 'string' } }, cons: { type: 'array', items: { type: 'string' } }, is_client: { type: 'boolean' } } } },
    comparison: { type: 'object', additionalProperties: false, required: ['columns', 'rows'],
      properties: { columns: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'values'],
          properties: { item: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } } } } } },
    faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'answer'],
      properties: { question: { type: 'string' }, answer: { type: 'string' } } } },
    citations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'url'],
      properties: { title: { type: 'string' }, url: { type: 'string' } } } },
    methodology: { type: 'string' },
  },
} as const;

const s = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = <T>(v: unknown, f: (x: unknown) => T | null, max = 50): T[] =>
  (Array.isArray(v) ? v : []).slice(0, max).map(f).filter((x): x is T => x !== null);
const httpUrl = (v: unknown): string | null => {
  try { const u = new URL(s(v, 500)); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null; } catch { return null; }
};
export const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'listicle';

/** Clamp a model answer into a ListicleDoc; null when it has no usable items. */
export function parseListicle(data: unknown): ListicleDoc | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const items = arr<ListicleItem>(d.items, (x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = s(o.name, 120);
    if (!name) return null;
    return { name, url: httpUrl(o.url), summary: s(o.summary), bestFor: s(o.best_for, 300),
      pros: arr(o.pros, (p) => s(p, 300) || null, 6), cons: arr(o.cons, (p) => s(p, 300) || null, 6), isClient: o.is_client === true };
  }, 25);
  const title = s(d.title, 200);
  if (!title || items.length < 3) return null;
  const cmp = (d.comparison ?? {}) as Record<string, unknown>;
  const columns = arr(cmp.columns, (c) => s(c, 60) || null, 8);
  return {
    title, slug: slugify(s(d.slug, 100) || title), metaDescription: s(d.meta_description, 300), intro: s(d.intro, 3000), items,
    comparison: { columns, rows: arr(cmp.rows, (r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const item = s(o.item, 120);
      return item ? { item, values: columns.map((_, i) => s(Array.isArray(o.values) ? o.values[i] : '', 200)) } : null;
    }, 25) },
    faq: arr(d.faq, (q) => { const o = (q ?? {}) as Record<string, unknown>; const question = s(o.question, 300), answer = s(o.answer); return question && answer ? { question, answer } : null; }, 12),
    citations: arr(d.citations, (c) => { const o = (c ?? {}) as Record<string, unknown>; const url = httpUrl(o.url); return url ? { title: s(o.title, 200) || url, url } : null; }, 20),
    methodology: s(d.methodology, 1500),
  };
}

const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Markdown body (also the GitHub file / CMS source). JSON-LD is appended as a script block when asked. */
export function renderMarkdown(doc: ListicleDoc, opts: { jsonLd?: boolean; pageUrl?: string | null } = {}): string {
  const out: string[] = [`# ${doc.title}`, '', doc.intro, ''];
  doc.items.forEach((it, i) => {
    out.push(`## ${i + 1}. ${it.url ? `[${it.name}](${it.url})` : it.name}`, '', it.summary, '', `**Best for:** ${it.bestFor}`, '');
    if (it.pros.length) out.push('**Pros**', ...it.pros.map((p) => `- ${p}`), '');
    if (it.cons.length) out.push('**Cons**', ...it.cons.map((p) => `- ${p}`), '');
  });
  if (doc.comparison.columns.length && doc.comparison.rows.length) {
    out.push('## Comparison', '', `| Product | ${doc.comparison.columns.map(esc).join(' | ')} |`, `| --- | ${doc.comparison.columns.map(() => '---').join(' | ')} |`,
      ...doc.comparison.rows.map((r) => `| ${esc(r.item)} | ${r.values.map(esc).join(' | ')} |`), '');
  }
  if (doc.methodology) out.push('## How we evaluated', '', doc.methodology, '');
  if (doc.faq.length) out.push('## FAQ', '', ...doc.faq.flatMap((q) => [`### ${q.question}`, '', q.answer, '']));
  if (doc.citations.length) out.push('## Sources', '', ...doc.citations.map((c) => `- [${c.title}](${c.url})`), '');
  if (opts.jsonLd) out.push(jsonLdScript(buildJsonLd(doc, opts.pageUrl ?? null)), '');
  return out.join('\n');
}
export type { JsonLd };

const h = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML body for CMS APIs. JSON-LD is returned separately (some CMSs inject it in <head>). */
export function renderHtml(doc: ListicleDoc): string {
  const o: string[] = [`<p>${h(doc.intro)}</p>`];
  doc.items.forEach((it, i) => {
    o.push(`<h2>${i + 1}. ${it.url ? `<a href="${h(it.url)}">${h(it.name)}</a>` : h(it.name)}</h2>`, `<p>${h(it.summary)}</p>`, `<p><strong>Best for:</strong> ${h(it.bestFor)}</p>`);
    if (it.pros.length) o.push(`<p><strong>Pros</strong></p><ul>${it.pros.map((p) => `<li>${h(p)}</li>`).join('')}</ul>`);
    if (it.cons.length) o.push(`<p><strong>Cons</strong></p><ul>${it.cons.map((p) => `<li>${h(p)}</li>`).join('')}</ul>`);
  });
  if (doc.comparison.columns.length && doc.comparison.rows.length) {
    o.push('<h2>Comparison</h2><table><thead><tr><th>Product</th>' + doc.comparison.columns.map((c) => `<th>${h(c)}</th>`).join('') + '</tr></thead><tbody>' +
      doc.comparison.rows.map((r) => `<tr><td>${h(r.item)}</td>${r.values.map((v) => `<td>${h(v)}</td>`).join('')}</tr>`).join('') + '</tbody></table>');
  }
  if (doc.methodology) o.push(`<h2>How we evaluated</h2><p>${h(doc.methodology)}</p>`);
  if (doc.faq.length) o.push('<h2>FAQ</h2>', ...doc.faq.map((q) => `<h3>${h(q.question)}</h3><p>${h(q.answer)}</p>`));
  if (doc.citations.length) o.push('<h2>Sources</h2><ul>' + doc.citations.map((c) => `<li><a href="${h(c.url)}">${h(c.title)}</a></li>`).join('') + '</ul>');
  return o.join('\n');
}

/** Edited doc → same validation as a model answer (snake_case wire shape). */
export function sanitizeDoc(d: ListicleDoc): ListicleDoc | null {
  return parseListicle({
    title: d.title, slug: d.slug, meta_description: d.metaDescription, intro: d.intro, methodology: d.methodology,
    items: d.items.map((i) => ({ name: i.name, url: i.url ?? '', summary: i.summary, best_for: i.bestFor, pros: i.pros, cons: i.cons, is_client: i.isClient })),
    comparison: d.comparison, faq: d.faq, citations: d.citations,
  });
}
