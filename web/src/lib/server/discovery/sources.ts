import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { allowlistedFetch } from '../../engines/http';
import { guardPrompt } from '../isolation/job-context';
import { gscEligible, type Candidate } from '../../discovery/engine';
import { safeJson } from '../net/safe-fetch';
import { agencyGoogleToken, bearer } from '../integrations/google';
import type { BrandContext } from '../content-gaps/generate';

export const DISCOVERY_MODEL = 'claude-haiku-5-5';
export type SourceOutcome = { source: 'gsc' | 'keyword_planner' | 'paa' | 'llm'; status: 'ok' | 'not_configured' | 'error'; candidates: Candidate[]; missing?: string[]; message?: string };

const ok = (source: SourceOutcome['source'], candidates: Candidate[]): SourceOutcome => ({ source, status: 'ok', candidates });
const nc = (source: SourceOutcome['source'], missing: string[]): SourceOutcome => ({ source, status: 'not_configured', candidates: [], missing });
const fail = (source: SourceOutcome['source'], e: unknown): SourceOutcome => ({ source, status: 'error', candidates: [], message: e instanceof Error ? e.message.slice(0, 200) : 'request failed' });

/** Search Console queries, last 90 days, filtered to prompt-shaped queries. */
export async function fromGsc(property: string | null): Promise<SourceOutcome> {
  if (!property) return nc('gsc', ['gsc_property (onboarding step "Search Console")']);
  const t = await agencyGoogleToken();
  if ('missing' in t) return nc('gsc', t.missing);
  if ('error' in t) return { source: 'gsc', status: 'error', candidates: [], message: t.error };
  try {
    const end = new Date(); const start = new Date(end.getTime() - 90 * 86_400_000);
    const r = await safeJson<{ rows?: { keys: string[]; impressions: number }[] }>(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      integration: 'google', method: 'POST', headers: { ...bearer(t.token), 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), dimensions: ['query'], rowLimit: 1000 }) });
    if (!r.ok) return { source: 'gsc', status: 'error', candidates: [], message: `Search Console returned HTTP ${r.status}` };
    // Impressions over 90 days ~ 3x monthly; used only as a relative demand signal.
    return ok('gsc', (r.data?.rows ?? []).filter((x) => gscEligible(x.keys[0] ?? '')).map((x) => ({ text: x.keys[0]!, source: 'gsc' as const, volume: Math.round(x.impressions / 3) })));
  } catch (e) { return fail('gsc', e); }
}

/** Google Ads Keyword Planner ideas + average monthly searches for seed topics. */
export async function fromKeywordPlanner(seeds: string[]): Promise<SourceOutcome> {
  const need = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'GOOGLE_ADS_API_VERSION'];
  const missing = need.filter((n) => !process.env[n]?.trim());
  if (missing.length) return nc('keyword_planner', missing);
  if (!seeds.length) return ok('keyword_planner', []);
  const t = await agencyGoogleToken();
  if ('missing' in t) return nc('keyword_planner', t.missing);
  if ('error' in t) return { source: 'keyword_planner', status: 'error', candidates: [], message: t.error };
  const cid = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, '');
  try {
    const r = await safeJson<{ results?: { text: string; keywordIdeaMetrics?: { avgMonthlySearches?: string | number } }[] }>(
      `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION}/customers/${cid}:generateKeywordIdeas`, {
        integration: 'google', method: 'POST',
        headers: { ...bearer(t.token), 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!, 'login-customer-id': cid, 'content-type': 'application/json' },
        body: JSON.stringify({ keywordSeed: { keywords: seeds.slice(0, 20) }, language: 'languageConstants/1000', geoTargetConstants: ['geoTargetConstants/2840'], pageSize: 200 }) });
    if (!r.ok) return { source: 'keyword_planner', status: 'error', candidates: [], message: `Keyword Planner returned HTTP ${r.status}` };
    return ok('keyword_planner', (r.data?.results ?? []).filter((x) => gscEligible(x.text)).map((x) => ({ text: x.text, source: 'keyword_planner' as const, volume: Number(x.keywordIdeaMetrics?.avgMonthlySearches ?? 0) })));
  } catch (e) { return fail('keyword_planner', e); }
}

