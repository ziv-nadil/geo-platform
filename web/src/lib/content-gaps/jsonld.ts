/** schema.org JSON-LD for a listicle: ItemList + FAQPage in one @graph (pure). */
import type { ListicleDoc } from './listicle';

export type JsonLd = { '@context': 'https://schema.org'; '@graph': Record<string, unknown>[] };

export function buildJsonLd(doc: Pick<ListicleDoc, 'title' | 'metaDescription' | 'items' | 'faq'>, pageUrl: string | null): JsonLd {
  const graph: Record<string, unknown>[] = [{
    '@type': 'ItemList',
    name: doc.title,
    ...(doc.metaDescription ? { description: doc.metaDescription } : {}),
    ...(pageUrl ? { url: pageUrl } : {}),
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: doc.items.length,
    itemListElement: doc.items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      ...(it.url ? { url: it.url } : {}),
      ...(it.summary ? { description: it.summary } : {}),
    })),
  }];
  if (doc.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: doc.faq.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** Safe for embedding in HTML: no `</script>` or HTML comment breakouts. */
export function jsonLdScript(ld: JsonLd): string {
  const json = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<script type="application/ld+json">${json}</script>`;
}
