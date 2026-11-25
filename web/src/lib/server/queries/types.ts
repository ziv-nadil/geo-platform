/**
 * Shared types for server query functions (web/src/lib/server/queries/*).
 * Pure types: safe to import from server components. Numbers are plain JS numbers; dates are ISO strings.
 */

export type QueryFail =
  | { ok: false; reason: 'not_configured'; missing: string[] }
  | { ok: false; reason: 'unauthenticated' }
  | { ok: false; reason: 'forbidden' };
export type QueryResult<T> = { ok: true; data: T } | QueryFail;

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
export type EngineId = string; // 'chatgpt' | 'perplexity' | 'gemini' | 'claude' | 'google_aio' | 'google_ai_mode' | ...
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type SourceType = 'owned' | 'competitor' | 'earned' | 'ugc' | 'other';
export type OnboardingStatus = 'not_started' | 'in_progress' | 'needs_attention' | 'complete';
export type TestStatus = 'pass' | 'partial' | 'fail' | 'not_configured';

export interface Filters {
  /** Look-back window in days (default 30, max 365). */
  days?: number;
  /** Restrict to these engines (default: all the org tracks). */
  engines?: EngineId[];
  topicId?: string;
}

// ---- org / shell ------------------------------------------------------------
export interface OrgSummary { id: string; name: string; slug: string; website: string | null; plan: string; status: string; role: OrgRole | null }
export interface Engine { id: EngineId; name: string; provider: string; method: string; active: boolean; enabled: boolean }

// ---- overview ---------------------------------------------------------------
export interface MetricPoint { day: string; engineId: EngineId; visibility: number | null; pctMentioned: number | null; shareOfVoice: number | null; citationShare: number | null; avgPosition: number | null; sentiment: number | null; runs: number }
export interface KpiDelta { value: number | null; previous: number | null; delta: number | null }
export interface Overview {
  window: { from: string; to: string; days: number };
  kpis: { visibility: KpiDelta; pctMentioned: KpiDelta; shareOfVoice: KpiDelta; citationShare: KpiDelta; avgPosition: KpiDelta; sentiment: KpiDelta; runs: number };
  series: MetricPoint[];
  byEngine: { engineId: EngineId; visibility: number | null; pctMentioned: number | null; shareOfVoice: number | null; citationShare: number | null; runs: number }[];
  topCompetitors: { id: string; name: string; color: string | null; mentions: number; shareOfVoice: number }[];
  topSources: { domain: string; sourceType: SourceType; citations: number }[];
}

// ---- prompts ----------------------------------------------------------------
export interface PromptRow {
  id: string; text: string; topicId: string | null; topicName: string | null; personaName: string | null;
  funnelStage: string | null; locale: string; country: string | null; source: string; active: boolean; tags: string[];
  runs: number; visibility: number | null; avgPosition: number | null; lastRunAt: string | null;
}
export interface Topic { id: string; name: string; description: string | null; promptCount: number }
export interface PromptDetail {
  prompt: PromptRow;
  byEngine: { engineId: EngineId; runs: number; visibility: number | null; avgPosition: number | null; lastRunAt: string | null }[];
  recentResponses: ResponseRow[];
  competitorsMentioned: { name: string; mentions: number }[];
  topCitations: { url: string; domain: string; sourceType: SourceType; citations: number }[];
}

// ---- responses --------------------------------------------------------------
export interface ResponseRow {
  id: string; promptRunId: string; promptId: string; promptText: string; engineId: EngineId; model: string | null; runAt: string;
  text: string; brandMentioned: boolean;
  mentions: { name: string; entityType: 'brand' | 'competitor'; position: number | null; sentiment: Sentiment | null }[];
  citations: { url: string; domain: string; sourceType: SourceType; position: number | null }[];
}
export interface Page<T> { rows: T[]; total: number; limit: number; offset: number }

// ---- competitors ------------------------------------------------------------
export interface Competitor { id: string; name: string; domain: string | null; aliases: string[]; color: string | null; active: boolean }
export interface CompetitorSov {
  entities: { entityId: string; entityType: 'brand' | 'competitor'; name: string; color: string | null; mentions: number; shareOfVoice: number; avgPosition: number | null; sentiment: number | null }[];
  series: { day: string; entityId: string; name: string; shareOfVoice: number }[];
}

