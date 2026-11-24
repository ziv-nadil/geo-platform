/**
 * Domain types for the dashboard. The mock layer (this folder) and the future Supabase
 * layer both return these shapes, so pages never change when the data source is swapped.
 */

export type EngineId = "chatgpt" | "perplexity" | "gemini" | "claude" | "google_aio";

export interface Engine {
  id: EngineId;
  name: string;
  short: string;
  vendor: string;
  color: string;
}

export type Plan = "starter" | "growth" | "scale" | "enterprise";
export type Role = "owner" | "admin" | "editor" | "viewer";
export type Funnel = "awareness" | "consideration" | "decision";
export type Sentiment = "positive" | "neutral" | "negative";
export type SourceType = "owned" | "competitor" | "editorial" | "ugc" | "reference" | "review" | "social";

export interface Org {
  id: string;
  slug: string;
  name: string;
  domain: string;
  industry: string;
  color: string;
  plan: Plan;
  seats: number;
  seatsUsed: number;
  mrr: number;
  health: "healthy" | "attention" | "at_risk";
  onboardingPct: number;
  lastRunAt: string | null;
  createdAt: string;
  hasData: boolean;
  status: "active" | "onboarding" | "paused";
  locale: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  lastActiveAt: string;
  mfa: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  sentAt: string;
  expiresAt: string;
  status: "pending" | "expired";
}

export interface Competitor {
  id: string;
  name: string;
  domain: string;
  color: string;
  isBrand?: boolean;
}

export interface Prompt {
  id: string;
  text: string;
  topic: string;
  persona: string;
  funnel: Funnel;
  tags: string[];
  volume: number;
  createdAt: string;
  source: "manual" | "import" | "discovery";
}

export interface Citation {
  url: string;
  domain: string;
  type: SourceType;
  title: string;
}

/** One answer from one engine for one prompt on one day. */
export interface Run {
  date: string;
  promptId: string;
  engine: EngineId;
  mentioned: boolean;
  position: number | null;
  sentiment: Sentiment | null;
  competitors: { id: string; position: number }[];
  citations: Citation[];
}

export interface Filters {
  range: 7 | 14 | 30;
  engine: EngineId | "all";
}

export interface TrendPoint {
  date: string;
  [series: string]: number | string;
}

export interface KpiSet {
  visibility: number;
  visibilityPrev: number;
  shareOfVoice: number;
  shareOfVoicePrev: number;
  citationShare: number;
  citationSharePrev: number;
  avgPosition: number;
  avgPositionPrev: number;
  sentiment: number;
  sentimentPrev: number;
  answers: number;
  mentions: number;
  sparkVisibility: number[];
  sparkSov: number[];
  sparkCitation: number[];
  sparkPosition: number[];
  sparkSentiment: number[];
}

export interface PromptRow extends Prompt {
  visibility: number;
  visibilityPrev: number;
  avgPosition: number | null;
  sentiment: number;
  byEngine: Record<EngineId, number>;
  topCompetitor: string | null;
  citations: number;
}

export interface EngineAnswer {
  engine: EngineId;
  date: string;
  text: string;
  mentioned: boolean;
  position: number | null;
  sentiment: Sentiment | null;
  brandsInOrder: string[];
  citations: Citation[];
}

export interface DiscoverySuggestion {
  id: string;
  text: string;
  topic: string;
  persona: string;
  funnel: Funnel;
  volume: number;
  competitorVisibility: number;
  reason: string;
}

export interface DomainStat {
  domain: string;
  type: SourceType;
  citations: number;
  share: number;
  answersInfluenced: number;
  engines: EngineId[];
  tags: string[];
  trend: number[];
}

export interface UrlStat {
  url: string;
  domain: string;
  title: string;
  type: SourceType;
  citations: number;
  prompts: number;
}

export interface SourceTag {
  id: string;
  name: string;
  color: string;
  domains: string[];
  description?: string;
}

export interface SiteProperty {
  id: string;
  domain: string;
  pagesCrawled: number;
  score: number;
  scorePrev: number;
  lastAuditAt: string;
  status: "complete" | "running" | "scheduled";
  issues: { critical: number; warning: number; notice: number };
}

