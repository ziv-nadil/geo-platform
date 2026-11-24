import 'server-only';

/**
 * Server query functions for every dashboard tab and onboarding. Call them from Server Components
 * or route handlers. Every function:
 *   - resolves the caller from the Supabase session (getClaims) and runs with RLS enforced
 *     (withRls), so a user only ever sees their orgs;
 *   - returns QueryResult<T>: { ok: true, data } | { ok: false, reason: 'not_configured' | 'unauthenticated' | 'forbidden' };
 *   - never fabricates data: empty tables give empty arrays / null metrics.
 * adminListOrgs() is the only service-path query (platform admin, aal2, audited).
 *
 * Signatures:
 *   listMyOrgs(): QueryResult<OrgSummary[]>
 *   getOrg(orgId): QueryResult<OrgSummary | null>
 *   listEngines(orgId): QueryResult<Engine[]>
 *   getOverview(orgId, filters?): QueryResult<Overview>
 *   listTopics(orgId): QueryResult<Topic[]>
 *   listPrompts(orgId, filters?): QueryResult<PromptRow[]>
 *   getPromptDetail(orgId, promptId, filters?): QueryResult<PromptDetail | null>
 *   listResponses(orgId, filters & { promptId?, brandMentioned?, limit?, offset? }): QueryResult<Page<ResponseRow>>
 *   listCompetitors(orgId): QueryResult<Competitor[]>
 *   getCompetitorSov(orgId, filters?): QueryResult<CompetitorSov>
 *   getCitations(orgId, filters?): QueryResult<Citations>
 *   listSourceTags(orgId): QueryResult<SourceTag[]>
 *   getSentiment(orgId, filters?): QueryResult<SentimentReport>
 *   getSiteHealth(orgId): QueryResult<SiteHealth>
 *   getCrawlerHits(orgId, filters?): QueryResult<CrawlerHits>
 *   getBrandKit(orgId): QueryResult<BrandKit>
 *   listContentItems(orgId): QueryResult<ContentItem[]>
 *   listCreators(orgId): QueryResult<Creator[]>
 *   listOutreach(orgId): QueryResult<OutreachContact[]>
 *   listReports(orgId): QueryResult<Report[]>
 *   listMembers(orgId): QueryResult<Member[]>
 *   listInvitations(orgId): QueryResult<Invitation[]>      (admins only; others get [])
 *   listApiKeys(orgId): QueryResult<ApiKey[]>              (admins only; others get [])
 *   getBilling(orgId): QueryResult<Billing>                (subscription visible to admins only)
 *   getOnboardingProgress(orgId): QueryResult<OnboardingProgress>
 *   adminListOrgs(): QueryResult<AdminOrgRow[]>            (platform admin + aal2; writes platform_audit_log)
 */

export type * from './types';
export { listMyOrgs, getOrg, listEngines } from './org';
export { getOverview } from './overview';
export { listTopics, listPrompts, getPromptDetail, listResponses } from './prompts';
export { listCompetitors, getCompetitorSov } from './competitors';
export { getCitations, listSourceTags } from './citations';
export { getSentiment } from './sentiment';
export { getSiteHealth, getCrawlerHits } from './site';
export { getBrandKit, listContentItems, listCreators, listOutreach, listReports } from './content';
export { listMembers, listInvitations, listApiKeys, getBilling } from './settings';
export { getOnboardingProgress } from './onboarding';
export { adminListOrgs } from './admin';
