-- Headline metric = methodology responses.visibility_score (docs/BACKLOG.md Integration TODO).
-- analytics.org_engine_daily.visibility_score becomes the mean score x 100 (0..100, scored responses only);
-- the old "% runs mentioned" moves to pct_runs_mentioned (secondary). scored_runs is the weight for re-aggregation.
-- Also adds public.brand_kits (brand style fields previously in organizations.settings.brand_kit).

drop view if exists public.metrics_daily;
drop materialized view if exists analytics.org_engine_daily;

create materialized view analytics.org_engine_daily as
with runs as (
  select pr.org_id, pr.engine_id, (pr.run_at at time zone 'utc')::date as day,
         pr.id as run_id, coalesce(r.brand_mentioned, false) as brand_mentioned,
         r.visibility_score as score
  from public.prompt_runs pr
  left join public.responses r on r.prompt_run_id = pr.id
  where pr.status = 'succeeded'
),
run_agg as (
  select org_id, engine_id, day,
         count(*)::int as runs,
         count(*) filter (where brand_mentioned)::int as runs_with_brand,
         count(score)::int as scored_runs,
         avg(score) as score_avg
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
  -- Headline: mean methodology score (responses.visibility_score, 0..1) x 100 over scored responses.
  round(100.0 * ra.score_avg, 2) as visibility_score,
  ra.scored_runs,
  -- Secondary: % of successful runs whose answer mentions the brand.
  round(100.0 * ra.runs_with_brand / nullif(ra.runs, 0), 2) as pct_runs_mentioned,
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

create view public.metrics_daily
with (security_barrier = true)
as
select * from analytics.org_engine_daily d
where private.can_read(d.org_id)
  and private.aal_ok()
  and private.org_mfa_ok(d.org_id);

revoke all on public.metrics_daily from anon;
grant select on public.metrics_daily to authenticated;

-- ---------------------------------------------------------------------------
-- brand_kits: one row per org (style fields of the brand kit)
-- ---------------------------------------------------------------------------
create table public.brand_kits (
  org_id      uuid primary key references public.organizations (id) on delete cascade,
  style       jsonb not null default '{}'::jsonb check (jsonb_typeof(style) = 'object'),
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger brand_kits_actor before insert on public.brand_kits
  for each row execute function private.tg_stamp_actor('updated_by');

create trigger brand_kits_updated_at before update on public.brand_kits
  for each row execute function private.tg_set_updated_at();

select private.apply_tenant_rls('public.brand_kits');

-- Move existing data off organizations.settings.
insert into public.brand_kits (org_id, style)
select id, settings -> 'brand_kit' from public.organizations
where jsonb_typeof(settings -> 'brand_kit') = 'object'
on conflict (org_id) do nothing;
update public.organizations set settings = settings - 'brand_kit' where settings ? 'brand_kit';

-- Favicons: allow .ico in the private brand-assets bucket (still private; never rendered inline).
update storage.buckets
set allowed_mime_types = (select array(select distinct unnest(allowed_mime_types || array['image/x-icon','image/vnd.microsoft.icon'])))
where id = 'brand-assets';
