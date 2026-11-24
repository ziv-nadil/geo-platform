import { BRAND_SERIES, COMPETITOR_SERIES } from "@/lib/ui/chart-colors";
import type { Competitor, Funnel, Org, PlatformSettings, SourceType, User } from "@/lib/ui/data-types";

/**
 * Static demo catalog: client accounts, the demo session user, competitors, tracked
 * prompts and the pools of domains AI engines cite. All names are fictional.
 */

export const DEMO_USER: User = {
  id: "u_demo_admin",
  name: "Maya Okafor",
  email: "maya@beacon-geo.example",
  isPlatformAdmin: true,
};

export const ORGS: Org[] = [
  {
    id: "org_northwind",
    slug: "northwind",
    name: "Northwind Analytics",
    domain: "northwind-analytics.com",
    industry: "B2B SaaS · Product analytics",
    color: "#1f4fa8",
    plan: "growth",
    seats: 5,
    seatsUsed: 4,
    mrr: 1490,
    health: "healthy",
    onboardingPct: 86,
    lastRunAt: "2026-11-24T06:12:00Z",
    createdAt: "2026-08-03",
    hasData: true,
    status: "active",
    locale: "en-US",
  },
  {
    id: "org_fernhill",
    slug: "fernhill",
    name: "Fernhill Outdoor",
    domain: "fernhilloutdoor.com",
    industry: "DTC e-commerce · Outdoor gear",
    color: "#3f6b2a",
    plan: "scale",
    seats: 8,
    seatsUsed: 5,
    mrr: 2890,
    health: "attention",
    onboardingPct: 64,
    lastRunAt: "2026-11-24T06:40:00Z",
    createdAt: "2026-09-15",
    hasData: true,
    status: "active",
    locale: "en-GB",
  },
];

/** Accounts visible only in the super-admin console (no dashboard data yet). */
export const ADMIN_ONLY_ORGS: Org[] = [
  {
    id: "org_halcyon",
    slug: "halcyon-health",
    name: "Halcyon Health",
    domain: "halcyonhealth.example",
    industry: "Digital health",
    color: "#8a3b8f",
    plan: "growth",
    seats: 5,
    seatsUsed: 2,
    mrr: 1490,
    health: "attention",
    onboardingPct: 31,
    lastRunAt: null,
    createdAt: "2026-11-12",
    hasData: false,
    status: "onboarding",
    locale: "en-US",
  },
  {
    id: "org_tidewater",
    slug: "tidewater-legal",
    name: "Tidewater Legal",
    domain: "tidewaterlegal.example",
    industry: "Professional services",
    color: "#9a5b13",
    plan: "starter",
    seats: 3,
    seatsUsed: 3,
    mrr: 590,
    health: "at_risk",
    onboardingPct: 100,
    lastRunAt: "2026-11-17T06:05:00Z",
    createdAt: "2026-06-21",
    hasData: false,
    status: "paused",
    locale: "en-US",
  },
  {
    id: "org_orbitly",
    slug: "orbitly",
    name: "Orbitly",
    domain: "orbitly.example",
    industry: "Fintech · Payments API",
    color: "#0f6e6e",
    plan: "enterprise",
    seats: 15,
    seatsUsed: 9,
    mrr: 6200,
    health: "healthy",
    onboardingPct: 93,
    lastRunAt: "2026-11-24T05:58:00Z",
    createdAt: "2026-04-02",
    hasData: false,
    status: "active",
    locale: "en-US",
  },
];

export const PLATFORM_SETTINGS: PlatformSettings = {
  defaultEngines: ["chatgpt", "perplexity", "gemini", "claude", "google_aio"],
  runCadence: "daily",
  agencyEmail: "geo-ops@beacon-geo.example",
  agencyGithubUser: "beacon-geo-bot",
  adsManagerId: "123-456-7890",
  awsPrincipalArn: "arn:aws:iam::111122223333:role/beacon-geo-worker",
  dataRetentionDays: 395,
  maintenanceMode: false,
};

