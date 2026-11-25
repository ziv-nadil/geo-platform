import { describe, expect, it } from 'vitest';
import { analyzePage, summarizeResearch } from '../analyze';
import { articleWordCount, buildArticleJsonLd, lintArticle, parseArticle, renderArticleHtml, renderArticleMarkdown, sanitizeArticle } from '../article';
import { renderBarChartSvg } from '../chart';
import { lintIssues } from '../lint';

const raw = {
  title: 'Best CRM for small teams', slug: '', meta_description: 'A short guide', direct_answer: 'Pick HubSpot if you want free tooling — pick Pipedrive for pipelines.',
  hero_prompt: 'abstract dashboard', hero_alt: 'CRM dashboard',
  sections: [
    { heading: 'Pricing', body: "It's worth noting that prices differ.\n\nSecond paragraph.", chart_id: 'Price Chart', image_prompt: '', table: { caption: 'Plans', columns: ['Tool', 'Price'], rows: [['A', '$10'], ['B', '$20']] }, subsections: [{ heading: 'Hidden costs', body: 'Seats add up.' }] },
    { heading: 'Support', body: 'Support varies.', chart_id: 'missing', image_prompt: '', table: { caption: '', columns: [], rows: [] }, subsections: [] },
    { heading: 'Verdict', body: 'Choose by need.', chart_id: '', image_prompt: '', table: { caption: '', columns: [], rows: [] }, subsections: [] },
  ],
  item_list: { name: 'Top CRMs', items: [{ name: 'A', url: 'https://a.example', description: 'x' }, { name: 'B', url: '', description: 'y' }, { name: 'C', url: '', description: 'z' }] },
  faq: [{ question: 'Is it free?', answer: 'Partly.' }],
  charts: [
    { id: 'price chart', title: 'Price', unit: '$', source_url: 'https://a.example/pricing', source_title: 'A pricing', points: [{ label: 'A', value: 10 }, { label: 'B', value: 20 }] },
    { id: 'bad', title: 'No source', unit: '', source_url: 'not a url', source_title: '', points: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] },
  ],
  citations: [{ title: 'A', url: 'https://a.example' }, { title: 'bad', url: 'javascript:alert(1)' }],
};

describe('article', () => {
  it('parses, keeps only sourced charts and valid links', () => {
    const a = parseArticle(raw)!;
    expect(a.slug).toBe('best-crm-for-small-teams');
    expect(a.charts.map((c) => c.id)).toEqual(['price-chart']);
    expect(a.sections[0].chartId).toBe('price-chart');
    expect(a.sections[1].chartId).toBeNull();
    expect(a.citations).toHaveLength(1);
    expect(a.sections[1].table).toBeNull();
  });
  it('rejects thin drafts', () => expect(parseArticle({ ...raw, sections: raw.sections.slice(0, 2) })).toBeNull());
  it('lints every prose field', () => {
    const { doc, changes } = lintArticle(parseArticle(raw)!);
    expect(lintIssues(doc.directAnswer + doc.sections[0].body)).toEqual([]);
    expect(changes.emDash).toBe(1);
    expect(changes.filler).toBeGreaterThan(0);
  });
  it('renders markdown and html with assets', () => {
    const a = parseArticle(raw)!;
    const assets = { hero: { url: 'https://cdn/h.png', alt: 'Hero' }, 'chart-price-chart': { url: 'https://cdn/c.svg', alt: 'Chart' } };
    const md = renderArticleMarkdown(a, assets);
    expect(md).toContain('![Hero](https://cdn/h.png)');
    expect(md).toContain('| Tool | Price |');
    expect(md).toContain('## FAQ');
    expect(renderArticleHtml(a, assets)).toContain('<table><caption>Plans</caption>');
  });
  it('builds Article + ItemList + FAQPage JSON-LD', () => {
    const ld = buildArticleJsonLd(parseArticle(raw)!, { publisher: 'Acme' });
    expect(ld['@graph'].map((n) => n['@type'])).toEqual(['Article', 'ItemList', 'FAQPage']);
    expect(articleWordCount(parseArticle(raw)!)).toBeGreaterThan(10);
  });
  it('round-trips through sanitizeArticle', () => {
    const a = parseArticle(raw)!;
    expect(sanitizeArticle(a)).toEqual(a);
  });
});

describe('chart', () => {
  it('renders an escaped, accessible SVG', () => {
    const svg = renderBarChartSvg({ title: 'A <b> & B', unit: '%', sourceTitle: 'Src', points: [{ label: 'x', value: 40 }, { label: 'y', value: 80 }] });
    expect(svg).toContain('role="img"');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;');
    expect((svg.match(/<rect /g) ?? []).length).toBe(3);
  });
});

describe('analyzePage', () => {
  const html = `<html><head><title>Guide</title><meta property="article:modified_time" content="2026-11-01T00:00:00Z">
  <script type="application/ld+json">{"@graph":[{"@type":"Article"},{"@type":"FAQPage"}]}</script></head><body>
  <h1>Guide</h1><h2>What is it</h2><p>${'word '.repeat(300)} 45% of teams save $200.</p><h2>FAQ</h2><h3>Q1</h3><table><tr><td>1</td></tr></table><ul><li>a</li></ul><script>var x = "ignored words ignored";</script></body></html>`;
  it('extracts structure', () => {
    const s = analyzePage(html, new Date('2026-11-25T00:00:00Z'));
    expect(s.words).toBeGreaterThan(300);
    expect(s.words).toBeLessThan(330);
    expect(s).toMatchObject({ h2: 2, h3: 1, tables: 1, lists: 1, faq: true, ageDays: 24, schemaTypes: ['Article', 'FAQPage'] });
    expect(s.stats).toBeGreaterThanOrEqual(2);
  });
  it('summarises benchmarks', () => {
    const s = analyzePage(html);
    const sum = summarizeResearch([{ kind: 'cited', structure: s }, { kind: 'serp', structure: s }, { kind: 'serp', structure: null }]);
    expect(sum).toMatchObject({ analysed: 2, attempted: 3, pctTables: 100, pctFaqSchema: 100 });
  });
});
