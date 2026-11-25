/** Pure analyzers for the GEO readiness audit (no I/O, unit-tested with fixtures). */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';
export type AuditCheck = { id: string; label: string; category: string; score: number; status: CheckStatus; detail: string; weight: number };

export const AI_BOTS = [
  { ua: 'GPTBot', operator: 'OpenAI', purpose: 'training', core: false },
  { ua: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'ChatGPT search', core: true },
  { ua: 'ChatGPT-User', operator: 'OpenAI', purpose: 'user-triggered browsing', core: true },
  { ua: 'ClaudeBot', operator: 'Anthropic', purpose: 'training', core: false },
  { ua: 'Claude-User', operator: 'Anthropic', purpose: 'user-triggered browsing', core: true },
  { ua: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'Claude search', core: true },
  { ua: 'PerplexityBot', operator: 'Perplexity', purpose: 'Perplexity index', core: true },
  { ua: 'Perplexity-User', operator: 'Perplexity', purpose: 'user-triggered browsing', core: false },
  { ua: 'Google-Extended', operator: 'Google', purpose: 'Gemini training/grounding', core: true },
  { ua: 'Googlebot', operator: 'Google', purpose: 'Google Search / AI Overviews', core: true },
  { ua: 'Bingbot', operator: 'Microsoft', purpose: 'Bing / Copilot', core: true },
  { ua: 'Applebot-Extended', operator: 'Apple', purpose: 'Apple Intelligence', core: false },
  { ua: 'CCBot', operator: 'Common Crawl', purpose: 'open dataset', core: false },
] as const;

const BOT_UA_STRINGS: Record<string, string> = {
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  'ChatGPT-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  Bingbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
};
export const WAF_PROBE_BOTS = Object.keys(BOT_UA_STRINGS);
export const botUserAgent = (name: string) => BOT_UA_STRINGS[name] ?? name;
export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ------------------------------------------------------------------ robots.txt
type Rule = { allow: boolean; path: string };
export type RobotsGroup = { agents: string[]; rules: Rule[] };
export type Robots = { groups: RobotsGroup[]; sitemaps: string[] };

export function parseRobots(text: string): Robots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let cur: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (cur) cur.rules.push({ allow: key === 'allow', path: val });
    } else if (key === 'sitemap') {
      sitemaps.push(val);
    } else lastWasAgent = false;
  }
  return { groups, sitemaps };
}