/** Per-org values substituted into onboarding instruction placeholders. */
export function onboardingPlaceholders(org: Org): Record<string, string> {
  const short = org.slug.replace(/[^a-z0-9]/g, "").slice(0, 12);
  return {
    AGENCY_EMAIL: PLATFORM_SETTINGS.agencyEmail,
    AGENCY_GITHUB_USER: PLATFORM_SETTINGS.agencyGithubUser,
    SERVICE_ACCOUNT_EMAIL: `beacon-${short}@beacon-geo-${short}.iam.gserviceaccount.com`,
    DNS_TXT_NAME: "_beacon-verify",
    DNS_TXT_VALUE: `beacon-site-verification=${org.id.slice(4, 8)}7f3c9a1e2b${short.slice(0, 4)}d84c6`,
    AWS_PRINCIPAL_ARN: PLATFORM_SETTINGS.awsPrincipalArn,
    AWS_EXTERNAL_ID: `bgeo-${short}-5c1e9d27`,
    ADS_MANAGER_ID: PLATFORM_SETTINGS.adsManagerId,
  };
}

interface OrgCatalog {
  brand: Competitor;
  competitors: (Competitor & { strength: number })[];
  topics: string[];
  personas: string[];
  prompts: { text: string; topic: string; persona: string; funnel: Funnel; strength: number }[];
  ownedPaths: string[];
}

const mkComp = (orgSlug: string, list: [string, string, number][]) =>
  list.map(([name, domain, strength], i) => ({
    id: `${orgSlug}_c${i + 1}`,
    name,
    domain,
    color: COMPETITOR_SERIES[i % COMPETITOR_SERIES.length]!,
    strength,
  }));

type P = [string, number, number, Funnel, number];
const mkPrompts = (topics: string[], personas: string[], rows: P[]) =>
  rows.map(([text, t, p, funnel, strength]) => ({ text, topic: topics[t]!, persona: personas[p]!, funnel, strength }));

const NW_TOPICS = ["Product analytics", "Session replay", "Experimentation", "Warehouse-native", "Pricing & alternatives"];
const NW_PERSONAS = ["Head of Product", "Data engineer", "Growth marketer", "CTO"];

const FH_TOPICS = ["Hiking boots", "Tents & shelter", "Rain jackets", "Sustainability", "Backpacks"];
const FH_PERSONAS = ["Weekend hiker", "Thru-hiker", "Family camper", "Gift buyer"];

