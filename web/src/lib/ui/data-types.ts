/**
 * Page-facing data shapes. Produced by the adapter in src/lib/data.ts from the backend query
 * functions (src/lib/server/queries). Pure types: safe for client components.
 * A null metric means "no data for this window", never zero.
 */

export type EngineId = "chatgpt" | "perplexity" | "gemini" | "claude" | "google_aio" | (string & {});

export interface Engine {
  id: EngineId;
  name: string;
  short: string;
  vendor: string;
  color: string;
}

export type Role = "owner" | "admin" | "member" | "viewer";
export type Sentiment = "positive" | "neutral" | "negative";
export type SourceType = "owned" | "competitor" | "earned" | "ugc" | "other";

export interface Filters {
  range: 7 | 14 | 30;
  engine: EngineId | "all";
}

export interface Org {
  id: string;
  slug: string;
  name: string;
  domain: string;
  plan: string;
  status: string;
  role: Role | null;
  color: string;
  onboardingPct: number;
}

export interface Viewer {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  aal: "aal1" | "aal2";
  devBypass: boolean;
}

export interface TrendPoint {
  date: string;
  [series: string]: number | string | null;
}

export interface Kpi {
  value: number | null;
  previous: number | null;
  delta: number | null;
}

export interface KpiSet {
  visibility: Kpi;
  /** Secondary: % of runs whose answer mentions the brand. */
  pctMentioned: Kpi;
  shareOfVoice: Kpi;
  citationShare: Kpi;
  avgPosition: Kpi;
  sentiment: Kpi;
  answers: number;
  sparkVisibility: number[];
  sparkSov: number[];
  sparkCitation: number[];
  sparkPosition: number[];
  sparkSentiment: number[];
}

export interface EngineBreakdown {
  engine: EngineId;
  visibility: number | null;
  pctMentioned?: number | null;
  sov: number | null;
  citationShare: number | null;
  runs: number;
}

export interface Mover {
  promptId: string;
  text: string;
  current: number;
  previous: number;
  delta: number;
}

export interface SovRow {
  id: string;
  name: string;
  color: string;
  isBrand: boolean;
  sov: number;
  sovPrev: number | null;
  mentions: number;
  avgPosition: number | null;
  sentiment: number | null;
}

export interface PromptRow {
  id: string;
  text: string;
  topic: string | null;
  persona: string | null;
  funnel: string | null;
  tags: string[];
  source: string;
  runs: number;
  visibility: number | null;
  visibilityPrev: number | null;
  avgPosition: number | null;
  byEngine: Record<string, number | null>;
  lastRunAt: string | null;
}

export interface Citation {
  url: string;
  domain: string;
  type: SourceType;
  title: string;
}

export interface EngineAnswer {
  id: string;
  engine: EngineId;
  date: string;
  promptId: string;
  promptText: string;
  text: string;
  mentioned: boolean;
  position: number | null;
  sentiment: Sentiment | null;
  brandsInOrder: string[];
  citations: Citation[];
}

export interface PromptDetail {
  prompt: PromptRow;
  byEngine: { engine: EngineId; runs: number; visibility: number | null; avgPosition: number | null }[];
  answers: EngineAnswer[];
  competitorsMentioned: { name: string; mentions: number }[];
  topSources: (Citation & { count: number })[];
  brandName: string;
  competitorNames: string[];
}

export interface HeadToHead {
  competitorId: string;
  answers: number;
  both: number;
  winRate: number;
  brandOnly: number;
  compOnly: number;
  neither: number;
  byEngine: { engine: EngineId; both: number; winRate: number }[];
}

export interface DomainStat {
  domain: string;
  type: SourceType;
  citations: number;
  share: number;
  answersCiting: number;
  tags: string[];
}

export interface UrlStat {
  url: string;
  domain: string;
  title: string;
  type: SourceType;
  citations: number;
  lastSeenAt: string;
}