// ---- citations / sources ----------------------------------------------------
export interface CitationDomain { domain: string; sourceType: SourceType; citations: number; runsCiting: number; share: number; tags: string[] }
export interface CitationUrl { url: string; domain: string; title: string | null; sourceType: SourceType; citations: number; lastSeenAt: string }
export interface Citations { byType: { sourceType: SourceType; citations: number; share: number }[]; domains: CitationDomain[]; urls: CitationUrl[] }
export interface SourceTag { id: string; name: string; color: string | null; description: string | null; rules: { id: string; matchType: 'domain' | 'url_prefix'; pattern: string }[]; citations: number }

// ---- sentiment --------------------------------------------------------------
export interface SentimentReport {
  totals: { positive: number; neutral: number; negative: number; average: number | null };
  series: { day: string; positive: number; neutral: number; negative: number; average: number | null }[];
  byEngine: { engineId: EngineId; positive: number; neutral: number; negative: number; average: number | null }[];
  samples: { snippet: string; sentiment: Sentiment; engineId: EngineId; promptText: string; runAt: string }[];
}

// ---- site health / crawlers -------------------------------------------------
export interface SiteHealth {
  properties: { id: string; rootUrl: string; score: number | null; pagesCrawled: number; lastAuditAt: string | null; auditStatus: string | null }[];
  issues: { id: string; propertyId: string; code: string; title: string; category: string | null; severity: string; status: string; recommendation: string | null; affectedPages: number }[];
  pages: { id: string; propertyId: string; url: string; statusCode: number | null; score: number | null; title: string | null; wordCount: number | null; hasSchema: boolean | null; issuesCount: number; lastCrawledAt: string | null }[];
}
export interface CrawlerHits {
  totals: { bot: string; operator: string | null; hits: number; errorHits: number; uniquePaths: number }[];
  series: { day: string; bot: string; hits: number }[];
  topPaths: { path: string; hits: number; bots: string[] }[];
}

// ---- content / brand kit ----------------------------------------------------
export interface BrandKit {
  profile: Record<string, unknown> | null;
  personas: { id: string; name: string; roleTitle: string | null; description: string | null; goals: string[]; painPoints: string[] }[];
  messaging: { id: string; kind: string; title: string | null; content: string }[];
  voiceTerms: { id: string; kind: string; term: string; replacement: string | null }[];
  competitors: Competitor[];
  assets: { id: string; kind: string; filename: string; storagePath: string; mimeType: string | null }[];
}
export interface ContentItem { id: string; title: string; contentType: string; status: string; targetUrl: string | null; publishedUrl: string | null; promptText: string | null; updatedAt: string }

// ---- action center ----------------------------------------------------------
export interface Creator { id: string; platform: 'youtube' | 'tiktok'; handle: string; displayName: string | null; url: string | null; followers: number | null; avgViews: number | null; relevanceScore: number | null; topics: string[]; citedCount: number; status: string }
export interface OutreachContact { id: string; name: string | null; email: string | null; publication: string | null; url: string | null; domain: string | null; roleTitle: string | null; status: string; citationCount: number; lastContactedAt: string | null }
export interface Report { id: string; title: string; reportType: string; periodStart: string | null; periodEnd: string | null; status: string; schedule: string | null; createdAt: string }

// ---- settings ---------------------------------------------------------------
export interface Member { userId: string; email: string | null; fullName: string | null; role: OrgRole; joinedAt: string }
export interface Invitation { id: string; email: string; role: OrgRole; status: string; expiresAt: string; createdAt: string }
export interface ApiKey { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string }
export interface Billing {
  plan: { id: string; name: string; monthlyPriceCents: number; seatLimit: number | null; promptLimit: number | null; engineLimit: number | null; runsPerMonth: number | null } | null;
  subscription: { status: string; seats: number; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; trialEnd: string | null } | null;
  usage: { metric: string; periodStart: string; value: number }[];
  plans: { id: string; name: string; monthlyPriceCents: number }[];
}

// ---- onboarding -------------------------------------------------------------
export interface OnboardingProgress {
  steps: { stepId: string; status: OnboardingStatus; data: Record<string, unknown>; notes: string | null; updatedAt: string; completedAt: string | null }[];
  secrets: { stepId: string; fieldId: string; testStatus: TestStatus | null; lastTestedAt: string | null; updatedAt: string }[];
  latestTests: { stepId: string; status: TestStatus; checks: { id: string; label: string; ok: boolean; detail?: string }[]; missing: string[]; createdAt: string }[];
  summary: { complete: number; needsAttention: number; total: number };
}

// ---- admin console ----------------------------------------------------------
export interface AdminOrgRow {
  id: string; name: string; slug: string; plan: string; status: string; createdAt: string;
  members: number; onboardingComplete: number; onboardingNeedsAttention: number;
  subscriptionStatus: string | null; vaultProvisioned: boolean; runs30d: number; lastRunAt: string | null;
}