function pathMatches(pattern: string, path: string): number {
  if (!pattern) return -1;
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp('^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
  return re.test(path) ? body.length : -1;
}

/** Is `bot` allowed to fetch `path`? Uses the most specific matching group, falling back to `*`. */
export function botAccess(robots: Robots | null, bot: string, path = '/'): { allowed: boolean; via: 'no-robots' | 'specific' | 'wildcard' | 'default' } {
  if (!robots) return { allowed: true, via: 'no-robots' };
  const b = bot.toLowerCase();
  let group = robots.groups.find((g) => g.agents.includes(b));
  let via: 'specific' | 'wildcard' = 'specific';
  if (!group) { group = robots.groups.find((g) => g.agents.includes('*')); via = 'wildcard'; }
  if (!group) return { allowed: true, via: 'default' };
  let best = { len: -1, allow: true };
  for (const r of group.rules) {
    const len = pathMatches(r.path, path);
    if (len > best.len || (len === best.len && len >= 0 && r.allow)) { if (len >= 0) best = { len, allow: r.allow }; }
  }
  return { allowed: best.len < 0 ? true : best.allow, via };
}

export function analyzeRobots(text: string | null, status: number | null): { checks: AuditCheck[]; robots: Robots | null; bots: { bot: string; operator: string; allowed: boolean }[] } {
  const robots = text !== null && status !== null && status < 400 ? parseRobots(text) : null;
  const bots = AI_BOTS.map((b) => ({ bot: b.ua, operator: b.operator, core: b.core, allowed: botAccess(robots, b.ua).allowed }));
  const checks: AuditCheck[] = [];
  if (!robots) {
    checks.push({ id: 'robots_present', label: 'robots.txt', category: 'Crawl access', score: 70, status: 'warn', weight: 3, detail: status === null ? 'Could not fetch robots.txt.' : `robots.txt returned HTTP ${status}. Everything is crawlable by default, but a robots.txt lets you declare your sitemap.` });
  } else {
    checks.push({ id: 'robots_present', label: 'robots.txt', category: 'Crawl access', score: 100, status: 'pass', weight: 3, detail: `Found, ${robots.groups.length} rule group(s), ${robots.sitemaps.length} sitemap line(s).` });
  }
  const coreBlocked = bots.filter((b) => b.core && !b.allowed).map((b) => b.bot);
  const trainBlocked = bots.filter((b) => !b.core && !b.allowed).map((b) => b.bot);
  checks.push({
    id: 'robots_ai_bots', label: 'AI crawlers allowed', category: 'Crawl access', weight: 10,
    score: Math.max(0, 100 - coreBlocked.length * 25), status: coreBlocked.length === 0 ? 'pass' : coreBlocked.length <= 2 ? 'warn' : 'fail',
    detail: coreBlocked.length ? `Blocked in robots.txt: ${coreBlocked.join(', ')}. These bots power AI answers and citations.` : `All AI search/answer bots are allowed${trainBlocked.length ? `; training-only bots blocked (${trainBlocked.join(', ')}), which is a legitimate choice` : ''}.`,
  });
  const home = botAccess(robots, '*').allowed;
  checks.push({ id: 'robots_homepage', label: 'Homepage not blocked for all bots', category: 'Crawl access', weight: 5, score: home ? 100 : 0, status: home ? 'pass' : 'fail', detail: home ? 'The homepage is crawlable.' : 'robots.txt disallows "/" for every bot.' });
  return { checks, robots, bots };
}

// ------------------------------------------------------------------ llms.txt
export function analyzeLlms(txt: { status: number | null; body: string | null; type?: string | null }, full: { status: number | null; body: string | null }): AuditCheck[] {
  const ok = (r: { status: number | null; body: string | null }) => r.status !== null && r.status < 300 && !!r.body && r.body.trim().length > 0 && !/^\s*<(!doctype|html)/i.test(r.body);
  const out: AuditCheck[] = [];
  if (!ok(txt)) {
    out.push({ id: 'llms_txt', label: 'llms.txt', category: 'AI discoverability', weight: 4, score: 0, status: 'warn', detail: txt.status === null || txt.status >= 300 ? `Not found (HTTP ${txt.status ?? 'error'}).` : 'The URL returns an HTML page, not a plain-text llms.txt.' });
  } else {
    const body = txt.body!;
    const problems: string[] = [];
    const lines = body.split(/\r?\n/);
    if (!/^#\s+\S/.test(lines.find((l) => l.trim()) ?? '')) problems.push('should start with an H1 title (# Site name)');
    if (!lines.some((l) => /^>\s+\S/.test(l))) problems.push('missing a "> summary" blockquote');
    const links = body.match(/\[[^\]]+\]\(https?:\/\/[^)\s]+\)/g) ?? [];
    if (links.length === 0) problems.push('contains no [title](url) links to key pages');
    if (!lines.some((l) => /^##\s+\S/.test(l))) problems.push('has no ## sections');
    out.push({ id: 'llms_txt', label: 'llms.txt', category: 'AI discoverability', weight: 4, score: Math.max(40, 100 - problems.length * 20), status: problems.length ? 'warn' : 'pass', detail: problems.length ? `Present but ${problems.join('; ')}.` : `Valid: title, summary and ${links.length} link(s).` });
  }
  out.push(ok(full)
    ? { id: 'llms_full', label: 'llms-full.txt', category: 'AI discoverability', weight: 1, score: 100, status: 'pass', detail: `Present (${Math.round(full.body!.length / 1024)} KB).` }
    : { id: 'llms_full', label: 'llms-full.txt', category: 'AI discoverability', weight: 1, score: 50, status: 'info', detail: 'Not found. Optional: a single file with the full text of your key pages.' });
  return out;
}

// ------------------------------------------------------------------ sitemap
export function parseSitemap(xml: string): { kind: 'index' | 'urlset' | 'invalid'; locs: string[]; lastmods: Date[] } {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? 'index' : /<urlset[\s>]/i.test(xml) ? 'urlset' : 'invalid';
  const locs = [...xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)].map((m) => m[1]!);
  const lastmods = [...xml.matchAll(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/gi)].map((m) => new Date(m[1]!)).filter((d) => !Number.isNaN(d.getTime()));
  return { kind, locs, lastmods };
}

export function analyzeSitemap(input: { declared: boolean; url: string | null; status: number | null; xml: string | null; extraUrls?: number; now?: Date }): AuditCheck[] {
  const now = input.now ?? new Date();
  const out: AuditCheck[] = [];
  out.push({ id: 'sitemap_declared', label: 'Sitemap declared in robots.txt', category: 'AI discoverability', weight: 2, score: input.declared ? 100 : 50, status: input.declared ? 'pass' : 'warn', detail: input.declared ? 'robots.txt has a Sitemap line.' : 'No Sitemap line in robots.txt; add one so crawlers find it.' });
  if (!input.xml || input.status === null || input.status >= 400) {
    out.push({ id: 'sitemap_valid', label: 'sitemap.xml', category: 'AI discoverability', weight: 6, score: 0, status: 'fail', detail: `No sitemap reachable${input.url ? ` at ${input.url} (HTTP ${input.status ?? 'error'})` : ''}.` });
    return out;
  }
  const s = parseSitemap(input.xml);
  if (s.kind === 'invalid') {
    out.push({ id: 'sitemap_valid', label: 'sitemap.xml', category: 'AI discoverability', weight: 6, score: 20, status: 'fail', detail: 'The file is not a valid sitemap (no <urlset> or <sitemapindex>).' });
    return out;
  }
  const count = s.kind === 'index' ? (input.extraUrls ?? 0) : s.locs.length;
  out.push({ id: 'sitemap_valid', label: 'sitemap.xml', category: 'AI discoverability', weight: 6, score: count > 0 || s.kind === 'index' ? 100 : 30, status: count > 0 || s.kind === 'index' ? 'pass' : 'warn', detail: s.kind === 'index' ? `Sitemap index with ${s.locs.length} child sitemap(s)${count ? `, ${count} URLs sampled` : ''}.` : `${count} URL(s).` });
  const dates = s.lastmods;
  if (!dates.length) {
    out.push({ id: 'sitemap_fresh', label: 'Sitemap freshness (lastmod)', category: 'AI discoverability', weight: 3, score: 40, status: 'warn', detail: 'No <lastmod> dates. They help AI crawlers prioritise fresh pages.' });
  } else {
    const newest = new Date(Math.max(...dates.map((d) => d.getTime())));
    const days = Math.floor((now.getTime() - newest.getTime()) / 86_400_000);
    const score = days <= 30 ? 100 : days <= 90 ? 75 : days <= 180 ? 45 : 15;
    out.push({ id: 'sitemap_fresh', label: 'Sitemap freshness (lastmod)', category: 'AI discoverability', weight: 3, score, status: score >= 75 ? 'pass' : score >= 45 ? 'warn' : 'fail', detail: `Most recent lastmod is ${days} day(s) ago.` });
  }
  return out;
}

// ------------------------------------------------------------------ HTML
const strip = (h: string) => h.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
const attrVal = (tag: string, name: string) => { const m = attr(tag, name); return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null; };

export type HtmlFacts = {
  textWords: number; title: string | null; canonical: string | null; metaRobots: string | null; xRobots: string | null;
  h1: number; headings: number[]; jsonLdTypes: string[]; hreflang: string[]; author: boolean; date: boolean;
  internalLinks: number; externalLinks: number; bytes: number; scripts: number; rootOnlyShell: boolean; images: number; imagesNoAlt: number;
};

export function extractJsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>;
      const t = o['@type'];
      for (const x of Array.isArray(t) ? t : t ? [t] : []) if (typeof x === 'string') types.add(x);
      walk(o['@graph']); walk(o['mainEntity']); walk(o['itemListElement']);
    }
  };
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1]!)); } catch { /* invalid JSON-LD is counted separately by absence */ }
  }
  return [...types];
}

