import { SERIES } from "@/lib/ui/chart-colors";
import { ADMIN_ONLY_ORGS, CATALOG, DEMO_USER, ORGS, PLATFORM_SETTINGS } from "./catalog";
import { addDays, daysBack, hashString, mulberry32, pick, TODAY } from "./rng";
import type {
  ApiKey,
  Billing,
  BrandKit,
  ContentDraft,
  CrawlerBot,
  CrawlerPath,
  Creator,
  Integration,
  Invitation,
  LlmsTxtStatus,
  Member,
  Org,
  OutreachContact,
  PlatformSettings,
  Report,
  SiteIssue,
  SitePage,
  SiteProperty,
  SiteTask,
  TrendPoint,
  User,
} from "@/lib/ui/data-types";

const rngFor = (orgId: string, k: string) => mulberry32(hashString(`${orgId}:${k}`));
const brandOf = (orgId: string) => CATALOG[orgId]?.brand;

/* ------------------------------------------------------------------ orgs & session */

/** Client accounts visible in the org switcher for the current session. */
export async function listOrgs(): Promise<Org[]> {
  return ORGS;
}

export async function getOrgBySlug(slug: string): Promise<Org | null> {
  return [...ORGS, ...ADMIN_ONLY_ORGS].find((o) => o.slug === slug) ?? null;
}

export async function getSessionUser(): Promise<User> {
  return DEMO_USER;
}

/* ------------------------------------------------------------------ site health */

export async function getSiteProperties(orgId: string): Promise<SiteProperty[]> {
  const b = brandOf(orgId)!;
  return [
    { id: "p1", domain: `www.${b.domain}`, pagesCrawled: 412, score: 78, scorePrev: 71, lastAuditAt: "2026-11-23T02:10:00Z", status: "complete", issues: { critical: 4, warning: 17, notice: 38 } },
    { id: "p2", domain: orgId === "org_northwind" ? `docs.${b.domain}` : `help.${b.domain}`, pagesCrawled: 186, score: 64, scorePrev: 66, lastAuditAt: "2026-11-23T02:42:00Z", status: "complete", issues: { critical: 6, warning: 12, notice: 21 } },
  ];
}

