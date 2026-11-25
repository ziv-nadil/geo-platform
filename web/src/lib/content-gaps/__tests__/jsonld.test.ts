import { describe, expect, it } from 'vitest';
import { buildJsonLd, jsonLdScript } from '../jsonld';
import { parseListicle, renderMarkdown } from '../listicle';

const raw = {
  title: 'Top 3 CRMs for Startups', slug: '', meta_description: 'Compare CRMs.', intro: 'Intro',
  items: [
    { name: 'Acme', url: 'https://acme.com', summary: 'Ours', best_for: 'SMB', pros: ['fast'], cons: [], is_client: true },
    { name: 'Rival', url: 'javascript:alert(1)', summary: 'Theirs', best_for: 'Enterprise', pros: [], cons: ['pricey'], is_client: false },
    { name: 'Other', url: '', summary: 'x', best_for: 'y', pros: [], cons: [], is_client: false },
  ],
  comparison: { columns: ['Price', 'Setup'], rows: [{ item: 'Acme', values: ['$10 | mo', '1 day'] }, { item: 'Rival', values: ['$50'] }] },
  faq: [{ question: 'Which is cheapest?', answer: 'Acme.' }, { question: '', answer: 'dropped' }],
  citations: [{ title: 'G2', url: 'https://g2.com/x' }, { title: 'bad', url: 'nope' }],
  methodology: 'We tested.',
};

describe('listicle parser', () => {
  const doc = parseListicle(raw)!;
  it('clamps and validates', () => {
    expect(doc.slug).toBe('top-3-crms-for-startups');
    expect(doc.items[1].url).toBeNull(); // non-http(s) rejected
    expect(doc.faq).toHaveLength(1);
    expect(doc.citations).toHaveLength(1);
    expect(doc.comparison.rows[1].values).toEqual(['$50', '']);
  });
  it('rejects too-short lists', () => {
    expect(parseListicle({ ...raw, items: raw.items.slice(0, 2) })).toBeNull();
    expect(parseListicle(null)).toBeNull();
  });
  it('markdown has table with escaped pipes, FAQ and JSON-LD', () => {
    const md = renderMarkdown(doc, { jsonLd: true });
    expect(md).toContain('| Acme | $10 \\| mo | 1 day |');
    expect(md).toContain('### Which is cheapest?');
    expect(md).toContain('application/ld+json');
  });
});

describe('JSON-LD', () => {
  const doc = parseListicle(raw)!;
  const ld = buildJsonLd(doc, 'https://acme.com/blog/top-crms');
  it('emits ItemList with ordered positions', () => {
    const list = ld['@graph'][0] as { '@type': string; numberOfItems: number; itemListElement: { position: number; name: string }[]; url: string };
    expect(ld['@context']).toBe('https://schema.org');
    expect(list['@type']).toBe('ItemList');
    expect(list.numberOfItems).toBe(3);
    expect(list.itemListElement.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(list.url).toBe('https://acme.com/blog/top-crms');
  });
  it('emits FAQPage with Question/Answer', () => {
    expect(ld['@graph'][1]).toMatchObject({ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Which is cheapest?', acceptedAnswer: { '@type': 'Answer', text: 'Acme.' } }] });
  });
  it('omits FAQPage when no FAQ and escapes script breakouts', () => {
    expect(buildJsonLd({ ...doc, faq: [] }, null)['@graph']).toHaveLength(1);
    const evil = buildJsonLd({ ...doc, title: '</script><b>x' }, null);
    const html = jsonLdScript(evil);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain('\\u003c/script\\u003e');
  });
});
