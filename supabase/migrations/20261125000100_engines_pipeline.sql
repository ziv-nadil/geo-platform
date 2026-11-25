-- Beacon GEO: engines pipeline (owned by the Engines agent).
-- Additive only: columns the scheduler/worker/analysis need on the monitoring tables from
-- 20261124000300_monitoring.sql, plus three small tables. See docs/research/ai-engine-methodology.md.

-- ---------------------------------------------------------------------------
-- Prompts: cadence tier and importance weight (section 3.8 / 4.2)
-- ---------------------------------------------------------------------------
alter table public.prompts
  add column if not exists tier        text not null default 'tail' check (tier in ('core', 'tail')),
  add column if not exists importance  numeric(6, 3) not null default 1 check (importance > 0),
  add column if not exists branded     boolean not null default false,
  add column if not exists location_code integer;          -- DataForSEO override (else derived from country)

-- ---------------------------------------------------------------------------
-- Brands / competitors: disambiguation inputs for mention detection (section 3.2)
-- ---------------------------------------------------------------------------
alter table public.brands
  add column if not exists extra_domains     text[] not null default '{}',
  add column if not exists negative_aliases  text[] not null default '{}',
  add column if not exists context_terms     text[] not null default '{}';
alter table public.competitors
  add column if not exists extra_domains     text[] not null default '{}',
  add column if not exists negative_aliases  text[] not null default '{}',
  add column if not exists context_terms     text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- prompt_runs: scheduling, idempotency, attempts, async jobs
-- ---------------------------------------------------------------------------
alter table public.prompt_runs
  add column if not exists run_date         date,
  add column if not exists run_index        integer not null default 0,
  add column if not exists trigger          text not null default 'schedule'
                                            check (trigger in ('schedule', 'manual', 'baseline', 'calibration')),
  add column if not exists scheduled_at     timestamptz,
  add column if not exists started_at       timestamptz,
  add column if not exists finished_at      timestamptz,
  add column if not exists attempts         integer not null default 0,
  add column if not exists next_attempt_at  timestamptz,
  add column if not exists external_job_id  text,          -- DataForSEO Standard-queue task id
  add column if not exists adapter_version  text;

-- Idempotency key (section 4.1): one row per prompt/engine/day/run_index/trigger.
create unique index if not exists prompt_runs_idem_idx
  on public.prompt_runs (prompt_id, engine_id, run_date, run_index, trigger)
  where run_date is not null;
create index if not exists prompt_runs_claim_idx
  on public.prompt_runs (status, next_attempt_at)
  where status in ('queued', 'running');
create index if not exists prompt_runs_org_cost_idx
  on public.prompt_runs (org_id, run_at) where cost_usd is not null;

-- ---------------------------------------------------------------------------
-- responses: model + usage + analysis bookkeeping
-- ---------------------------------------------------------------------------
alter table public.responses
  add column if not exists model             text,
  add column if not exists input_tokens      integer,
  add column if not exists output_tokens     integer,
  add column if not exists search_calls      integer,
  add column if not exists latency_ms        integer,
  add column if not exists aio_present       boolean,      -- google_aio only
  add column if not exists fanout_queries    text[] not null default '{}',
  add column if not exists position_score    numeric(6, 4),
  add column if not exists visibility_score  numeric(6, 4), -- score_o in [0,1]
  add column if not exists owned_cited       boolean,
  add column if not exists analysis_version  text,
  add column if not exists analyzed_at       timestamptz,
  add column if not exists judge_cost_usd    numeric(10, 6);

-- ---------------------------------------------------------------------------
-- mentions / citations: audit fields
-- ---------------------------------------------------------------------------
alter table public.mentions
  add column if not exists match_type      text,         -- exact | domain | fuzzy | ambiguous | llm
  add column if not exists confidence      real,
  add column if not exists first_offset    real,
  add column if not exists mention_count   integer not null default 1,
  add column if not exists role            text,         -- recommended | neutral | negative | source_only
  add column if not exists aspects         jsonb,
  add column if not exists rubric_version  text;

alter table public.citations
  add column if not exists url_canonical  text,
  add column if not exists category       text,          -- fine category (owned, ugc_social, video, ...)
  add column if not exists cited          boolean not null default true,  -- false = consulted only
  add column if not exists snippet        text;
create index if not exists citations_org_url_idx on public.citations (org_id, url_canonical);

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

-- Global cache of domain categories (rule | llm | manual). No tenant data.
create table if not exists public.source_domains (
  domain           text primary key,
  category         text not null,
  category_source  text not null check (category_source in ('rule', 'llm', 'manual')),
  confidence       real,
  updated_at       timestamptz not null default now()
);

-- Entities engines named that are not tracked: "emerging competitors" for the agency to confirm.
create table if not exists public.entity_candidates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  name           text not null,
  name_key       text not null,                 -- lowercased, for dedupe
  mention_count  integer not null default 1,
  best_rank      integer,
  engines        text[] not null default '{}',
  status         text not null default 'new' check (status in ('new', 'confirmed', 'ignored')),
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (org_id, name_key)
);
create index if not exists entity_candidates_org_idx on public.entity_candidates (org_id, mention_count desc);

-- Cron bookkeeping (last successful crawler window per org, enqueue runs), service role only.
create table if not exists public.pipeline_state (
  key         text primary key,                 -- e.g. 'crawlers:cloudflare:<org_id>'
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.source_domains enable row level security;
revoke all on public.source_domains from anon;
grant select on public.source_domains to authenticated;
create policy source_domains_select on public.source_domains for select to authenticated using (true);

alter table public.entity_candidates enable row level security;
revoke all on public.entity_candidates from anon;
grant select, update on public.entity_candidates to authenticated;
create policy entity_candidates_select on public.entity_candidates
  for select to authenticated using ((select private.can_read(org_id)));
-- Members may confirm/ignore a candidate (status only is meaningful for the UI).
create policy entity_candidates_update on public.entity_candidates
  for update to authenticated using ((select private.can_write(org_id, 'member'))) with check ((select private.can_write(org_id, 'member')));

alter table public.pipeline_state enable row level security;
revoke all on public.pipeline_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Engine defaults: current models (workers still record the model each API reports)
-- ---------------------------------------------------------------------------
update public.engines set default_model = 'gpt-5.4-mini'      where id = 'chatgpt';
update public.engines set default_model = 'agent:effort=low'  where id = 'perplexity';
update public.engines set default_model = 'gemini-3.8-flash'  where id = 'gemini';
update public.engines set default_model = 'claude-haiku-5-5'  where id = 'claude';