export async function getSiteIssues(orgId: string): Promise<SiteIssue[]> {
  void orgId;
  const rows: Omit<SiteIssue, "id">[] = [
    { title: "AI crawlers blocked in robots.txt", description: "GPTBot and ClaudeBot are disallowed on /blog/, so answers cannot cite your articles.", severity: "critical", category: "Crawlability", pages: 64, status: "open", firstSeen: "2026-10-28", howToFix: "Remove the Disallow rules for GPTBot, ClaudeBot and PerplexityBot on /blog/ and /docs/, or allow them explicitly." },
    { title: "Key pages render content only with JavaScript", description: "Pricing and comparison pages return an empty shell without JS. Most AI crawlers do not execute JavaScript.", severity: "critical", category: "AI readability", pages: 9, status: "in_progress", firstSeen: "2026-10-30", howToFix: "Server-render or statically generate these pages so the HTML contains the full text." },
    { title: "Broken internal links (404)", description: "Internal links point to pages that return 404.", severity: "critical", category: "Links", pages: 23, status: "open", firstSeen: "2026-11-02", howToFix: "Update or redirect the broken URLs. See the affected pages list." },
    { title: "Missing Organization schema", description: "The homepage lacks Organization structured data with sameAs links.", severity: "critical", category: "Structured data", pages: 1, status: "open", firstSeen: "2026-10-26", howToFix: "Add JSON-LD Organization markup with name, logo, url and sameAs profiles." },
    { title: "No llms.txt index", description: "/llms.txt returns 404 on the docs subdomain.", severity: "warning", category: "AI readability", pages: 1, status: "open", firstSeen: "2026-10-26", howToFix: "Publish /llms.txt with a short summary and links to your most important pages." },
    { title: "FAQ content without FAQPage schema", description: "Pages with question-and-answer sections lack FAQPage markup.", severity: "warning", category: "Structured data", pages: 31, status: "open", firstSeen: "2026-11-01", howToFix: "Add FAQPage JSON-LD that mirrors the visible questions and answers." },
    { title: "Thin content (< 300 words)", description: "Pages with little text are rarely cited by AI answers.", severity: "warning", category: "Content", pages: 42, status: "open", firstSeen: "2026-10-26", howToFix: "Expand with specifics: numbers, comparisons, steps and sources." },
    { title: "Duplicate title tags", description: "Several pages share the same <title>.", severity: "warning", category: "Content", pages: 18, status: "ignored", firstSeen: "2026-10-26", howToFix: "Give each page a unique, descriptive title." },
    { title: "Slow server response (TTFB > 800 ms)", description: "Slow responses cause crawlers to time out and reduce crawl budget.", severity: "warning", category: "Performance", pages: 27, status: "open", firstSeen: "2026-11-05", howToFix: "Cache HTML at the edge and check slow database queries." },
    { title: "Images missing alt text", description: "Alt text helps multimodal models understand product images.", severity: "notice", category: "AI readability", pages: 88, status: "open", firstSeen: "2026-10-26", howToFix: "Add short, descriptive alt text to product and diagram images." },
    { title: "Missing last-modified dates", description: "Articles don't show a visible updated date. Engines favour fresh sources.", severity: "notice", category: "Content", pages: 54, status: "open", firstSeen: "2026-10-26", howToFix: "Show a visible 'Updated' date and add dateModified to Article schema." },
    { title: "Redirect chains", description: "URLs redirect more than once before resolving.", severity: "notice", category: "Crawlability", pages: 12, status: "fixed", firstSeen: "2026-10-26", howToFix: "Point links and redirects straight to the final URL." },
  ];
  return rows.map((r, i) => ({ ...r, id: `iss${i + 1}` }));
}

export async function getSitePages(orgId: string): Promise<SitePage[]> {
  const b = brandOf(orgId)!;
  const rng = rngFor(orgId, "pages");
  const paths = [...(CATALOG[orgId]?.ownedPaths ?? []), "/about", "/careers", "/legal/privacy", "/blog/old-post-2021", "/blog/announcement", "/contact"];
  return paths.map((p) => {
    const status = p.includes("old-post") ? 404 : p === "/careers" ? 301 : 200;
    return {
      url: `https://www.${b.domain}${p}`,
      statusCode: status,
      title: p === "/" ? b.name : p.split("/").filter(Boolean).pop()!.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      issues: status !== 200 ? 1 : Math.floor(rng() * 6),
      words: status !== 200 ? 0 : Math.round(150 + rng() * 2200),
      schema: rng() > 0.5 ? ["Article"] : rng() > 0.5 ? ["Product", "FAQPage"] : [],
      aiCrawled: rng() > 0.3,
      lastCrawled: addDays(TODAY, -Math.floor(rng() * 6)),
      loadMs: Math.round(280 + rng() * 1200),
    };
  });
}

export async function getSiteTasks(orgId: string): Promise<SiteTask[]> {
  void orgId;
  return [
    { id: "tk1", title: "Allow GPTBot, ClaudeBot and PerplexityBot on /blog/", issueId: "iss1", assignee: "Dev team", due: "2026-11-28", status: "in_progress", priority: "high" },
    { id: "tk2", title: "Server-render pricing and comparison pages", issueId: "iss2", assignee: "Priya Raman", due: "2026-12-05", status: "todo", priority: "high" },
    { id: "tk3", title: "Add Organization JSON-LD to homepage", issueId: "iss4", assignee: "Maya Okafor", due: "2026-11-26", status: "todo", priority: "high" },
    { id: "tk4", title: "Publish llms.txt on docs subdomain", issueId: "iss5", assignee: "Maya Okafor", due: "2026-12-01", status: "todo", priority: "medium" },
    { id: "tk5", title: "Fix redirect chains in navigation", issueId: "iss12", assignee: "Dev team", due: "2026-11-18", status: "done", priority: "low" },
  ];
}

