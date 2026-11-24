-- Beacon GEO: dashboard metrics.
--
-- Definitions (shown as tooltips in the UI):
--   visibility_score   % of successful runs whose answer mentions the client's brand.
--   share_of_voice     brand mentions / (brand + competitor mentions), in %.
--   citation_share     citations pointing at owned domains / all citations, in %.
--   avg_brand_position mean rank of the brand among entities listed in an answer (1 = first).
--   sentiment_avg      mean sentiment_score (-1..1) of brand mentions.
--
-- Two layers:
--   * analytics.org_engine_daily: MATERIALIZED view (fast; refreshed by public.refresh_metrics()).
--     It lives in a schema that is NOT exposed through the API, and is read through
--     public.metrics_daily, which filters rows with can_read_org().
--   * Plain security_invoker views (RLS of the base tables applies): competitor share of voice,
--     citation domains, prompt-level visibility. Always fresh, fine at ~20 orgs.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create materialized view analytics.org_engine_daily as
with runs as (
  select pr.org_id, pr.engine_id, (pr.run_at at time zone 'utc')::date as day,
         pr.id as run_id, coalesce(r.brand_mentioned, false) as brand_mentioned
  from public.prompt_runs pr
  left join public.responses r on r.prompt_run_id = pr.id
  where pr.status = 'succeeded'
),
run_agg as (
  select org_id, engine_id, day,
         count(*)::int as runs,
         count(*) filter (where brand_mentioned)::int as runs_with_brand
  from runs group by 1, 2, 3
),
mention_agg as (
  select ru.org_id, ru.engine_id, ru.day,
         count(*) filter (where m.entity_type = 'brand')::int as brand_mentions,
         count(*) filter (where m.entity_type = 'competitor')::int as competitor_mentions,
         avg(m.position) filter (where m.entity_type = 'brand') as avg_brand_position,
         avg(m.sentiment_score) filter (where m.entity_type = 'brand') as sentiment_avg,
         count(*) filter (where m.entity_type = 'brand' and m.sentiment = 'positive')::int as positive,
         count(*) filter (where m.entity_type = 'brand' and m.sentiment = 'neutral')::int as neutral,
         count(*) filter (where m.entity_type = 'brand' and m.sentiment = 'negative')::int as negative
  from runs ru join public.mentions m on m.prompt_run_id = ru.run_id
  group by 1, 2, 3
),
citation_agg as (
  select ru.org_id, ru.engine_id, ru.day,
         count(*)::int as citations_total,
         count(*) filter (where c.source_type = 'owned')::int as citations_owned,
         count(*) filter (where c.source_type = 'competitor')::int as citations_competitor
  from runs ru join public.citations c on c.prompt_run_id = ru.run_id
  group by 1, 2, 3
)
select
  ra.org_id, ra.engine_id, ra.day,
  ra.runs, ra.runs_with_brand,
  round(100.0 * ra.runs_with_brand / nullif(ra.runs, 0), 2) as visibility_score,
  coalesce(ma.brand_mentions, 0) as brand_mentions,
  coalesce(ma.competitor_mentions, 0) as competitor_mentions,
  round(100.0 * coalesce(ma.brand_mentions, 0)
        / nullif(coalesce(ma.brand_mentions, 0) + coalesce(ma.competitor_mentions, 0), 0), 2) as share_of_voice,
  coalesce(ca.citations_total, 0) as citations_total,
  coalesce(ca.citations_owned, 0) as citations_owned,
  coalesce(ca.citations_competitor, 0) as citations_competitor,
  round(100.0 * coalesce(ca.citations_owned, 0) / nullif(ca.citations_total, 0), 2) as citation_share,
  round(ma.avg_brand_position, 2) as avg_brand_position,
  round(ma.sentiment_avg, 3) as sentiment_avg,
  coalesce(ma.positive, 0) as positive,
  coalesce(ma.neutral, 0) as neutral,
  coalesce(ma.negative, 0) as negative
from run_agg ra
left join mention_agg ma using (org_id, engine_id, day)
left join citation_agg ca using (org_id, engine_id, day)
with no data;

create unique index org_engine_daily_pk on analytics.org_engine_daily (org_id, engine_id, day);

-- Tenant-filtered window onto the materialized view (definer view: owner reads analytics,
-- the WHERE clause enforces tenancy for the caller).
create view public.metrics_daily
with (security_barrier = true)
as
select * from analytics.org_engine_daily d
where public.can_read_org(d.org_id);

revoke all on public.metrics_daily from anon;
grant select on public.metrics_daily to authenticated;

