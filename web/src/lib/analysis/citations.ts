/**
 * Citation normalization, dedupe and source-type classification
 * (docs/research/ai-engine-methodology.md sections 3.5 and 3.10).
 */
import type { Citation } from '../engines/types';
import { canonicalizeUrl, domainMatches, hostOf, registrableDomain } from './url';

export interface RawCitation {
  url: string;
  title?: string;
  snippet?: string;
  cited: boolean;
  spans?: Array<{ start: number; end: number }>;
}

/**
 * Normalize and dedupe raw citations by canonical URL. Position = order of first appearance.
 * A URL that is both consulted and cited is cited. Spans and the longest snippet are merged.
 */
export function buildCitations(raw: readonly RawCitation[]): Citation[] {
  const byKey = new Map<string, Citation>();
  for (const r of raw) {
    if (!r.url || !/^https?:\/\//i.test(r.url.trim())) continue;
    const urlCanonical = canonicalizeUrl(r.url);
    const existing = byKey.get(urlCanonical);
    if (existing) {
      existing.cited = existing.cited || r.cited;
      if (!existing.title && r.title) existing.title = r.title;
      if (r.snippet && (!existing.snippet || r.snippet.length > existing.snippet.length)) existing.snippet = r.snippet;
      if (r.spans?.length) existing.spans = [...(existing.spans ?? []), ...r.spans];
      continue;
    }
    byKey.set(urlCanonical, {
      url: r.url.trim(),
      urlCanonical,
      domain: registrableDomain(hostOf(urlCanonical) || urlCanonical),
      title: r.title || undefined,
      snippet: r.snippet || undefined,
      position: byKey.size + 1,
      cited: r.cited,
      spans: r.spans?.length ? [...r.spans] : undefined,
    });
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Source categories
// ---------------------------------------------------------------------------

export const SOURCE_CATEGORIES = [
  'owned',
  'competitor',
  'ugc_social',
  'video',
  'review_aggregator',
  'earned_media',
  'reference',
  'institutional',
  'marketplace_ecom',
  'other',
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

/** DB enum public.source_type is coarser; this maps the fine category onto it. */
export type DbSourceType = 'owned' | 'competitor' | 'earned' | 'ugc' | 'other';
export function toDbSourceType(c: SourceCategory): DbSourceType {
  switch (c) {
    case 'owned':
      return 'owned';
    case 'competitor':
      return 'competitor';
    case 'ugc_social':
    case 'video':
      return 'ugc';
    case 'review_aggregator':
    case 'earned_media':
    case 'reference':
    case 'institutional':
      return 'earned';
    default:
      return 'other';
  }
}

const DOMAIN_RULES: Array<[SourceCategory, readonly string[]]> = [
  ['ugc_social', ['reddit.com', 'quora.com', 'x.com', 'twitter.com', 'linkedin.com', 'facebook.com', 'instagram.com',
    'stackexchange.com', 'stackoverflow.com', 'medium.com', 'substack.com', 'threads.net', 'pinterest.com',
    'news.ycombinator.com', 'ycombinator.com', 'dev.to', 'hashnode.dev', 'tumblr.com', 'discord.com']],
  ['video', ['youtube.com', 'youtu.be', 'vimeo.com', 'tiktok.com', 'twitch.tv', 'dailymotion.com']],
  ['review_aggregator', ['g2.com', 'capterra.com', 'trustpilot.com', 'gartner.com', 'softwareadvice.com', 'getapp.com',
    'trustradius.com', 'yelp.com', 'tripadvisor.com', 'producthunt.com', 'glassdoor.com', 'sitejabber.com',
    'consumerreports.org', 'apps.apple.com', 'play.google.com', 'clutch.co', 'peerspot.com']],
  ['reference', ['wikipedia.org', 'wikidata.org', 'britannica.com', 'wikihow.com', 'merriam-webster.com',
    'investopedia.com', 'iso.org', 'w3.org', 'ietf.org', 'mdn.dev', 'developer.mozilla.org']],
  ['marketplace_ecom', ['amazon.com', 'amazon.co.uk', 'amazon.de', 'ebay.com', 'etsy.com', 'walmart.com', 'target.com',
    'bestbuy.com', 'aliexpress.com', 'shopify.com', 'costco.com', 'homedepot.com', 'ikea.com']],
  ['earned_media', ['nytimes.com', 'wsj.com', 'forbes.com', 'bloomberg.com', 'reuters.com', 'techcrunch.com',
    'theverge.com', 'wired.com', 'cnbc.com', 'bbc.co.uk', 'bbc.com', 'theguardian.com', 'businessinsider.com',
    'zdnet.com', 'cnet.com', 'pcmag.com', 'engadget.com', 'venturebeat.com', 'fastcompany.com', 'inc.com',
    'entrepreneur.com', 'hbr.org', 'axios.com', 'washingtonpost.com', 'ft.com', 'economist.com', 'tomsguide.com',
    'techradar.com', 'nerdwallet.com', 'wirecutter.com', 'cnn.com', 'apnews.com', 'npr.org', 'usatoday.com']],
];

const DOMAIN_INDEX = new Map<string, SourceCategory>();
for (const [cat, domains] of DOMAIN_RULES) for (const d of domains) DOMAIN_INDEX.set(d, cat);

/** URL-pattern rules evaluated before domain rules (host-level). */
const URL_PATTERN_RULES: Array<[RegExp, SourceCategory]> = [
  [/^https:\/\/(?:[a-z]+\.)?amazon\.[a-z.]+\/(?:[^/]+\/)?(?:dp|gp\/product)\//, 'marketplace_ecom'],
  [/^https:\/\/apps\.apple\.com\//, 'review_aggregator'],
  [/^https:\/\/play\.google\.com\/store\//, 'review_aggregator'],
  [/^https:\/\/[a-z]+\.wikipedia\.org\//, 'reference'],
];

export interface ClassifyContext {
  ownedDomains: readonly string[];
  /** competitor id -> its domains */
  competitorDomains: ReadonlyArray<{ competitorId: string; domains: readonly string[] }>;
  /** Cached categories from public.source_domains (rule|llm|manual). */
  cached?: ReadonlyMap<string, SourceCategory>;
}

export interface SourceClassification {
  category: SourceCategory;
  competitorId?: string;
  /** 'rule' | 'cache' | 'unknown' (unknown = candidate for the LLM classifier). */
  source: 'rule' | 'cache' | 'unknown';
}

export function classifySource(urlCanonical: string, domain: string, ctx: ClassifyContext): SourceClassification {
  if (domainMatches(domain, ctx.ownedDomains)) return { category: 'owned', source: 'rule' };
  for (const c of ctx.competitorDomains) {
    if (domainMatches(domain, c.domains)) return { category: 'competitor', competitorId: c.competitorId, source: 'rule' };
  }
  for (const [re, cat] of URL_PATTERN_RULES) if (re.test(urlCanonical)) return { category: cat, source: 'rule' };
  const host = hostOf(urlCanonical);
  const hit = DOMAIN_INDEX.get(host) ?? DOMAIN_INDEX.get(domain);
  if (hit) return { category: hit, source: 'rule' };
  const cached = ctx.cached?.get(domain);
  if (cached) return { category: cached, source: 'cache' };
  if (/\.(gov|mil)(\.[a-z]{2})?$/.test(domain) || /\.gov\.[a-z]{2}$/.test(host)) return { category: 'institutional', source: 'rule' };
  if (/\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$/.test(domain)) return { category: 'institutional', source: 'rule' };
  return { category: 'other', source: 'unknown' };
}