/* ------------------------------------------------------------------ AI crawlers */

const BOTS: Omit<CrawlerBot, "hits" | "hitsPrev" | "lastSeen" | "color">[] = [
  { id: "gptbot", name: "GPTBot", operator: "OpenAI", purpose: "training", blocked: false },
  { id: "oai-searchbot", name: "OAI-SearchBot", operator: "OpenAI", purpose: "search", blocked: false },
  { id: "chatgpt-user", name: "ChatGPT-User", operator: "OpenAI", purpose: "user", blocked: false },
  { id: "perplexitybot", name: "PerplexityBot", operator: "Perplexity", purpose: "search", blocked: false },
  { id: "claudebot", name: "ClaudeBot", operator: "Anthropic", purpose: "training", blocked: true },
  { id: "claude-user", name: "Claude-User", operator: "Anthropic", purpose: "user", blocked: false },
  { id: "google-extended", name: "Google-Extended", operator: "Google", purpose: "training", blocked: false },
  { id: "bingbot", name: "Bingbot", operator: "Microsoft", purpose: "search", blocked: false },
  { id: "applebot-extended", name: "Applebot-Extended", operator: "Apple", purpose: "training", blocked: false },
  { id: "ccbot", name: "CCBot", operator: "Common Crawl", purpose: "training", blocked: true },
];
const BOT_SCALE: Record<string, number> = { gptbot: 520, "oai-searchbot": 310, "chatgpt-user": 240, perplexitybot: 280, claudebot: 60, "claude-user": 90, "google-extended": 180, bingbot: 420, "applebot-extended": 70, ccbot: 30 };

export async function getCrawlerBots(orgId: string, range: number): Promise<CrawlerBot[]> {
  const rng = rngFor(orgId, `bots${range}`);
  return BOTS.map((b, i) => {
    const per = BOT_SCALE[b.id]! * (orgId === "org_fernhill" ? 0.7 : 1);
    const hits = Math.round(per * range * (0.85 + rng() * 0.3));
    return { ...b, color: SERIES[i % SERIES.length]!, hits, hitsPrev: Math.round(hits * (0.7 + rng() * 0.5)), lastSeen: `${TODAY}T0${Math.floor(rng() * 9)}:${10 + Math.floor(rng() * 49)}:00Z` };
  }).sort((a, b) => b.hits - a.hits);
}

/** Daily hits for the top bots, grouped by operator to keep the chart at ≤ 5 series. */
export async function getCrawlerTrend(orgId: string, range: number): Promise<TrendPoint[]> {
  const rng = rngFor(orgId, `trend${range}`);
  const ops = ["OpenAI", "Perplexity", "Google", "Microsoft", "Anthropic"] as const;
  const scale = { OpenAI: 1070, Perplexity: 280, Google: 180, Microsoft: 420, Anthropic: 150 };
  const m = orgId === "org_fernhill" ? 0.7 : 1;
  return daysBack(range).map((date, i) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const wk = weekday === 0 || weekday === 6 ? 0.78 : 1;
    const p: TrendPoint = { date };
    for (const o of ops) p[o] = Math.round(scale[o] * m * wk * (0.8 + rng() * 0.35) * (1 + (i / range) * 0.25));
    return p;
  });
}

export async function getCrawlerPaths(orgId: string): Promise<CrawlerPath[]> {
  const rng = rngFor(orgId, "paths");
  const paths = [...(CATALOG[orgId]?.ownedPaths ?? []), "/robots.txt", "/sitemap.xml", "/llms.txt"];
  return paths
    .map((path) => ({
      path,
      hits: Math.round(200 + rng() * 4200),
      bots: ["GPTBot", "PerplexityBot", "OAI-SearchBot", "Bingbot", "ChatGPT-User"].filter(() => rng() > 0.45).slice(0, 3),
      status: path === "/llms.txt" && orgId === "org_fernhill" ? 404 : 200,
    }))
    .sort((a, b) => b.hits - a.hits);
}

