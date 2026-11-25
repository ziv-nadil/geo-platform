import { describe, expect, it } from 'vitest';
import { analyzeHtml, analyzeLlms, analyzeRobots, analyzeSitemap, analyzeWaf, analyzePsi, botAccess, extractHtmlFacts, overallScore, parseRobots, parseSitemap } from '../analyze';
import { buildFixes, detectPlatform } from '../report';

const ROBOTS = `# test
User-agent: *
Disallow: /admin
Allow: /admin/public

User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Disallow: /private/

Sitemap: https://acme.example/sitemap.xml
`;

const GOOD_HTML = `<!doctype html><html lang="en"><head><title>Acme</title>
<link rel="canonical" href="https://www.acme.example/"><meta name="robots" content="index,follow">
<link rel="alternate" hreflang="de" href="https://acme.example/de/">
<meta name="author" content="Jane"><meta property="article:published_time" content="2026-01-01">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme"},{"@type":"FAQPage"}]}</script></head>
<body><h1>Acme</h1><h2>What</h2><h3>Sub</h3><h2>Why</h2>
${'<p>word </p>'.repeat(400)}
${Array.from({ length: 12 }, (_, i) => `<a href="/p${i}">p</a>`).join('')}<a href="https://other.example">x</a><img src="a.png" alt="a"></body></html>`;

const SHELL = `<html><head><title>App</title><meta name="robots" content="noindex"></head><body><div id="root"></div><script src="a.js"></script></body></html>`;

describe('robots', () => {
  it('parses groups with multiple agents and sitemaps', () => {
    const r = parseRobots(ROBOTS);
    expect(r.groups).toHaveLength(3);
    expect(r.groups[1]!.agents).toEqual(['gptbot', 'claudebot']);
    expect(r.sitemaps).toEqual(['https://acme.example/sitemap.xml']);
  });
  it('resolves per-bot access, wildcard fallback and longest match', () => {
    const r = parseRobots(ROBOTS);
    expect(botAccess(r, 'GPTBot').allowed).toBe(false);
    expect(botAccess(r, 'Bingbot').allowed).toBe(true);
    expect(botAccess(r, 'Bingbot', '/admin/x').allowed).toBe(false);
    expect(botAccess(r, 'Bingbot', '/admin/public/x').allowed).toBe(true);
    expect(botAccess(r, 'PerplexityBot', '/').allowed).toBe(true);
    expect(botAccess(null, 'GPTBot').allowed).toBe(true);
  });
  it('flags blocked core bots; training-only blocks are not penalised as core', () => {
    const { checks, bots } = analyzeRobots(ROBOTS, 200);
    expect(bots.find((b) => b.bot === 'GPTBot')!.allowed).toBe(false);
    expect(checks.find((c) => c.id === 'robots_ai_bots')!.status).toBe('pass');
    const all = analyzeRobots('User-agent: *\nDisallow: /', 200).checks;
    expect(all.find((c) => c.id === 'robots_ai_bots')!.status).toBe('fail');
    expect(all.find((c) => c.id === 'robots_homepage')!.status).toBe('fail');
  });
  it('treats a missing robots.txt as allowed but warns', () => {
    const { checks } = analyzeRobots(null, 404);
    expect(checks[0]!.status).toBe('warn');
  });
});

describe('llms.txt', () => {
  it('validates structure', () => {
    const ok = analyzeLlms({ status: 200, body: '# Acme\n> Summary\n\n## Docs\n- [Start](https://acme.example/start): go\n' }, { status: 404, body: null });
    expect(ok[0]!.status).toBe('pass');
    expect(analyzeLlms({ status: 200, body: 'hello' }, { status: 404, body: null })[0]!.status).toBe('warn');
    expect(analyzeLlms({ status: 200, body: '<!doctype html><html>' }, { status: 404, body: null })[0]!.detail).toMatch(/HTML/);
    expect(analyzeLlms({ status: 404, body: null }, { status: 404, body: null })[0]!.score).toBe(0);
  });
});