export function extractHtmlFacts(html: string, pageUrl: string, headers: Record<string, string> = {}): HtmlFacts {
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  const text = strip(html);
  const tags = (re: RegExp) => [...html.matchAll(re)].map((m) => m[0]);
  const metas = tags(/<meta\b[^>]*>/gi);
  const metaRobots = metas.map((t) => (attrVal(t, 'name')?.toLowerCase() === 'robots' ? attrVal(t, 'content') : null)).find((x) => x != null) ?? null;
  const links = tags(/<link\b[^>]*>/gi);
  const canonical = links.map((t) => (attrVal(t, 'rel')?.toLowerCase().split(/\s+/).includes('canonical') ? attrVal(t, 'href') : null)).find((x) => x) ?? null;
  const hreflang = links.filter((t) => attrVal(t, 'rel')?.toLowerCase() === 'alternate' && attrVal(t, 'hreflang')).map((t) => attrVal(t, 'hreflang')!);
  const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const anchors = tags(/<a\b[^>]*>/gi).map((t) => attrVal(t, 'href')).filter((h): h is string => !!h && !/^(#|mailto:|tel:|javascript:)/i.test(h));
  let internal = 0, external = 0;
  for (const h of anchors) {
    try { new URL(h, pageUrl).hostname.replace(/^www\./, '') === host ? internal++ : external++; } catch { /* ignore */ }
  }
  const imgs = tags(/<img\b[^>]*>/gi);
  const author = metas.some((t) => /^(author|article:author)$/i.test(attrVal(t, 'name') ?? attrVal(t, 'property') ?? '')) || /rel\s*=\s*["']author["']|itemprop\s*=\s*["']author["']|class\s*=\s*["'][^"']*\b(byline|author)\b/i.test(html) || /"author"\s*:/.test(html);
  const date = metas.some((t) => /^(article:published_time|article:modified_time|date|datePublished)$/i.test(attrVal(t, 'property') ?? attrVal(t, 'name') ?? attrVal(t, 'itemprop') ?? '')) || /<time\b[^>]*datetime/i.test(html) || /"date(Published|Modified)"\s*:/.test(html);
  return {
    textWords: text ? text.split(' ').length : 0,
    title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() || null,
    canonical, metaRobots, xRobots: headers['x-robots-tag'] ?? null,
    h1: headings.filter((h) => h === 1).length, headings, jsonLdTypes: extractJsonLdTypes(html), hreflang, author, date,
    internalLinks: internal, externalLinks: external, bytes: Buffer.byteLength(html), scripts: tags(/<script\b/gi).length,
    rootOnlyShell: /<div[^>]+id\s*=\s*["'](root|__next|app)["'][^>]*>\s*<\/div>/i.test(html) && text.split(' ').length < 80,
    images: imgs.length, imagesNoAlt: imgs.filter((t) => !(attrVal(t, 'alt') ?? '').trim()).length,
  };
}

const mk = (id: string, label: string, category: string, weight: number, score: number, detail: string, infoOnly = false): AuditCheck =>
  ({ id, label, category, weight, score, detail, status: infoOnly ? 'info' : score >= 80 ? 'pass' : score >= 40 ? 'warn' : 'fail' });

export function analyzeHtml(f: HtmlFacts, pageUrl: string, opts: { isHttps: boolean; httpRedirectsToHttps: boolean | null; isArticle?: boolean }): AuditCheck[] {
  const out: AuditCheck[] = [];
  out.push(mk('https', 'HTTPS', 'Technical', 5, opts.isHttps ? (opts.httpRedirectsToHttps === false ? 70 : 100) : 0, !opts.isHttps ? 'The site is served over HTTP.' : opts.httpRedirectsToHttps === false ? 'HTTPS works but http:// does not redirect to it.' : 'Served over HTTPS.'));
  out.push(mk('ssr', 'Content visible without JavaScript', 'Rendering', 10, f.rootOnlyShell ? 0 : f.textWords >= 300 ? 100 : f.textWords >= 120 ? 70 : f.textWords >= 50 ? 35 : 10, f.rootOnlyShell ? 'The HTML is an empty JavaScript shell. Most AI crawlers do not run JavaScript, so they see nothing.' : `${f.textWords} words are present in the raw HTML.`));
  const noindex = /noindex/i.test(f.metaRobots ?? '') || /noindex/i.test(f.xRobots ?? '');
  out.push(mk('noindex', 'Page is indexable', 'Crawl access', 8, noindex ? 0 : 100, noindex ? `Blocked by ${/noindex/i.test(f.metaRobots ?? '') ? 'meta robots' : 'X-Robots-Tag'} noindex.` : 'No noindex directive.'));
  if (!f.canonical) out.push(mk('canonical', 'Canonical tag', 'Technical', 4, 30, 'No <link rel="canonical">. Duplicate URLs may split signals.'));
  else {
    let same = true;
    try { const c = new URL(f.canonical, pageUrl); const p = new URL(pageUrl); same = c.hostname.replace(/^www\./, '') === p.hostname.replace(/^www\./, ''); } catch { same = false; }
    out.push(mk('canonical', 'Canonical tag', 'Technical', 4, same ? 100 : 40, same ? `Canonical: ${f.canonical}` : `Canonical points to a different host (${f.canonical}).`));
  }
  const key = ['Organization', 'Article', 'BlogPosting', 'NewsArticle', 'FAQPage', 'Product', 'WebSite', 'LocalBusiness', 'SoftwareApplication', 'HowTo'];
  const found = f.jsonLdTypes.filter((t) => key.includes(t));
  out.push(mk('schema_org', 'Organization structured data', 'Structured data', 6, f.jsonLdTypes.includes('Organization') || f.jsonLdTypes.includes('LocalBusiness') ? 100 : 20, f.jsonLdTypes.includes('Organization') || f.jsonLdTypes.includes('LocalBusiness') ? 'Organization schema found.' : 'No Organization JSON-LD. It tells AI engines who you are and links your social profiles.'));
  out.push(mk('schema_content', 'Content structured data (Article / FAQPage / Product)', 'Structured data', 6, ['Article', 'BlogPosting', 'NewsArticle', 'FAQPage', 'Product', 'HowTo', 'SoftwareApplication'].some((t) => f.jsonLdTypes.includes(t)) ? 100 : f.jsonLdTypes.length ? 50 : 15, found.length ? `Found: ${found.join(', ')}.` : f.jsonLdTypes.length ? `Only: ${f.jsonLdTypes.join(', ')}.` : 'No JSON-LD found on this page.'));
  const bad = f.h1 === 0 ? 'no H1' : f.h1 > 1 ? `${f.h1} H1s` : null;
  let skips = 0;
  for (let i = 1; i < f.headings.length; i++) if (f.headings[i]! - f.headings[i - 1]! > 1) skips++;
  const hScore = Math.max(0, 100 - (bad ? 40 : 0) - skips * 15 - (f.headings.length < 3 ? 20 : 0));
  out.push(mk('headings', 'Heading structure', 'Content', 5, hScore, [bad, skips ? `${skips} skipped level(s)` : null, f.headings.length < 3 ? 'very few headings' : null].filter(Boolean).join(', ') || `Clean outline, ${f.headings.length} headings, one H1.`));
  out.push(mk('author_date', 'Author and date signals', 'Content', 4, (f.author ? 50 : 0) + (f.date ? 50 : 0), `${f.author ? 'Author found' : 'No author'}; ${f.date ? 'date found' : 'no published/modified date'}.`));
  out.push(mk('internal_links', 'Internal linking', 'Content', 3, f.internalLinks >= 10 ? 100 : f.internalLinks >= 4 ? 70 : f.internalLinks >= 1 ? 40 : 0, `${f.internalLinks} internal and ${f.externalLinks} external link(s).`));
  out.push(mk('hreflang', 'hreflang', 'Technical', 1, f.hreflang.length ? 100 : 60, f.hreflang.length ? `${f.hreflang.length} language variant(s): ${f.hreflang.slice(0, 5).join(', ')}.` : 'None. Only needed if you publish in several languages.', !f.hreflang.length));
  const kb = Math.round(f.bytes / 1024);
  out.push(mk('page_weight', 'HTML page weight', 'Performance', 2, kb <= 200 ? 100 : kb <= 500 ? 70 : kb <= 1024 ? 40 : 10, `${kb} KB of HTML, ${f.scripts} script tag(s).`));
  if (f.images) out.push(mk('image_alt', 'Image alt text', 'Content', 1, Math.round(100 * (1 - f.imagesNoAlt / f.images)), `${f.imagesNoAlt} of ${f.images} image(s) lack alt text.`));
  return out;
}

// ------------------------------------------------------------------ Performance (PSI) and WAF
export function analyzePsi(m: { lcp: number | null; cls: number | null; inp: number | null; ttfb: number | null; perfScore?: number | null } | null): AuditCheck[] {
  if (!m) return [mk('perf_cwv', 'Core Web Vitals', 'Performance', 6, 50, 'PageSpeed Insights was unavailable, so performance was not measured.', true)];
  const grade = (v: number | null, good: number, poor: number) => (v === null ? null : v <= good ? 100 : v <= poor ? 60 : 20);
  const items: [string, string, number | null, number | null, number, number, (v: number) => string][] = [
    ['perf_lcp', 'Largest Contentful Paint', m.lcp, null, 2500, 4000, (v) => `${(v / 1000).toFixed(1)} s (good ≤ 2.5 s)`],
    ['perf_cls', 'Cumulative Layout Shift', m.cls, null, 0.1, 0.25, (v) => `${v.toFixed(2)} (good ≤ 0.1)`],
    ['perf_inp', 'Interaction to Next Paint', m.inp, null, 200, 500, (v) => `${Math.round(v)} ms (good ≤ 200 ms)`],
    ['perf_ttfb', 'Time to First Byte', m.ttfb, null, 800, 1800, (v) => `${Math.round(v)} ms (good ≤ 800 ms)`],
  ];
  return items.map(([id, label, v, , good, poor, fmt]) => {
    const g = grade(v, good, poor);
    return g === null ? mk(id, label, 'Performance', 3, 50, 'No data returned for this metric.', true) : mk(id, label, 'Performance', 3, g, fmt(v!));
  });
}

export type ProbeResult = { name: string; status: number | null; bytes: number; error?: string };
export function analyzeWaf(browser: ProbeResult, bots: ProbeResult[]): AuditCheck {
  if (browser.status === null || browser.status >= 400) {
    return mk('waf_bots', 'WAF / CDN not blocking AI crawlers', 'Crawl access', 10, 50, `Baseline browser request failed (${browser.status ?? browser.error ?? 'error'}), so bot blocking could not be compared.`, true);
  }
  const blocked = bots.filter((b) => b.status === null || [401, 403, 406, 429, 503].includes(b.status) || (b.status < 400 && browser.bytes > 2000 && b.bytes < browser.bytes * 0.2));
  if (!blocked.length) return mk('waf_bots', 'WAF / CDN not blocking AI crawlers', 'Crawl access', 10, 100, `${bots.length} bot user agents received the same response as a browser.`);
  return mk('waf_bots', 'WAF / CDN not blocking AI crawlers', 'Crawl access', 10, Math.max(0, 100 - Math.round((blocked.length / bots.length) * 100)), `Blocked or throttled: ${blocked.map((b) => `${b.name} (${b.status ?? 'no response'})`).join(', ')}. A browser got HTTP ${browser.status}.`);
}

// ------------------------------------------------------------------ scoring
export function overallScore(checks: AuditCheck[]): number {
  const scored = checks.filter((c) => c.status !== 'info');
  const w = scored.reduce((a, c) => a + c.weight, 0);
  return w ? Math.round(scored.reduce((a, c) => a + c.score * c.weight, 0) / w) : 0;
}
