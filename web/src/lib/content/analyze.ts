/** Structure extraction for a fetched page (pure): words, headings, tables, FAQ, stats, schema, freshness. */

export interface PageStructure {
  title: string | null; words: number; h2: number; h3: number; tables: number; lists: number; faq: boolean;
  stats: number; schemaTypes: string[]; published: string | null; modified: string | null; ageDays: number | null;
  headings: string[]; images: number;
}

const strip = (html: string) => html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const text = (html: string) => strip(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

function collectTypes(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) return node.forEach((n) => collectTypes(n, out));
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const t = o['@type'];
    for (const x of Array.isArray(t) ? t : t ? [t] : []) if (typeof x === 'string') out.add(x);
    Object.values(o).forEach((v) => collectTypes(v, out));
  }
}
function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']+)["']/i)?.[1] ?? null;
}
const toDate = (v: string | null): Date | null => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

export function analyzePage(html: string, now = new Date()): PageStructure {
  const body = strip(html);
  const plain = text(html);
  const types = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectTypes(JSON.parse(m[1]), types); } catch { /* malformed JSON-LD is common; skip */ }
  }
  const faq = types.has('FAQPage') || /<h[2-4][^>]*>[^<]*(faq|frequently asked)/i.test(body) || count(body, /<(details|summary)\b/gi) >= 3;
  const published = metaContent(html, 'article:published_time') ?? metaContent(html, 'datePublished') ?? html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const modified = metaContent(html, 'article:modified_time') ?? metaContent(html, 'dateModified') ?? html.match(/"dateModified"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const fresh = toDate(modified) ?? toDate(published);
  const heads = [...body.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => text(m[1])).filter(Boolean);
  return {
    title: text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '') || null,
    words: (plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length,
    h2: count(body, /<h2\b/gi), h3: count(body, /<h3\b/gi), tables: count(body, /<table\b/gi), lists: count(body, /<(ul|ol)\b/gi), faq,
    stats: (plain.match(/\b\d[\d,.]*\s?(%|percent|x\b|million|billion|k\b)|\$\s?\d[\d,.]*/gi) ?? []).length,
    schemaTypes: [...types].slice(0, 12), published, modified,
    ageDays: fresh ? Math.max(0, Math.round((now.getTime() - fresh.getTime()) / 86_400_000)) : null,
    headings: heads.slice(0, 24), images: count(body, /<img\b/gi),
  };
}

export interface BenchSource { kind: 'cited' | 'serp'; structure: PageStructure | null }
const median = (n: number[]) => { if (!n.length) return 0; const s = [...n].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

/** Aggregate benchmarks across analysed pages: what "table stakes" look like for this prompt. */
export function summarizeResearch(sources: BenchSource[]) {
  const ok = sources.map((s) => s.structure).filter((s): s is PageStructure => !!s && s.words >= 150);
  const pct = (f: (s: PageStructure) => boolean) => (ok.length ? Math.round((ok.filter(f).length / ok.length) * 100) : 0);
  const ages = ok.map((s) => s.ageDays).filter((n): n is number => n !== null);
  return {
    analysed: ok.length, attempted: sources.length,
    medianWords: median(ok.map((s) => s.words)), maxWords: Math.max(0, ...ok.map((s) => s.words)),
    medianH2: median(ok.map((s) => s.h2)), medianStats: median(ok.map((s) => s.stats)),
    pctTables: pct((s) => s.tables > 0), pctFaq: pct((s) => s.faq), pctSchema: pct((s) => s.schemaTypes.length > 0),
    pctFaqSchema: pct((s) => s.schemaTypes.includes('FAQPage')), medianAgeDays: ages.length ? median(ages) : null,
    commonHeadings: topHeadings(ok),
  };
}
function topHeadings(ok: PageStructure[]): string[] {
  const c = new Map<string, number>();
  for (const s of ok) for (const h of new Set(s.headings.map((x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()).filter((x) => x.length > 8))) c.set(h, (c.get(h) ?? 0) + 1);
  return [...c.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h]) => h);
}