export interface SiteIssue {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "notice";
  category: "Crawlability" | "AI readability" | "Structured data" | "Performance" | "Content" | "Links";
  pages: number;
  status: "open" | "in_progress" | "ignored" | "fixed";
  firstSeen: string;
  howToFix: string;
}

export interface SitePage {
  url: string;
  statusCode: number;
  title: string;
  issues: number;
  words: number;
  schema: string[];
  aiCrawled: boolean;
  lastCrawled: string;
  loadMs: number;
}

export interface SiteTask {
  id: string;
  title: string;
  issueId: string;
  assignee: string;
  due: string;
  status: "todo" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
}

export interface CrawlerBot {
  id: string;
  name: string;
  operator: string;
  purpose: "training" | "search" | "user";
  color: string;
  hits: number;
  hitsPrev: number;
  lastSeen: string;
  blocked: boolean;
}

export interface CrawlerPath {
  path: string;
  hits: number;
  bots: string[];
  status: number;
}

export interface LlmsTxtStatus {
  url: string;
  reachable: boolean;
  statusCode: number;
  lastChecked: string;
  linksTotal: number;
  linksBroken: number;
  sizeKb: number;
  fullVersion: boolean;
}

export interface BrandKit {
  name: string;
  voice: string;
  audience: string;
  perspective: "first_plural" | "second" | "third";
  terminology: { use: string; avoid: string }[];
  channel: "blog" | "docs" | "social" | "email" | "landing";
  locale: string;
  disclosures: string;
  tone: { formal: number; playful: number; technical: number; confident: number };
  rules: string[];
}

export interface ContentDraft {
  id: string;
  title: string;
  type: "article" | "comparison" | "faq" | "listicle" | "landing";
  targetPrompt: string;
  status: "idea" | "drafting" | "review" | "published";
  words: number;
  updatedAt: string;
  owner: string;
}

export interface Creator {
  id: string;
  platform: "youtube" | "tiktok";
  name: string;
  handle: string;
  followers: number;
  avgViews: number;
  relevance: number;
  topics: string[];
  mentionsBrand: boolean;
  mentionsCompetitors: string[];
  lastPost: string;
  status: "new" | "shortlisted" | "contacted" | "partner";
}

export type OutreachStage = "prospect" | "contacted" | "replied" | "negotiating" | "won" | "lost";

export interface OutreachContact {
  id: string;
  name: string;
  role: string;
  publication: string;
  domain: string;
  email: string;
  stage: OutreachStage;
  citedBy: EngineId[];
  domainCitations: number;
  lastTouch: string;
  owner: string;
  notes: string;
}

export interface Report {
  id: string;
  name: string;
  cadence: "weekly" | "monthly" | "one_off";
  lastSentAt: string | null;
  nextRunAt: string | null;
  recipients: string[];
  format: "pdf" | "link" | "slack";
  sections: string[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  createdBy: string;
}

export interface Integration {
  id: string;
  name: string;
  stepId: string;
  status: "pass" | "partial" | "fail" | "idle";
  detail: string;
  lastCheckedAt: string | null;
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: "paid" | "open" | "void";
}

export interface Billing {
  plan: Plan;
  planName: string;
  pricePerSeat: number;
  basePrice: number;
  seats: number;
  seatsUsed: number;
  renewsAt: string;
  promptsLimit: number;
  promptsUsed: number;
  paymentMethod: string;
  invoices: Invoice[];
}

export interface Mover {
  promptId: string;
  text: string;
  topic: string;
  current: number;
  previous: number;
  delta: number;
}

export interface SentimentTheme {
  theme: string;
  sentiment: Sentiment;
  mentions: number;
  example: string;
  engines: EngineId[];
}

export interface PlatformSettings {
  defaultEngines: EngineId[];
  runCadence: "daily" | "weekly";
  agencyEmail: string;
  agencyGithubUser: string;
  adsManagerId: string;
  awsPrincipalArn: string;
  dataRetentionDays: number;
  maintenanceMode: boolean;
}