export const CATALOG: Record<string, OrgCatalog> = {
  org_northwind: {
    brand: { id: "brand", name: "Northwind Analytics", domain: "northwind-analytics.com", color: BRAND_SERIES, isBrand: true },
    competitors: mkComp("nw", [
      ["Lumetric", "lumetric.io", 0.62],
      ["Quanta Insights", "quantainsights.com", 0.48],
      ["Pathwise", "pathwise.dev", 0.41],
      ["Funnelcraft", "funnelcraft.app", 0.3],
      ["Signalbase", "signalbase.io", 0.22],
    ]),
    topics: NW_TOPICS,
    personas: NW_PERSONAS,
    ownedPaths: ["/", "/product/funnels", "/product/session-replay", "/pricing", "/blog/product-analytics-guide", "/blog/warehouse-native-analytics", "/docs/getting-started", "/compare/lumetric", "/customers", "/blog/north-star-metric"],
    prompts: mkPrompts(NW_TOPICS, NW_PERSONAS, [
      ["What is the best product analytics tool for a B2B SaaS startup?", 0, 0, "consideration", 0.62],
      ["Best product analytics platforms in 2026", 0, 0, "consideration", 0.55],
      ["How do I measure feature adoption in a SaaS product?", 0, 0, "awareness", 0.38],
      ["Which analytics tool has the best funnel analysis?", 0, 2, "consideration", 0.5],
      ["Product analytics tools with a generous free tier", 0, 2, "decision", 0.44],
      ["How to build a retention cohort chart", 0, 2, "awareness", 0.28],
      ["What metrics should a Head of Product track weekly?", 0, 0, "awareness", 0.2],
      ["Best analytics tool for product-led growth", 0, 2, "consideration", 0.58],
      ["Self-serve analytics for non-technical product managers", 0, 0, "consideration", 0.46],
      ["How to choose a product analytics vendor", 0, 3, "consideration", 0.4],
      ["Best session replay tools for SaaS", 1, 0, "consideration", 0.35],
      ["Session replay that respects GDPR and masks PII", 1, 3, "decision", 0.42],
      ["How does session replay affect page performance?", 1, 1, "awareness", 0.18],
      ["Combine session replay with funnel analytics", 1, 0, "consideration", 0.52],
      ["Is session replay worth it for B2B products?", 1, 0, "awareness", 0.26],
      ["Best A/B testing tools for product teams", 2, 2, "consideration", 0.3],
      ["How to run feature flag experiments with analytics", 2, 1, "awareness", 0.33],
      ["Experimentation platform with built-in stats engine", 2, 1, "decision", 0.25],
      ["What sample size do I need for an A/B test?", 2, 2, "awareness", 0.12],
      ["Bayesian vs frequentist A/B testing for SaaS", 2, 1, "awareness", 0.15],
      ["What is warehouse-native product analytics?", 3, 1, "awareness", 0.56],
      ["Product analytics on top of Snowflake", 3, 1, "consideration", 0.64],
      ["Product analytics for BigQuery without copying data", 3, 1, "decision", 0.6],
      ["dbt-friendly product analytics tools", 3, 1, "consideration", 0.48],
      ["How to model events in the data warehouse", 3, 1, "awareness", 0.32],
      ["Best analytics tool for a data team that already has Snowflake", 3, 3, "decision", 0.66],
      ["Reverse ETL vs warehouse-native analytics", 3, 1, "awareness", 0.24],
      ["Is warehouse-native analytics more secure?", 3, 3, "consideration", 0.5],
      ["Lumetric alternatives", 4, 0, "decision", 0.47],
      ["Cheaper alternative to Lumetric for startups", 4, 3, "decision", 0.5],
      ["Northwind Analytics vs Lumetric", 4, 0, "decision", 0.82],
      ["Northwind Analytics pricing", 4, 3, "decision", 0.9],
      ["Quanta Insights vs Pathwise", 4, 0, "decision", 0.22],
      ["Is Northwind Analytics SOC 2 compliant?", 4, 3, "decision", 0.86],
      ["Product analytics pricing per event vs per seat", 4, 3, "consideration", 0.34],
      ["Open-source product analytics tools", 4, 1, "consideration", 0.2],
      ["Best analytics for mobile and web apps together", 0, 1, "consideration", 0.36],
      ["Product analytics with AI-generated insights", 0, 0, "consideration", 0.43],
      ["How to track activation rate in a SaaS app", 0, 2, "awareness", 0.3],
      ["Which analytics tools integrate with HubSpot and Salesforce?", 0, 2, "decision", 0.39],
    ]),
  },
  org_fernhill: {
    brand: { id: "brand", name: "Fernhill Outdoor", domain: "fernhilloutdoor.com", color: BRAND_SERIES, isBrand: true },
    competitors: mkComp("fh", [
      ["Ridgeline Supply", "ridgelinesupply.com", 0.58],
      ["Trailmark", "trailmark.co", 0.52],
      ["Summit & Pine", "summitandpine.com", 0.4],
      ["Basecamp Co.", "basecampco.com", 0.34],
      ["Northbound Gear", "northboundgear.com", 0.27],
    ]),
    topics: FH_TOPICS,
    personas: FH_PERSONAS,
    ownedPaths: ["/", "/collections/hiking-boots", "/products/ashdown-gtx-boot", "/collections/tents", "/products/fell-2-tent", "/journal/how-to-choose-hiking-boots", "/journal/waterproof-ratings-explained", "/sustainability", "/repairs", "/size-guide"],
    prompts: mkPrompts(FH_TOPICS, FH_PERSONAS, [
      ["Best waterproof hiking boots for wide feet", 0, 0, "consideration", 0.48],
      ["Most comfortable hiking boots for beginners", 0, 0, "consideration", 0.42],
      ["Do I need to break in leather hiking boots?", 0, 0, "awareness", 0.2],
      ["Best lightweight hiking boots for long distance", 0, 1, "consideration", 0.35],
      ["Hiking boots vs trail runners for the Pennine Way", 0, 1, "awareness", 0.18],
      ["Best vegan hiking boots", 0, 3, "decision", 0.55],
      ["How should hiking boots fit?", 0, 0, "awareness", 0.3],
      ["Resoleable hiking boots brands", 0, 1, "decision", 0.62],
      ["Best 2-person backpacking tent under £300", 1, 1, "decision", 0.44],
      ["Best family tent for UK weather", 1, 2, "consideration", 0.36],
      ["How to pitch a tent in strong wind", 1, 2, "awareness", 0.16],
      ["Freestanding vs non-freestanding tents", 1, 1, "awareness", 0.22],
      ["Lightest 1-person tent for wild camping in Scotland", 1, 1, "consideration", 0.38],
      ["Best tent for festivals that lasts", 1, 3, "consideration", 0.28],
      ["Best rain jacket for hiking in the UK", 2, 0, "consideration", 0.5],
      ["What does 20,000mm waterproof rating mean?", 2, 0, "awareness", 0.45],
      ["PFC-free waterproof jackets that actually work", 2, 3, "consideration", 0.6],
      ["How to reproof a waterproof jacket", 2, 0, "awareness", 0.4],
      ["Best packable rain jacket for travel", 2, 3, "decision", 0.33],
      ["Gore-Tex alternatives", 2, 1, "consideration", 0.37],
      ["Most sustainable outdoor clothing brands", 3, 3, "consideration", 0.57],
      ["Outdoor brands with lifetime repair programs", 3, 1, "decision", 0.68],
      ["Is recycled nylon as durable as virgin nylon?", 3, 1, "awareness", 0.25],
      ["B Corp outdoor gear companies UK", 3, 3, "consideration", 0.52],
      ["How to recycle old outdoor gear", 3, 2, "awareness", 0.3],
      ["Best gift for a hiker under £100", 4, 3, "decision", 0.32],
      ["Best daypack for hiking with kids", 4, 2, "consideration", 0.4],
      ["How to choose a backpack size for multi-day hikes", 4, 1, "awareness", 0.26],
      ["Best women's hiking backpack 40L", 4, 1, "decision", 0.43],
      ["Best backpack with a rain cover included", 4, 0, "consideration", 0.35],
      ["Fernhill Outdoor reviews", 4, 3, "decision", 0.88],
      ["Is Fernhill Outdoor good quality?", 4, 0, "decision", 0.84],
      ["Fernhill vs Ridgeline Supply boots", 0, 0, "decision", 0.76],
      ["Fernhill Outdoor discount code", 4, 3, "decision", 0.7],
      ["Trailmark alternatives", 2, 1, "decision", 0.38],
      ["Best outdoor gear shops online UK", 4, 3, "consideration", 0.46],
      ["Where to buy hiking gear with free returns", 4, 0, "decision", 0.4],
      ["Best walking boots for Lake District", 0, 0, "consideration", 0.47],
      ["Camping gear checklist for families", 1, 2, "awareness", 0.24],
      ["Waterproof trousers vs gaiters", 2, 0, "awareness", 0.2],
    ]),
  },
};

