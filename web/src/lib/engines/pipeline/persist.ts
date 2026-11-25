/**
 * Loading org context and writing results. All writes for one run happen in one transaction:
 * prompt_runs (status/cost) + responses + mentions + citations + candidates + domain cache.
 */
import type { AnalysisOutput } from '../../analysis/analyze';
import type { SourceCategory } from '../../analysis/citations';
import { toDbSentiment } from '../../analysis/llm-tasks';
import type { TrackedEntity } from '../../analysis/mentions';
import { normalizeDomain } from '../../analysis/url';
import type { EngineResult, Locale } from '../types';
import type { Sql } from './db';

export interface ClaimedRun {
  id: string;
  org_id: string;
  prompt_id: string;
  engine_id: string;
  trigger: string;
  attempts: number;
  external_job_id: string | null;
  cost_usd: string | null;
  run_at: Date;
}

export interface OrgContext {
  brand: TrackedEntity | null;
  competitors: TrackedEntity[];
  settings: Record<string, unknown>;
}

export interface PromptContext {
  id: string;
  text: string;
  locale: Locale;
}

const RAW_MAX_CHARS = 200_000;

export async function loadOrgContext(sql: Sql, orgId: string): Promise<OrgContext> {
  const [org] = await sql<{ settings: Record<string, unknown> }[]>`select settings from public.organizations where id = ${orgId}`;
  const brands = await sql<
    { id: string; name: string; domain: string; aliases: string[]; extra_domains: string[]; negative_aliases: string[]; context_terms: string[] }[]
  >`select id, name, domain, aliases, extra_domains, negative_aliases, context_terms from public.brands
    where org_id = ${orgId} order by is_primary desc, created_at limit 1`;
  const comps = await sql<
    { id: string; name: string; domain: string | null; aliases: string[]; extra_domains: string[]; negative_aliases: string[]; context_terms: string[] }[]
  >`select id, name, domain, aliases, extra_domains, negative_aliases, context_terms from public.competitors
    where org_id = ${orgId} and active`;
  const b = brands[0];
  return {
    settings: org?.settings ?? {},
    brand: b
      ? {
          id: b.id,
          kind: 'brand',
          name: b.name,
          aliases: b.aliases,
          domains: [b.domain, ...b.extra_domains].map(normalizeDomain).filter(Boolean),
          negativeAliases: b.negative_aliases,
          contextTerms: b.context_terms,
        }
      : null,
    competitors: comps.map((c) => ({
      id: c.id,
      kind: 'competitor' as const,
      name: c.name,
      aliases: c.aliases,
      domains: [c.domain ?? '', ...c.extra_domains].map(normalizeDomain).filter(Boolean),
      negativeAliases: c.negative_aliases,
      contextTerms: c.context_terms,
    })),
  };
}

export function localeFromPrompt(p: { locale: string; country: string | null; location_code: number | null }): Locale {
  const region = p.locale.split('-')[1];
  return {
    language: p.locale,
    country: (p.country ?? region ?? 'US').toUpperCase(),
    ...(p.location_code ? { locationCode: p.location_code } : {}),
  };
}

export async function loadPrompt(sql: Sql, orgId: string, promptId: string): Promise<PromptContext | null> {
  const [p] = await sql<{ id: string; text: string; locale: string; country: string | null; location_code: number | null; org_country: string; org_language: string }[]>`
    select p.id, p.text, p.locale, p.country, p.location_code, o.country as org_country, o.language as org_language
    from public.prompts p join public.organizations o on o.id = p.org_id where p.id = ${promptId} and p.org_id = ${orgId}`;
  // One location per client: the org setting wins over any per-prompt value.
  return p
    ? { id: p.id, text: p.text, locale: localeFromPrompt({ locale: p.org_language, country: p.org_country, location_code: null }) }
    : null;
}

export async function loadDomainCache(sql: Sql, domains: readonly string[]): Promise<Map<string, SourceCategory>> {
  if (!domains.length) return new Map();
  const rows = await sql<{ domain: string; category: SourceCategory }[]>`
    select domain, category from public.source_domains where domain in ${sql([...new Set(domains)])}`;
  return new Map(rows.map((r) => [r.domain, r.category]));
}

function boundedRaw(raw: unknown): unknown {
  const s = JSON.stringify(raw ?? null);
  return s.length > RAW_MAX_CHARS ? { truncated: true, size: s.length, head: s.slice(0, 20_000) } : raw;
}