/** People Also Ask via DataForSEO SERP (questions are already prompt-shaped). */
export async function fromPaa(seeds: string[]): Promise<SourceOutcome> {
  const login = process.env.DATAFORSEO_LOGIN?.trim(), pass = process.env.DATAFORSEO_PASSWORD?.trim();
  const missing = [!login && 'DATAFORSEO_LOGIN', !pass && 'DATAFORSEO_PASSWORD'].filter(Boolean) as string[];
  if (missing.length) return nc('paa', missing);
  if (!seeds.length) return ok('paa', []);
  try {
    const f = allowlistedFetch('dataforseo', { timeoutMs: 60_000 });
    const res = await f('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify(seeds.slice(0, 10).map((keyword) => ({ keyword, location_code: 2840, language_code: 'en', depth: 10, people_also_ask_click_depth: 2 }))) });
    if (!res.ok) return { source: 'paa', status: 'error', candidates: [], message: `DataForSEO returned HTTP ${res.status}` };
    const body = (await res.json()) as { tasks?: { result?: { items?: { type: string; items?: { title?: string }[] }[] }[] }[] };
    const out: Candidate[] = [];
    for (const task of body.tasks ?? []) for (const r of task.result ?? []) for (const it of r.items ?? [])
      if (it.type === 'people_also_ask') for (const q of it.items ?? []) if (q.title) out.push({ text: q.title.replace(/\s+/g, ' ').trim(), source: 'paa' });
    return ok('paa', out);
  } catch (e) { return fail('paa', e); }
}

/** Matrix of ICP company profile x persona x funnel stage, generated with Haiku from the brand book. */
export async function fromLlm(brand: BrandContext, personas: { name: string; role: string | null; pains: string[] }[], topics: string[]): Promise<SourceOutcome> {
  guardPrompt([{ orgId: brand.orgId, source: 'brand_context' }]);
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return nc('llm', ['ANTHROPIC_API_KEY']);
  const stages = ['awareness', 'consideration', 'decision'] as const;
  const system = 'You write realistic prompts that buyers type into AI assistants (ChatGPT, Perplexity, Gemini). Conversational, specific (company size, industry, constraint), 8-30 words, never keyword fragments. ' +
    'awareness = problem/education; consideration = category/comparison/"best X for Y"; decision = brand vs brand, pricing, alternatives, reviews. ' +
    'Use only the brand context given; do not invent facts. Return JSON {"prompts":[{"text","persona","funnel","topic"}]} with 3 prompts per persona per funnel stage.';
  const user = JSON.stringify({ brand: { name: brand.name, description: brand.description, tagline: brand.tagline, pillars: brand.messaging.filter((m) => m.kind === 'pillar').map((m) => m.title ?? m.content) },
    competitors: brand.competitors.map((c) => c.name), topics, personas: personas.slice(0, 5), funnel_stages: stages });
  try {
    const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000, fetch: allowlistedFetch('anthropic', { timeoutMs: 90_000 }) });
    const msg = await client.messages.create({ model: DISCOVERY_MODEL, max_tokens: 6000, system, messages: [{ role: 'user', content: user }] });
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { prompts?: { text?: string; persona?: string; funnel?: string; topic?: string }[] };
    return ok('llm', (json.prompts ?? []).filter((p) => typeof p.text === 'string').map((p) => ({
      text: p.text!, source: 'llm' as const, persona: p.persona ?? null, topic: p.topic ?? null,
      funnel: (stages as readonly string[]).includes(p.funnel ?? '') ? p.funnel! : null })));
  } catch (e) { return fail('llm', e); }
}
