import type { AuditCheck } from './analyze';

export const PLATFORMS = ['wordpress', 'webflow', 'shopify', 'wix', 'squarespace', 'hubspot', 'custom'] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Fix = { id: string; checkId: string; title: string; priority: 'critical' | 'high' | 'medium' | 'low'; why: string; steps: string[]; platform: Platform };

type Guide = { title: string; why: string; generic: string[]; by?: Partial<Record<Platform, string[]>> };

const GUIDES: Record<string, Guide> = {
  robots_ai_bots: {
    title: 'Allow AI search crawlers in robots.txt',
    why: 'Blocked bots cannot read your pages, so you cannot be cited.',
    generic: ['Open your robots.txt (yoursite.com/robots.txt).', 'Delete "Disallow: /" rules under GPTBot, OAI-SearchBot, ChatGPT-User, Claude-User, Claude-SearchBot, PerplexityBot, Google-Extended and Bingbot.', 'Add an explicit "User-agent: OAI-SearchBot" group with "Allow: /" if you want to be certain.', 'Re-run this audit.'],
    by: {
      wordpress: ['Go to Settings > Reading and make sure "Discourage search engines" is unticked.', 'If you use Yoast: SEO > Tools > File editor. Rank Math: General Settings > Edit robots.txt. Remove the AI bot Disallow lines and save.', 'Also check plugins such as Wordfence or "Block AI Bots" and disable their AI blocking option.'],
      webflow: ['Project Settings > SEO > robots.txt.', 'Remove the Disallow rules for the AI bots listed above and click Save, then Publish the site.'],
      shopify: ['Online Store > Themes > Edit code > Add a new template > robots.txt.liquid.', 'Remove or edit any lines that disallow AI bots, then save.'],
      wix: ['Marketing & SEO > SEO Tools > Robots.txt Editor.', 'Delete the AI bot Disallow lines and save.'],
      squarespace: ['Squarespace manages robots.txt. Under Settings > Crawlers, switch off "Block AI crawlers" (Website > Pages > Website Tools).'],
      hubspot: ['Settings > Website > Pages > SEO & Crawlers > robots.txt.', 'Remove the AI bot Disallow lines and save.'],
    },
  },
  robots_present: { title: 'Publish a robots.txt that lists your sitemap', why: 'It is the first file every crawler reads.', generic: ['Create a text file named robots.txt at the site root.', 'Add: "User-agent: *", "Allow: /", and "Sitemap: https://yoursite.com/sitemap.xml".'], by: { wordpress: ['Install Yoast SEO or Rank Math (both create a virtual robots.txt), or upload robots.txt to the site root via SFTP.'], webflow: ['Project Settings > SEO > robots.txt: paste the lines and publish.'], shopify: ['Shopify serves a default robots.txt. Customise it via a robots.txt.liquid template.'], wix: ['Marketing & SEO > SEO Tools > Robots.txt Editor.'] } },
  robots_homepage: { title: 'Stop blocking the whole site', why: '"Disallow: /" for all bots hides everything.', generic: ['Open robots.txt and remove "Disallow: /" under "User-agent: *".', 'Disallow only private paths such as /admin or /cart.'] },
  llms_txt: {
    title: 'Publish a valid llms.txt', why: 'A short Markdown map of your best pages helps AI assistants find and summarise the right content.',
    generic: ['Create a plain-text file named llms.txt at the site root.', 'Line 1: "# Your Company". Next: a "> one-sentence summary" blockquote.', 'Add "## Key pages" with a bullet list of [Page title](https://url): short description.', 'Add "## Blog" and "## Docs" sections the same way. Save as UTF-8 text, not HTML.'],
    by: { wordpress: ['Install the "LLMs.txt" or Yoast SEO plugin feature (Yoast > Settings > Site features > llms.txt) and enable it, or upload the file via SFTP to the folder that holds wp-config.php.'], webflow: ['Webflow cannot host root text files directly. Add a 301 redirect from /llms.txt to a hosted copy, or use a Cloudflare Worker / reverse proxy to serve it at /llms.txt.'], shopify: ['Settings > Content > Files: upload llms.txt, then add a URL redirect from /llms.txt to the file URL (Online Store > Navigation > URL redirects).'], wix: ['Wix cannot serve root text files. Use Cloudflare or another proxy to serve /llms.txt, or a Velo http-function route at /_functions/llms.'], squarespace: ['Upload llms.txt via Settings > Developer Tools > File Storage and add a URL mapping "/llms.txt -> /s/llms.txt 301".'], hubspot: ['Settings > Website > Domains & URLs > URL Redirects: redirect /llms.txt to the file uploaded in the Files tool.'], custom: ['Place llms.txt in the public/ (or static/) folder so it is served from the root.'] },
  },
  llms_full: { title: 'Optional: add llms-full.txt', why: 'Gives assistants the full text of key pages in one request.', generic: ['Create llms-full.txt next to llms.txt with the Markdown body of your most important pages.'] },
  sitemap_valid: { title: 'Provide a working XML sitemap', why: 'Sitemaps are how crawlers discover all your pages.', generic: ['Generate a sitemap.xml listing every public page.', 'Test that it opens in a browser and starts with <urlset> or <sitemapindex>.'], by: { wordpress: ['Yoast / Rank Math generate /sitemap_index.xml automatically: SEO > General > Features > XML sitemaps = On.'], webflow: ['Project Settings > SEO > Sitemap: toggle "Auto-generate sitemap" and publish.'], shopify: ['Shopify serves /sitemap.xml automatically. If it fails, check the store is not password-protected.'], wix: ['Wix generates /sitemap.xml automatically for published sites. Publish the site again.'], squarespace: ['Squarespace serves /sitemap.xml automatically; remove any redirect that overrides it.'], hubspot: ['Settings > Website > Pages > SEO & Crawlers: enable the sitemap.'] } },
  sitemap_declared: { title: 'Declare your sitemap in robots.txt', why: 'Lets every crawler find it without guessing.', generic: ['Add the line "Sitemap: https://yoursite.com/sitemap.xml" to robots.txt.'] },
  sitemap_fresh: { title: 'Keep sitemap <lastmod> dates accurate', why: 'Fresh dates tell AI crawlers which pages changed.', generic: ['Make sure your sitemap includes <lastmod> and that it updates when a page is edited.', 'Publish or refresh your key pages if the newest date is old.'], by: { wordpress: ['Use Yoast or Rank Math sitemaps; they set lastmod from the post modified date.'], webflow: ['Webflow sets lastmod on publish. Republish the site.'] } },
  ssr: { title: 'Serve content in the initial HTML', why: 'Most AI crawlers do not execute JavaScript.', generic: ['View source (not Inspect) on your homepage and check your text is there.', 'If not, enable server-side rendering or static generation for marketing pages, or add prerendering (e.g. Prerender.io).', 'Re-run this audit.'], by: { wordpress: ['Disable "lazy load content via JS" features in page builders, and exclude key pages from JS-only rendering plugins.'], webflow: ['Webflow renders server-side. Move interactions that inject text with custom JavaScript into native elements.'], wix: ['Wix renders on the server for most content. Avoid content that loads only via Velo code after page load.'], custom: ['Next.js/Nuxt/Astro: use SSR or SSG for these routes and avoid client-only components for primary copy.'] } },
  noindex: { title: 'Remove the noindex directive', why: 'Noindex pages are excluded from search and AI answers.', generic: ['Remove <meta name="robots" content="noindex"> from the page template.', 'Also check the X-Robots-Tag response header in your server/CDN config.'], by: { wordpress: ['Settings > Reading: untick "Discourage search engines". In Yoast, open the page > Advanced > "Allow search engines to show this page" = Yes.'], webflow: ['Page Settings > SEO Settings > uncheck "Exclude this page from search results". Also Project Settings > SEO > "Disable Webflow subdomain indexing" only applies to webflow.io.'], shopify: ['Remove noindex from theme.liquid. For a password-protected store, disable it under Preferences.'], wix: ['Pages > page menu > SEO basics > turn "Let search engines index this page" on.'], squarespace: ['Page settings > SEO > turn off "Hide page from search results".'] } },
  canonical: { title: 'Add a correct canonical tag', why: 'It consolidates duplicate URLs into one authoritative page.', generic: ['Add <link rel="canonical" href="https://yoursite.com/this-page"> in each page <head> pointing to the preferred URL on your own domain.'], by: { wordpress: ['Yoast/Rank Math add canonicals automatically; remove other plugins that override them.'], webflow: ['Page Settings > SEO Settings: add the canonical tag in Custom code > Inside <head>.'], shopify: ['Shopify adds canonicals via {{ canonical_url }} in theme.liquid; make sure it is present.'] } },
  schema_org: { title: 'Add Organization schema', why: 'Helps AI engines identify your brand and connect your profiles.', generic: ['Add a JSON-LD script on the homepage: {"@context":"https://schema.org","@type":"Organization","name":"…","url":"…","logo":"…","sameAs":[LinkedIn, X, …]}.', 'Validate at validator.schema.org.'], by: { wordpress: ['Yoast SEO > Settings > Site representation: fill in organization name, logo and social profiles. It outputs the schema.'], webflow: ['Project Settings > Custom code > Head code: paste the JSON-LD script inside <script type="application/ld+json">.'], shopify: ['Add the JSON-LD script to theme.liquid, or install a schema app.'], wix: ['Marketing & SEO > SEO Tools > Structured Data Markup: add the Organization JSON-LD.'], squarespace: ['Settings > Advanced > Code Injection > Header: paste the JSON-LD script.'], hubspot: ['Settings > Website > Pages > Templates > Site header HTML: paste the JSON-LD script.'] } },
  schema_content: { title: 'Add Article / FAQPage / Product schema', why: 'Structured content is easier for AI to quote accurately.', generic: ['Blog posts: add Article (headline, author, datePublished, dateModified).', 'Pages with Q&A: add FAQPage with the same questions shown on the page.', 'Product pages: add Product with offers and aggregateRating if real.'], by: { wordpress: ['Yoast/Rank Math output Article schema automatically. For FAQs, add the FAQ block in the editor.'], webflow: ['Use a CMS template Embed element to output JSON-LD with dynamic fields.'], shopify: ['Most themes output Product schema; for blog posts use a schema app or edit article.liquid.'] } },
  headings: { title: 'Fix the heading outline', why: 'Clear H1 > H2 > H3 structure helps AI chunk and cite your content.', generic: ['Use exactly one H1 (the page title).', 'Use H2 for sections and H3 inside them. Do not skip levels.', 'Phrase H2s like the questions your buyers ask.'] },
  author_date: { title: 'Show author and published/updated dates', why: 'AI engines favour content with clear authorship and freshness.', generic: ['Show a visible byline and a "Last updated" date on articles.', 'Mirror them in Article schema (author, datePublished, dateModified) and in <time datetime="…">.'], by: { wordpress: ['Appearance > Customize (or your theme options): enable post author and date. Yoast outputs them in schema.'], webflow: ['Add Author and Published date fields to the Blog collection and bind them in the template.'], shopify: ['Online Store > Themes > Customize > Blog posts: tick "Show author" and "Show date".'] } },
  internal_links: { title: 'Add more internal links', why: 'Links help crawlers and AI find related pages.', generic: ['Add at least 5 contextual links from each page to related pages, and link new posts from hub pages.'] },
  https: { title: 'Serve the whole site over HTTPS', why: 'Insecure pages are down-ranked and some crawlers skip them.', generic: ['Install an SSL certificate and 301-redirect every http:// URL to https://.'], by: { wordpress: ['Settings > General: set both addresses to https://. Use the Really Simple SSL plugin if needed.'], webflow: ['Project Settings > Hosting > Advanced publishing options: enable SSL and "Force SSL".'], shopify: ['Settings > Domains: enable "Redirect all traffic to this domain" and SSL.'], wix: ['Settings > Advanced > SSL: make sure HTTPS is enabled.'] } },
  hreflang: { title: 'Add hreflang for each language version', why: 'Points AI and search engines to the right language page.', generic: ['Add <link rel="alternate" hreflang="xx" href="…"> for every language variant, including self-reference and x-default.'] },
  page_weight: { title: 'Reduce HTML size', why: 'Very large pages are truncated or skipped by crawlers.', generic: ['Remove inline scripts/styles and unused page-builder markup; paginate long lists.'], by: { wordpress: ['Disable unused plugins/page-builder widgets and use a caching plugin that minifies HTML.'] } },
  image_alt: { title: 'Add alt text to images', why: 'Alt text is how AI understands images.', generic: ['Give every meaningful image a short descriptive alt attribute.'] },
  waf_bots: {
    title: 'Let AI crawlers through your WAF / CDN', why: 'Your firewall returns errors to AI bots even if robots.txt allows them.',
    generic: ['Find the firewall/bot-protection rule that blocks them (check the bot names listed above).', 'Add an allow rule for the official bot user agents (and verified IP ranges, which OpenAI, Anthropic, Perplexity and Bing publish).', 'Turn off "Block AI bots" toggles unless you really want that, then re-run this audit.'],
    by: { wordpress: ['If you use Wordfence: Firewall > Blocking > remove the AI user-agent rules. If Sucuri/Cloudflare sits in front, use the steps below for that service.'], webflow: ['Webflow sits behind Cloudflare. If you added your own Cloudflare proxy, use Security > Bots > "Block AI bots" = Off.'], shopify: ['Shopify bot protection cannot be configured per bot. Contact Shopify support or put the content on a path that allows bots.'], custom: ['Cloudflare: Security > Bots > set "Block AI Scrapers and Crawlers" to Off, or add a custom rule "Skip" for verified bots. AWS WAF: remove the Bot Control category rule or set it to Count. Akamai/Fastly: allowlist the user agents.'] },
  },
  perf_lcp: { title: 'Speed up Largest Contentful Paint', why: 'Slow pages are crawled less and cited less.', generic: ['Compress and properly size the hero image (WebP/AVIF), add fetchpriority="high", and remove render-blocking scripts.'], by: { wordpress: ['Install a caching plugin (WP Rocket, LiteSpeed Cache) and an image optimiser (ShortPixel, Imagify).'], webflow: ['Compress hero images, enable lazy loading for below-the-fold images only, and trim custom code.'], shopify: ['Compress hero images, remove unused apps, choose a lighter theme section for the hero.'] } },
  perf_cls: { title: 'Fix layout shift', why: 'Unstable layouts hurt user experience scores.', generic: ['Set width and height on images and embeds, and reserve space for ads/banners and web fonts (font-display: swap).'] },
  perf_inp: { title: 'Improve interaction latency', why: 'Heavy JavaScript delays interactions.', generic: ['Remove unused third-party scripts, defer non-critical JavaScript and split long tasks.'] },
  perf_ttfb: { title: 'Reduce server response time', why: 'A slow first byte delays everything and can cause crawler timeouts.', generic: ['Put a CDN and full-page caching in front of the site and upgrade slow hosting.'], by: { wordpress: ['Enable page caching and use a host with PHP 8.2+ and object caching.'], custom: ['Enable ISR/edge caching for marketing pages and check slow database calls.'] } },
};