interface DomainSeed {
  domain: string;
  type: SourceType;
  weight: number;
  titles: string[];
}

export const DOMAIN_POOLS: Record<string, DomainSeed[]> = {
  org_northwind: [
    { domain: "g2.com", type: "review", weight: 10, titles: ["Best Product Analytics Software", "Lumetric vs Northwind Analytics", "Northwind Analytics Reviews"] },
    { domain: "reddit.com", type: "ugc", weight: 9, titles: ["r/ProductManagement: which analytics tool?", "r/dataengineering: warehouse-native analytics experiences", "r/SaaS: cheaper Lumetric alternative?"] },
    { domain: "capterra.com", type: "review", weight: 5, titles: ["Product Analytics Software 2026", "Northwind Analytics Pricing & Reviews"] },
    { domain: "techcrunch.com", type: "editorial", weight: 3, titles: ["Northwind raises Series B for warehouse-native analytics", "The analytics stack is moving into the warehouse"] },
    { domain: "medium.com", type: "editorial", weight: 5, titles: ["How we picked our product analytics stack", "Funnels that don't lie"] },
    { domain: "wikipedia.org", type: "reference", weight: 3, titles: ["Product analytics", "A/B testing"] },
    { domain: "stackoverflow.com", type: "ugc", weight: 3, titles: ["Tracking events in Snowflake from a React app", "Cohort analysis SQL"] },
    { domain: "youtube.com", type: "social", weight: 4, titles: ["Northwind Analytics in 10 minutes", "Top 5 product analytics tools"] },
    { domain: "linkedin.com", type: "social", weight: 3, titles: ["Why we moved analytics into Snowflake", "Activation metrics that matter"] },
    { domain: "lennysnewsletter.com", type: "editorial", weight: 4, titles: ["The product analytics buyer's guide", "Measuring activation"] },
    { domain: "trustradius.com", type: "review", weight: 2, titles: ["Northwind Analytics vs Quanta Insights"] },
    { domain: "news.ycombinator.com", type: "ugc", weight: 2, titles: ["Show HN: warehouse-native product analytics"] },
  ],
  org_fernhill: [
    { domain: "reddit.com", type: "ugc", weight: 10, titles: ["r/UKhiking: best boots for wide feet?", "r/CampingGear: Fernhill Fell 2 review", "r/BuyItForLife: resoleable boots"] },
    { domain: "outdoorgearlab.com", type: "review", weight: 8, titles: ["The Best Hiking Boots of 2026", "Best Rain Jackets Tested"] },
    { domain: "theguardian.com", type: "editorial", weight: 4, titles: ["The best waterproof jackets, tested", "Sustainable outdoor brands worth buying"] },
    { domain: "trustpilot.com", type: "review", weight: 6, titles: ["Fernhill Outdoor Reviews", "Ridgeline Supply Reviews"] },
    { domain: "ukhillwalking.com", type: "ugc", weight: 5, titles: ["Gear review: Ashdown GTX boot", "Forum: best tent for Scottish wild camping"] },
    { domain: "youtube.com", type: "social", weight: 6, titles: ["Fernhill Fell 2 tent: 6 month review", "Best budget hiking boots 2026"] },
    { domain: "wikipedia.org", type: "reference", weight: 2, titles: ["Hydrostatic head", "Gore-Tex"] },
    { domain: "which.co.uk", type: "review", weight: 4, titles: ["Best walking boots", "Best tents for families"] },
    { domain: "tiktok.com", type: "social", weight: 3, titles: ["What's in my hiking pack", "Tent pitching in 60 seconds"] },
    { domain: "bcorporation.net", type: "reference", weight: 2, titles: ["Fernhill Outdoor B Corp profile"] },
    { domain: "trekkinglife.co.uk", type: "editorial", weight: 3, titles: ["Best lightweight tents"] },
    { domain: "instagram.com", type: "social", weight: 2, titles: ["Fernhill Outdoor on Instagram"] },
  ],
};