export interface SourceTag {
  id: string;
  name: string;
  color: string;
  description: string;
  domains: string[];
  citations: number;
}

export interface SentimentSummary {
  totals: { positive: number; neutral: number; negative: number };
  net: number | null;
  trend: TrendPoint[];
  byEngine: { engine: EngineId; positive: number; neutral: number; negative: number; net: number | null }[];
  samples: { snippet: string; sentiment: Sentiment; engine: EngineId; promptText: string; date: string }[];
}

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";
export type IssueStatus = "open" | "in_progress" | "resolved" | "ignored";

export interface SiteProperty {
  id: string;
  domain: string;
  score: number | null;
  pagesCrawled: number;
  lastAuditAt: string | null;
  status: string | null;
  issues: Record<IssueSeverity, number>;
}

export interface SiteIssue {
  id: string;
  title: string;
  code: string;
  severity: IssueSeverity;
  category: string | null;
  pages: number;
  status: IssueStatus;
  howToFix: string | null;
}

export interface SitePage {
  url: string;
  statusCode: number | null;
  title: string | null;
  issues: number;
  words: number | null;
  hasSchema: boolean | null;
  score: number | null;
  lastCrawled: string | null;
}

export interface CrawlerBot {
  name: string;
  operator: string;
  purpose: "training" | "search" | "user" | "unknown";
  hits: number;
  errorHits: number;
  uniquePaths: number;
}

export interface CrawlerData {
  bots: CrawlerBot[];
  trend: TrendPoint[];
  operators: string[];
  paths: { path: string; hits: number; bots: string[] }[];
}

export interface BrandStyle {
  voice: string;
  audience: string;
  perspective: "first_plural" | "second" | "third";
  channel: "blog" | "docs" | "social" | "email" | "landing";
  locale: string;
  disclosures: string;
  tone: { formal: number; playful: number; technical: number; confident: number };
  rules: string[];
}

export interface BrandKit {
  style: BrandStyle;
  terminology: { use: string; avoid: string }[];
  profile: { name: string; tagline: string | null; description: string | null; industry: string | null } | null;
  messaging: { kind: string; title: string | null; content: string }[];
}

export interface ContentDraft {
  id: string;
  title: string;
  type: string;
  targetPrompt: string | null;
  status: string;
  updatedAt: string;
  url: string | null;
}

export interface Creator {
  id: string;
  platform: "youtube" | "tiktok";
  name: string;
  handle: string;
  url: string | null;
  followers: number | null;
  avgViews: number | null;
  relevance: number | null;
  topics: string[];
  citedCount: number;
  status: string;
}

export type OutreachStage = "new" | "queued" | "contacted" | "replied" | "won" | "lost" | "ignored";

export interface OutreachContact {
  id: string;
  name: string;
  role: string | null;
  publication: string | null;
  domain: string | null;
  email: string | null;
  stage: OutreachStage;
  citations: number;
  lastTouch: string | null;
}

export interface Report {
  id: string;
  title: string;
  type: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: string;
  schedule: string | null;
  createdAt: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface Integration {
  stepId: string;
  name: string;
  status: "pass" | "partial" | "fail" | "idle";
  detail: string;
  lastCheckedAt: string | null;
}

export interface Billing {
  planName: string | null;
  monthlyPrice: number | null;
  seatLimit: number | null;
  promptLimit: number | null;
  subscriptionStatus: string | null;
  seats: number | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { metric: string; value: number }[];
  plans: { id: string; name: string; monthlyPrice: number }[];
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
  members: number;
  onboardingPct: number;
  onboardingNeedsAttention: number;
  subscriptionStatus: string | null;
  vaultProvisioned: boolean;
  runs30d: number;
  lastRunAt: string | null;
}

/** Discriminated result so pages can render "not configured" / "sign in" / "no access" states. */
export type Load<T> = { ok: true; data: T } | { ok: false; reason: "not_configured" | "unauthenticated" | "forbidden"; missing?: string[] };