describe('sitemap', () => {
  const xml = (d: string) => `<?xml version="1.0"?><urlset><url><loc>https://a.example/1</loc><lastmod>${d}</lastmod></url><url><loc>https://a.example/2</loc></url></urlset>`;
  it('parses urlset and index', () => {
    expect(parseSitemap(xml('2026-01-01')).locs).toHaveLength(2);
    expect(parseSitemap('<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>').kind).toBe('index');
    expect(parseSitemap('<html/>').kind).toBe('invalid');
  });
  it('scores freshness against now', () => {
    const now = new Date('2026-11-25');
    const f = (d: string) => analyzeSitemap({ declared: true, url: 'u', status: 200, xml: xml(d), now }).find((c) => c.id === 'sitemap_fresh')!;
    expect(f('2026-11-10').status).toBe('pass');
    expect(f('2025-01-01').status).toBe('fail');
    expect(analyzeSitemap({ declared: false, url: 'u', status: 404, xml: null, now }).find((c) => c.id === 'sitemap_valid')!.status).toBe('fail');
  });
});

describe('html', () => {
  it('passes a well-formed page', () => {
    const f = extractHtmlFacts(GOOD_HTML, 'https://acme.example/');
    expect(f.jsonLdTypes).toEqual(expect.arrayContaining(['Organization', 'FAQPage']));
    expect(f.hreflang).toEqual(['de']);
    expect(f.h1).toBe(1);
    expect(f.author && f.date).toBe(true);
    const checks = analyzeHtml(f, 'https://acme.example/', { isHttps: true, httpRedirectsToHttps: true });
    for (const id of ['ssr', 'noindex', 'canonical', 'schema_org', 'schema_content', 'headings', 'author_date', 'internal_links', 'https']) {
      expect(checks.find((c) => c.id === id)!.status, id).toBe('pass');
    }
  });
  it('flags a JS shell with noindex', () => {
    const f = extractHtmlFacts(SHELL, 'http://x.example/', { 'x-robots-tag': 'none' });
    expect(f.rootOnlyShell).toBe(true);
    const checks = analyzeHtml(f, 'http://x.example/', { isHttps: false, httpRedirectsToHttps: null });
    expect(checks.find((c) => c.id === 'ssr')!.status).toBe('fail');
    expect(checks.find((c) => c.id === 'noindex')!.status).toBe('fail');
    expect(checks.find((c) => c.id === 'https')!.status).toBe('fail');
    expect(checks.find((c) => c.id === 'schema_org')!.status).toBe('fail');
  });
});

describe('waf and performance', () => {
  it('detects bots that get blocked while a browser succeeds', () => {
    const c = analyzeWaf({ name: 'browser', status: 200, bytes: 50_000 }, [{ name: 'GPTBot', status: 403, bytes: 100 }, { name: 'Bingbot', status: 200, bytes: 50_000 }]);
    expect(c.status).not.toBe('pass');
    expect(c.detail).toMatch(/GPTBot \(403\)/);
    expect(analyzeWaf({ name: 'browser', status: 200, bytes: 50_000 }, [{ name: 'GPTBot', status: 200, bytes: 50_000 }]).status).toBe('pass');
  });
  it('grades vitals and tolerates missing PSI', () => {
    const c = analyzePsi({ lcp: 3000, cls: 0.05, inp: null, ttfb: 1000 });
    expect(c.find((x) => x.id === 'perf_lcp')!.status).toBe('warn');
    expect(c.find((x) => x.id === 'perf_cls')!.status).toBe('pass');
    expect(c.find((x) => x.id === 'perf_inp')!.status).toBe('info');
    expect(c.find((x) => x.id === 'perf_ttfb')!.status).toBe('warn');
    expect(analyzePsi(null)[0]!.status).toBe('info');
  });
});

describe('score and fixes', () => {
  it('ignores info checks in the score and orders fixes by priority with platform steps', () => {
    const checks = analyzeRobots('User-agent: *\nDisallow: /', 200).checks;
    expect(overallScore(checks)).toBeLessThan(50);
    const fixes = buildFixes(checks, 'wordpress');
    expect(fixes[0]!.priority).toBe('critical');
    expect(fixes.find((f) => f.checkId === 'robots_ai_bots')!.steps.join(' ')).toMatch(/Yoast/);
    expect(buildFixes(checks, null).find((f) => f.checkId === 'robots_ai_bots')!.platform).toBe('custom');
  });
  it('detects platforms', () => {
    expect(detectPlatform({}, '<link href="/wp-content/x.css">')).toBe('wordpress');
    expect(detectPlatform({}, '<html data-wf-site="1">')).toBe('webflow');
    expect(detectPlatform({}, '<html>')).toBeNull();
  });
});