export async function getLlmsTxt(orgId: string): Promise<LlmsTxtStatus> {
  const b = brandOf(orgId)!;
  const ok = orgId === "org_northwind";
  return {
    url: `https://www.${b.domain}/llms.txt`,
    reachable: ok,
    statusCode: ok ? 200 : 404,
    lastChecked: `${TODAY}T05:00:00Z`,
    linksTotal: ok ? 46 : 0,
    linksBroken: ok ? 2 : 0,
    sizeKb: ok ? 7.4 : 0,
    fullVersion: false,
  };
}

/* ------------------------------------------------------------------ content */

export async function getBrandKit(orgId: string): Promise<BrandKit> {
  const b = brandOf(orgId)!;
  if (orgId === "org_fernhill")
    return {
      name: b.name,
      voice: "Warm, practical and outdoorsy. We talk like an experienced friend at the trailhead: honest about trade-offs, never preachy about sustainability.",
      audience: "UK hikers and campers aged 25–55 who buy fewer, better things and care about repairability.",
      perspective: "first_plural",
      terminology: [
        { use: "waterproof jacket", avoid: "rain mac" },
        { use: "PFC-free", avoid: "eco-friendly (unqualified)" },
        { use: "resoleable", avoid: "lasts forever" },
      ],
      channel: "blog",
      locale: "en-GB",
      disclosures: "Affiliate links are marked. Product tests are done by our staff on UK trails.",
      tone: { formal: 30, playful: 45, technical: 55, confident: 70 },
      rules: ["Use British spelling.", "Give measurements in metric with imperial in brackets.", "Name competitors only in comparison pages.", "Every claim about durability links to a test or warranty page."],
    };
  return {
    name: b.name,
    voice: "Clear, confident and specific. Explain analytics concepts plainly, show the query or chart, avoid hype.",
    audience: "Product managers and data engineers at B2B SaaS companies with 50–1,000 employees.",
    perspective: "first_plural",
    terminology: [
      { use: "warehouse-native", avoid: "zero-copy magic" },
      { use: "product analytics", avoid: "BI tool" },
      { use: "events", avoid: "hits" },
    ],
    channel: "blog",
    locale: "en-US",
    disclosures: "Pricing correct as of publication date. Benchmarks link to their methodology.",
    tone: { formal: 55, playful: 20, technical: 75, confident: 80 },
    rules: ["Lead with the answer in the first two sentences.", "Use one H1 and descriptive H2s phrased as questions.", "Include a comparison table on every alternatives page.", "Cite at least two third-party sources."],
  };
}

export async function getContentDrafts(orgId: string): Promise<ContentDraft[]> {
  const nw = orgId === "org_northwind";
  const rows: [string, ContentDraft["type"], string, ContentDraft["status"], number][] = nw
    ? [
        ["Lumetric alternatives: 7 tools compared for 2026", "comparison", "Lumetric alternatives", "review", 2450],
        ["What is warehouse-native product analytics?", "article", "What is warehouse-native product analytics?", "published", 1820],
        ["Product analytics on Snowflake: a setup guide", "article", "Product analytics on top of Snowflake", "drafting", 1200],
        ["Session replay and GDPR: an FAQ", "faq", "Session replay that respects GDPR and masks PII", "idea", 0],
        ["Best product analytics tools for PLG teams", "listicle", "Best analytics tool for product-led growth", "review", 2100],
      ]
    : [
        ["Best waterproof hiking boots for wide feet (tested)", "listicle", "Best waterproof hiking boots for wide feet", "review", 2300],
        ["Hydrostatic head explained: what 20,000mm means", "article", "What does 20,000mm waterproof rating mean?", "published", 1500],
        ["PFC-free waterproofs that work in UK rain", "comparison", "PFC-free waterproof jackets that actually work", "drafting", 900],
        ["Our lifetime repair programme: FAQ", "faq", "Outdoor brands with lifetime repair programs", "idea", 0],
      ];
  return rows.map(([title, type, targetPrompt, status, words], i) => ({ id: `cd${i + 1}`, title, type, targetPrompt, status, words, updatedAt: addDays(TODAY, -i * 2), owner: i % 2 ? "Priya Raman" : "Maya Okafor" }));
}