const PRIORITY = (c: AuditCheck): Fix['priority'] => {
  const loss = (100 - c.score) * c.weight;
  return c.score < 40 && c.weight >= 8 ? 'critical' : loss >= 400 ? 'high' : loss >= 150 ? 'medium' : 'low';
};

export function detectPlatform(headers: Record<string, string>, html: string): Platform | null {
  const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]?.toLowerCase() ?? '';
  if (/wordpress/.test(gen) || /wp-content|wp-json/.test(html) || /wp-json/.test(headers.link ?? '')) return 'wordpress';
  if (/webflow/.test(gen) || /data-wf-(site|page)|webflow\.com/.test(html)) return 'webflow';
  if (/shopify/.test(headers['x-shopid'] ?? '') || /cdn\.shopify\.com|Shopify\.theme/.test(html)) return 'shopify';
  if (/wix/.test(gen) || /static\.wixstatic\.com|x-wix/.test(html + JSON.stringify(headers))) return 'wix';
  if (/squarespace/.test(gen) || /squarespace/i.test(html)) return 'squarespace';
  if (/hubspot/.test(gen) || /hs-scripts\.com|hubspot/i.test(html)) return 'hubspot';
  return null;
}

export const normalizePlatform = (v: unknown): Platform | null => (typeof v === 'string' && (PLATFORMS as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as Platform) : null);

/** Prioritized fix list for every check that is not passing; steps are specific to the platform when we have them. */
export function buildFixes(checks: AuditCheck[], platform: Platform | null): Fix[] {
  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const p = platform ?? 'custom';
  return checks
    .filter((c) => (c.status === 'fail' || c.status === 'warn') && GUIDES[c.id])
    .map((c) => {
      const g = GUIDES[c.id]!;
      const steps = g.by?.[p] ? g.by[p]! : g.generic;
      return { id: `fix_${c.id}`, checkId: c.id, title: g.title, priority: PRIORITY(c), why: `${g.why} (${c.detail})`, steps: steps.map((s, i) => `${i + 1}. ${s}`), platform: g.by?.[p] ? p : ('custom' as Platform) };
    })
    .sort((a, b) => order[a.priority] - order[b.priority]);
}