export async function saveSuccess(
  sql: Sql,
  run: ClaimedRun,
  result: EngineResult,
  analysis: AnalysisOutput,
): Promise<string> {
  const priorCost = Number(run.cost_usd ?? 0);
  const totalCost = Math.round((priorCost + result.usage.costUsd + analysis.judgeCostUsd) * 1e5) / 1e5;
  return sql.begin(async (tx) => {
    await tx`
      update public.prompt_runs set status = 'succeeded', model = ${result.model}, latency_ms = ${result.latencyMs},
        cost_usd = ${totalCost}, finished_at = now(), adapter_version = ${result.adapterVersion}, error = null,
        external_job_id = null, next_attempt_at = null
      where id = ${run.id}`;
    await tx`delete from public.responses where prompt_run_id = ${run.id}`;
    const words = result.text.trim() ? result.text.trim().split(/\s+/).length : 0;
    const [resp] = await tx<{ id: string }[]>`
      insert into public.responses (org_id, prompt_run_id, text, raw, brand_mentioned, word_count, model, input_tokens,
        output_tokens, search_calls, latency_ms, aio_present, fanout_queries, position_score, visibility_score, owned_cited,
        analysis_version, analyzed_at, judge_cost_usd)
      values (${run.org_id}, ${run.id}, ${result.text}, ${tx.json(boundedRaw(result.raw) as never)}, ${analysis.brandMentioned},
        ${words}, ${result.model}, ${result.usage.inputTokens ?? null}, ${result.usage.outputTokens ?? null},
        ${result.usage.searchCalls ?? null}, ${result.latencyMs}, ${result.aioPresent ?? null}, ${result.fanOutQueries},
        ${analysis.position}, ${analysis.score}, ${analysis.ownedCited}, ${analysis.analysisVersion}, now(), ${analysis.judgeCostUsd})
      returning id`;

    if (analysis.mentions.length) {
      const rows = analysis.mentions.map((m) => ({
        org_id: run.org_id,
        response_id: resp.id,
        prompt_run_id: run.id,
        entity_type: m.entityKind,
        brand_id: m.entityKind === 'brand' ? m.entityId : null,
        competitor_id: m.entityKind === 'competitor' ? m.entityId : null,
        name: m.surface.slice(0, 200),
        position: m.rank,
        sentiment: m.sentiment ? toDbSentiment(m.sentiment.label) : null,
        sentiment_score: m.sentiment?.score ?? null,
        snippet: m.snippet.slice(0, 1000),
        match_type: m.matchType,
        confidence: m.confidence,
        first_offset: m.firstOffset,
        mention_count: m.mentionCount,
        role: m.role,
        aspects: m.sentiment ? tx.json(m.sentiment.aspects as never) : null,
        rubric_version: m.sentiment?.rubricVersion ?? null,
      }));
      await tx`insert into public.mentions ${tx(rows)}`;
    }

    if (analysis.citations.length) {
      const rows = analysis.citations.map((c) => ({
        org_id: run.org_id,
        response_id: resp.id,
        prompt_run_id: run.id,
        url: c.url.slice(0, 2000),
        domain: c.domain,
        title: c.title?.slice(0, 500) ?? null,
        source_type: c.sourceType,
        competitor_id: c.competitorId ?? null,
        position: c.position,
        url_canonical: c.urlCanonical.slice(0, 2000),
        category: c.category,
        cited: c.cited,
        snippet: c.snippet?.slice(0, 1000) ?? null,
      }));
      await tx`insert into public.citations ${tx(rows)}`;
    }

    for (const cand of analysis.candidates) {
      const key = cand.name.toLowerCase().trim();
      if (!key) continue;
      await tx`
        insert into public.entity_candidates (org_id, name, name_key, best_rank, engines)
        values (${run.org_id}, ${cand.name}, ${key}, ${cand.rank}, ${[run.engine_id]})
        on conflict (org_id, name_key) do update set
          mention_count = public.entity_candidates.mention_count + 1,
          best_rank = least(public.entity_candidates.best_rank, excluded.best_rank),
          engines = (select array(select distinct unnest(public.entity_candidates.engines || excluded.engines))),
          last_seen_at = now()`;
    }

    for (const d of analysis.newDomainCategories) {
      await tx`
        insert into public.source_domains (domain, category, category_source, confidence)
        values (${d.domain}, ${d.category}, 'llm', ${d.confidence})
        on conflict (domain) do update set category = excluded.category, confidence = excluded.confidence, updated_at = now()
        where public.source_domains.category_source = 'llm'`;
    }
    return resp.id;
  });
}

export async function markFailed(sql: Sql, runId: string, error: string, addCost = 0): Promise<void> {
  await sql`
    update public.prompt_runs set status = 'failed', error = ${error.slice(0, 1000)}, finished_at = now(),
      next_attempt_at = null, cost_usd = coalesce(cost_usd, 0) + ${addCost}
    where id = ${runId}`;
}

export async function markSkipped(sql: Sql, runId: string, reason: string): Promise<void> {
  await sql`
    update public.prompt_runs set status = 'skipped', error = ${reason.slice(0, 1000)}, finished_at = now(), next_attempt_at = null
    where id = ${runId}`;
}

export async function requeue(sql: Sql, runId: string, error: string, delayMs: number, addCost = 0): Promise<void> {
  await sql`
    update public.prompt_runs set status = 'queued', error = ${error.slice(0, 1000)},
      next_attempt_at = now() + ${`${Math.round(delayMs / 1000)} seconds`}::interval,
      cost_usd = coalesce(cost_usd, 0) + ${addCost}
    where id = ${runId}`;
}

export async function markSubmitted(sql: Sql, runId: string, jobId: string, cost: number, pollAfterMs: number): Promise<void> {
  await sql`
    update public.prompt_runs set external_job_id = ${jobId}, cost_usd = coalesce(cost_usd, 0) + ${cost},
      next_attempt_at = now() + ${`${Math.round(pollAfterMs / 1000)} seconds`}::interval
    where id = ${runId}`;
}

export async function postponePoll(sql: Sql, runId: string, pollAfterMs: number): Promise<void> {
  await sql`
    update public.prompt_runs set next_attempt_at = now() + ${`${Math.round(pollAfterMs / 1000)} seconds`}::interval
    where id = ${runId}`;
}