/* ------------------------------------------------------------------ creators */

export async function getCreators(orgId: string): Promise<Creator[]> {
  const rng = rngFor(orgId, "creators");
  const comps = CATALOG[orgId]?.competitors.map((c) => c.name) ?? [];
  const nw = orgId === "org_northwind";
  const yt = nw ? ["Data Daily", "The PM Lab", "Analytics Engineering Weekly", "Startup Metrics", "SaaS Growth Club", "Query Craft"] : ["Trail Talk UK", "Wild Camp Wales", "Gear Geek Outdoors", "Peak District Walks", "Lightpack Liz", "Hills & Hollows"];
  const tt = nw ? ["@pm.daniel", "@datawithmia", "@growthloops", "@sqlsnacks"] : ["@hikewithhana", "@campcookuk", "@scottishmunros", "@gearfixer"];
  const topics = CATALOG[orgId]?.topics ?? [];
  const mk = (platform: Creator["platform"], name: string, i: number): Creator => ({
    id: `${platform}${i}`,
    platform,
    name: platform === "tiktok" ? name.slice(1) : name,
    handle: platform === "tiktok" ? name : `@${name.toLowerCase().replace(/[^a-z]/g, "")}`,
    followers: Math.round((platform === "youtube" ? 20_000 : 40_000) + rng() * 480_000),
    avgViews: Math.round(4_000 + rng() * 120_000),
    relevance: Math.round(55 + rng() * 44),
    topics: [pick(rng, topics), pick(rng, topics)].filter((v, j, a) => a.indexOf(v) === j),
    mentionsBrand: rng() > 0.7,
    mentionsCompetitors: comps.filter(() => rng() > 0.65).slice(0, 2),
    lastPost: addDays(TODAY, -Math.floor(rng() * 20)),
    status: pick(rng, ["new", "new", "shortlisted", "contacted", "partner"] as const),
  });
  return [...yt.map((n, i) => mk("youtube", n, i)), ...tt.map((n, i) => mk("tiktok", n, i))].sort((a, b) => b.relevance - a.relevance);
}

/* ------------------------------------------------------------------ outreach */

export async function getOutreachContacts(orgId: string): Promise<OutreachContact[]> {
  const nw = orgId === "org_northwind";
  const rows: [string, string, string, string, OutreachContact["stage"], number][] = nw
    ? [
        ["Hannah Cole", "Senior Editor", "G2 Research", "g2.com", "replied", 412],
        ["Marcus Lee", "Moderator", "r/ProductManagement", "reddit.com", "contacted", 388],
        ["Priya Desai", "Writer", "Lenny's Newsletter", "lennysnewsletter.com", "prospect", 126],
        ["Tom Becker", "Reporter", "TechCrunch", "techcrunch.com", "negotiating", 94],
        ["Aiko Tanaka", "Analyst", "Capterra", "capterra.com", "won", 201],
        ["Jordan Price", "Author", "Medium · Better Programming", "medium.com", "prospect", 150],
        ["Elena Rossi", "Community lead", "TrustRadius", "trustradius.com", "lost", 40],
      ]
    : [
        ["Sam Hughes", "Gear Editor", "OutdoorGearLab", "outdoorgearlab.com", "negotiating", 380],
        ["Rhian Evans", "Product Tester", "Which?", "which.co.uk", "contacted", 160],
        ["Owen Clarke", "Outdoors Writer", "The Guardian", "theguardian.com", "prospect", 140],
        ["Fiona Grant", "Forum Admin", "UKHillwalking", "ukhillwalking.com", "replied", 210],
        ["Dev Patel", "Editor", "Trekking Life", "trekkinglife.co.uk", "won", 98],
        ["Laura Kim", "Moderator", "r/UKhiking", "reddit.com", "prospect", 420],
      ];
  return rows.map(([name, role, publication, domain, stage, domainCitations], i) => ({
    id: `oc${i + 1}`,
    name,
    role,
    publication,
    domain,
    email: `${name.split(" ")[0]!.toLowerCase()}@${domain}`,
    stage,
    citedBy: (["chatgpt", "perplexity", "gemini", "claude", "google_aio"] as const).filter((_, j) => (i + j) % 2 === 0),
    domainCitations,
    lastTouch: addDays(TODAY, -(i * 3 + 1)),
    owner: i % 2 ? "Priya Raman" : "Maya Okafor",
    notes: stage === "won" ? "Updated comparison page includes us." : stage === "lost" ? "Declined: no vendor updates this quarter." : "",
  }));
}