create or replace function public.refresh_metrics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from analytics.org_engine_daily limit 1) then
    refresh materialized view concurrently analytics.org_engine_daily;
  else
    refresh materialized view analytics.org_engine_daily;
  end if;
exception when object_not_in_prerequisite_state then
  -- never populated yet: concurrent refresh is not allowed
  refresh materialized view analytics.org_engine_daily;
end;
$$;
revoke execute on function public.refresh_metrics() from public, anon, authenticated;
grant execute on function public.refresh_metrics() to service_role;

-- ---------------------------------------------------------------------------
-- Always-fresh views (security_invoker => base-table RLS applies to the caller)
-- ---------------------------------------------------------------------------

-- Share of voice per entity (brand + each competitor) per engine per day.
create view public.share_of_voice_daily
with (security_invoker = true)
as
with m as (
  select m.org_id, pr.engine_id, (pr.run_at at time zone 'utc')::date as day,
         m.entity_type,
         coalesce(m.brand_id, m.competitor_id) as entity_id,
         coalesce(b.name, c.name) as entity_name,
         m.sentiment_score, m.position
  from public.mentions m
  join public.prompt_runs pr on pr.id = m.prompt_run_id
  left join public.brands b on b.id = m.brand_id
  left join public.competitors c on c.id = m.competitor_id
  where pr.status = 'succeeded'
)
select org_id, engine_id, day, entity_type, entity_id, entity_name,
       count(*)::int as mentions,
       round(100.0 * count(*) / sum(count(*)) over (partition by org_id, engine_id, day), 2) as share_of_voice,
       round(avg(position), 2) as avg_position,
       round(avg(sentiment_score), 3) as sentiment_avg
from m
group by org_id, engine_id, day, entity_type, entity_id, entity_name;

-- Citation domains with type and share (all time; filter by day in the query if needed).
create view public.citation_domains_daily
with (security_invoker = true)
as
select c.org_id, pr.engine_id, (pr.run_at at time zone 'utc')::date as day,
       c.domain, c.source_type,
       count(*)::int as citations,
       count(distinct c.prompt_run_id)::int as runs_citing,
       round(100.0 * count(*) / sum(count(*)) over (partition by c.org_id, pr.engine_id, (pr.run_at at time zone 'utc')::date), 2) as citation_share
from public.citations c
join public.prompt_runs pr on pr.id = c.prompt_run_id
group by c.org_id, pr.engine_id, (pr.run_at at time zone 'utc')::date, c.domain, c.source_type;

-- Per-prompt visibility over the last 30 days (Prompts tab).
create view public.prompt_visibility_30d
with (security_invoker = true)
as
select p.org_id, p.id as prompt_id, p.text, p.topic_id, p.funnel_stage, pr.engine_id,
       count(pr.id)::int as runs,
       count(pr.id) filter (where r.brand_mentioned)::int as runs_with_brand,
       round(100.0 * count(pr.id) filter (where r.brand_mentioned) / nullif(count(pr.id), 0), 2) as visibility_score,
       max(pr.run_at) as last_run_at
from public.prompts p
join public.prompt_runs pr on pr.prompt_id = p.id
  and pr.status = 'succeeded'
  and pr.run_at >= now() - interval '30 days'
left join public.responses r on r.prompt_run_id = pr.id
group by p.org_id, p.id, p.text, p.topic_id, p.funnel_stage, pr.engine_id;

-- AI crawler hits per bot per day.
create view public.crawler_hits_daily
with (security_invoker = true)
as
select org_id, (ts at time zone 'utc')::date as day, bot, bot_operator,
       sum(hits)::bigint as hits,
       count(distinct path)::int as unique_paths,
       sum(hits) filter (where status >= 400)::bigint as error_hits
from public.crawler_hits
group by org_id, (ts at time zone 'utc')::date, bot, bot_operator;

-- Onboarding completion per org (super-admin console + progress bar).
create view public.onboarding_summary
with (security_invoker = true)
as
select o.id as org_id,
       count(op.step_id)::int as steps_touched,
       count(op.step_id) filter (where op.status = 'complete')::int as steps_complete,
       count(op.step_id) filter (where op.status = 'needs_attention')::int as steps_needing_attention,
       max(op.updated_at) as last_activity_at
from public.organizations o
left join public.onboarding_progress op on op.org_id = o.id
group by o.id;

revoke all on public.share_of_voice_daily, public.citation_domains_daily, public.prompt_visibility_30d,
              public.crawler_hits_daily, public.onboarding_summary from anon;
