-- Social pulse: a daily per-org agent that reads public Reddit / X / LinkedIn discussion (Apify public-data actors only),
-- clusters it into insights and proposes GEO-first content titles. Slack identifiers live here; secrets live in Infisical.

create table public.social_pulse_settings (
  org_id                  uuid primary key references public.organizations (id) on delete cascade,
  enabled                 boolean not null default false,
  platforms               text[] not null default '{reddit,x,linkedin}',
  extra_keywords          text[] not null default '{}',
  max_items_per_platform  integer not null default 30 check (max_items_per_platform between 5 and 100),
  max_runs_per_day        integer not null default 3 check (max_runs_per_day between 1 and 10),
  monthly_budget_usd      numeric(8, 2) not null default 10 check (monthly_budget_usd >= 0 and monthly_budget_usd <= 1000),
  slack_channel           text,                 -- channel name, e.g. geo-social-pulse
  slack_channel_id        text,
  slack_app_id            text unique,          -- api_app_id in interaction payloads; routes /api/slack/interactions to this org
  slack_team_id           text,
  last_run_on             date,
  updated_at              timestamptz not null default now()
);
create trigger social_pulse_settings_updated_at before update on public.social_pulse_settings
  for each row execute function private.tg_set_updated_at();
select private.apply_tenant_rls('public.social_pulse_settings', 'admin', 'admin');

-- One row per Apify actor run: drives the daily run cap and the monthly USD guard (cost read back from the Apify run).
create table public.social_pulse_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  platform      text not null check (platform in ('reddit', 'x', 'linkedin')),
  actor_id      text not null,
  apify_run_id  text,
  status        text not null default 'started' check (status in ('started', 'succeeded', 'failed', 'skipped')),
  items         integer not null default 0,
  cost_usd      numeric(10, 5) not null default 0,
  message       text,
  created_at    timestamptz not null default now()
);
create index social_pulse_runs_org_idx on public.social_pulse_runs (org_id, created_at desc);
select private.apply_tenant_rls('public.social_pulse_runs', 'member', 'admin');

-- Dedupe: every external post seen, so the same discussion is never analysed twice.
create table public.social_pulse_seen (
  org_id       uuid not null references public.organizations (id) on delete cascade,
  platform     text not null,
  external_id  text not null,
  seen_at      timestamptz not null default now(),
  primary key (org_id, platform, external_id)
);
select private.apply_tenant_rls('public.social_pulse_seen', 'member', 'admin');

create table public.social_insights (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  pulse_date  date not null default current_date,
  title       text not null,
  summary     text not null,
  sentiment   text not null check (sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  platforms   text[] not null default '{}',
  sources     jsonb not null default '[]'::jsonb,   -- [{platform,url,title,snippet}]
  model       text,
  slack_ts    text,                                 -- parent message ts once posted to Slack
  created_at  timestamptz not null default now()
);
create index social_insights_org_idx on public.social_insights (org_id, pulse_date desc);
select private.apply_tenant_rls('public.social_insights', 'member', 'admin');

create table public.title_suggestions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  insight_id   uuid not null references public.social_insights (id) on delete cascade,
  title        text not null,
  rationale    text not null default '',
  prompt_text  text,                                -- the tracked prompt this title targets
  status       text not null default 'suggested' check (status in ('suggested', 'approved', 'rejected', 'created', 'failed')),
  decided_via  text check (decided_via in ('app', 'slack')),
  decided_by   text,
  gap_id       uuid references public.content_gaps (id) on delete set null,
  item_id      uuid references public.content_items (id) on delete set null,
  error        text,
  created_at   timestamptz not null default now(),
  unique (insight_id, title)
);
create index title_suggestions_org_idx on public.title_suggestions (org_id, status, created_at desc);
select private.apply_tenant_rls('public.title_suggestions', 'member', 'admin');