/* ------------------------------------------------------------------ reports */

export async function getReports(orgId: string): Promise<Report[]> {
  const b = brandOf(orgId)!;
  return [
    { id: "r1", name: "Weekly visibility digest", cadence: "weekly", lastSentAt: "2026-11-24T08:00:00Z", nextRunAt: "2026-12-01T08:00:00Z", recipients: [`marketing@${b.domain}`, "maya@beacon-geo.example"], format: "slack", sections: ["Overview", "Top movers", "Competitors"] },
    { id: "r2", name: "Monthly executive report", cadence: "monthly", lastSentAt: "2026-11-01T09:00:00Z", nextRunAt: "2026-12-01T09:00:00Z", recipients: [`ceo@${b.domain}`, `cmo@${b.domain}`], format: "pdf", sections: ["Overview", "Share of voice", "Citations", "Site health", "Next steps"] },
    { id: "r3", name: "Q4 baseline audit", cadence: "one_off", lastSentAt: "2026-10-05T10:00:00Z", nextRunAt: null, recipients: [`cmo@${b.domain}`], format: "link", sections: ["Prompts", "Competitors", "Citations", "Site health", "AI crawlers"] },
  ];
}

/* ------------------------------------------------------------------ settings */

export async function getMembers(orgId: string): Promise<Member[]> {
  // Platform admins are never members of a client org and never listed here.
  const b = brandOf(orgId)!;
  const people: [string, Member["role"]][] =
    orgId === "org_northwind"
      ? [["Jonas Weber", "owner"], ["Priya Raman", "admin"], ["Alex Chen", "editor"], ["Sofia Marquez", "viewer"]]
      : [["Eleanor Hart", "owner"], ["Callum Reid", "admin"], ["Nia Thomas", "editor"], ["Ben Ashworth", "editor"], ["Grace Liu", "viewer"]];
  return people.map(([name, role], i) => ({
    userId: `${orgId}_u${i}`,
    name,
    email: `${name.split(" ")[0]!.toLowerCase()}@${b.domain}`,
    role,
    lastActiveAt: addDays(TODAY, -i * 2),
    mfa: i !== 3,
  }));
}

export async function getInvitations(orgId: string): Promise<Invitation[]> {
  const b = brandOf(orgId)!;
  return [
    { id: "inv1", email: `ravi@${b.domain}`, role: "editor", invitedBy: "Priya Raman", sentAt: "2026-11-21", expiresAt: "2026-11-28", status: "pending" },
    { id: "inv2", email: `contractor@agency.example`, role: "viewer", invitedBy: "Jonas Weber", sentAt: "2026-11-02", expiresAt: "2026-11-09", status: "expired" },
  ];
}

export async function getApiKeys(orgId: string): Promise<ApiKey[]> {
  void orgId;
  return [
    { id: "k1", name: "Looker Studio connector", prefix: "bgeo_live_7Hc2", scopes: ["read:metrics", "read:prompts"], createdAt: "2026-09-02", lastUsedAt: "2026-11-24T05:31:00Z", createdBy: "Priya Raman" },
    { id: "k2", name: "Zapier: new prompts", prefix: "bgeo_live_Qx91", scopes: ["write:prompts"], createdAt: "2026-10-14", lastUsedAt: null, createdBy: "Jonas Weber" },
  ];
}

export async function getIntegrations(orgId: string): Promise<Integration[]> {
  const nw = orgId === "org_northwind";
  return [
    { id: "gsc", name: "Google Search Console", stepId: "gsc", status: "pass", detail: "Owner access verified", lastCheckedAt: "2026-11-24T04:00:00Z" },
    { id: "ga4", name: "Google Analytics 4", stepId: "ga4", status: nw ? "pass" : "partial", detail: nw ? "Key event demo_request found" : "Viewer role. Editor needed to create key events.", lastCheckedAt: "2026-11-24T04:00:00Z" },
    { id: "bing", name: "Bing Webmaster Tools", stepId: "bing", status: "pass", detail: "Site verified", lastCheckedAt: "2026-11-23T04:00:00Z" },
    { id: "github", name: "GitHub", stepId: "github", status: nw ? "pass" : "idle", detail: nw ? "Write access to northwind/website" : "Skipped: Shopify store", lastCheckedAt: nw ? "2026-11-22T10:00:00Z" : null },
    { id: "cms", name: nw ? "Sanity" : "Shopify", stepId: "cms", status: nw ? "pass" : "partial", detail: nw ? "Editor token can create drafts" : "Read-only. Blog write scope missing.", lastCheckedAt: "2026-11-22T10:00:00Z" },
    { id: "dns", name: "DNS (TXT record)", stepId: "dns", status: "pass", detail: "_beacon-verify record found", lastCheckedAt: "2026-11-20T10:00:00Z" },
    { id: "cloudflare", name: "Cloudflare", stepId: "cdn_crawlers", status: nw ? "pass" : "fail", detail: nw ? "Logs read token valid" : "Token rejected (401). Create a new read-only token.", lastCheckedAt: "2026-11-24T04:00:00Z" },
    { id: "slack", name: "Slack", stepId: "chat", status: nw ? "pass" : "idle", detail: nw ? "Posting to #geo-reports" : "Not connected", lastCheckedAt: nw ? "2026-11-24T08:00:00Z" : null },
  ];
}

export async function getBilling(orgId: string): Promise<Billing> {
  const org = [...ORGS, ...ADMIN_ONLY_ORGS].find((o) => o.id === orgId)!;
  const plans = { starter: ["Starter", 290, 60, 100], growth: ["Growth", 790, 140, 250], scale: ["Scale", 1490, 175, 500], enterprise: ["Enterprise", 3500, 180, 2000] } as const;
  const [planName, basePrice, pricePerSeat, promptsLimit] = plans[org.plan];
  return {
    plan: org.plan,
    planName,
    basePrice,
    pricePerSeat,
    seats: org.seats,
    seatsUsed: org.seatsUsed,
    renewsAt: "2026-12-03",
    promptsLimit,
    promptsUsed: CATALOG[orgId]?.prompts.length ?? 0,
    paymentMethod: "Visa ending 4242",
    invoices: [0, 1, 2, 3, 4].map((i) => ({
      id: `in_${i}`,
      number: `BGEO-${2026}-${String(110 - i * 7).padStart(4, "0")}`,
      date: addDays("2026-11-03", -30 * i),
      amount: org.mrr,
      status: i === 0 ? "open" : "paid",
    })),
  };
}

/* ------------------------------------------------------------------ admin */

export async function listAllAccounts(): Promise<Org[]> {
  return [...ORGS, ...ADMIN_ONLY_ORGS];
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return PLATFORM_SETTINGS;
}

export async function getPlatformAdmins(): Promise<User[]> {
  return [DEMO_USER, { id: "u_admin2", name: "Daniel Brooks", email: "daniel@beacon-geo.example", isPlatformAdmin: true }];
}
