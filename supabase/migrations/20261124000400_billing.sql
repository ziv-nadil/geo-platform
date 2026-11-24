-- Beacon GEO: plans, Stripe subscriptions, usage counters.
-- Stripe is the source of truth; /api/stripe/webhook (service role) mirrors it here.

create table public.plans (
  id                   text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name                 text not null,
  description          text,
  stripe_price_id      text unique,          -- null until Stripe products exist
  monthly_price_cents  integer not null default 0 check (monthly_price_cents >= 0),
  seat_limit           integer,              -- null = unlimited
  prompt_limit         integer,
  engine_limit         integer,
  runs_per_month       integer,
  features             jsonb not null default '{}'::jsonb,
  active               boolean not null default true,
  sort_order           integer not null default 0
);

insert into public.plans (id, name, description, monthly_price_cents, seat_limit, prompt_limit, engine_limit, runs_per_month, features, sort_order) values
  ('trial',   'Trial',   'Onboarding and a 14-day look at the dashboard', 0,      3,  25,  2,  1500,  '{"site_health": false, "content": false}', 0),
  ('starter', 'Starter', 'Core visibility tracking',                    49900,  5,  100, 4,  12000, '{"site_health": true, "content": false}', 1),
  ('growth',  'Growth',  'Tracking + action center',                    99900,  10, 300, 6,  36000, '{"site_health": true, "content": true, "creators": true}', 2),
  ('agency',  'Agency',  'Custom, managed by Beacon',                   0,      null, null, null, null, '{"site_health": true, "content": true, "creators": true, "outreach": true}', 3);

alter table public.organizations
  add constraint organizations_plan_fkey foreign key (plan) references public.plans (id);

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
);

create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations (id) on delete cascade,
  plan_id                 text references public.plans (id),
  stripe_customer_id      text not null,
  stripe_subscription_id  text not null unique,
  stripe_price_id         text,
  status                  public.subscription_status not null,
  seats                   integer not null default 1 check (seats >= 0),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  canceled_at             timestamptz,
  trial_end               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index subscriptions_org_idx on public.subscriptions (org_id);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- Monthly (or daily) counters, e.g. metric = 'prompt_runs', 'content_generations', 'seats'.
create table public.usage_counters (
  org_id        uuid not null references public.organizations (id) on delete cascade,
  metric        text not null check (metric ~ '^[a-z0-9_]{2,64}$'),
  period_start  date not null,
  value         bigint not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (org_id, metric, period_start)
);

-- Atomic increment for workers (service role only; see grants in the RLS migration).
create or replace function public.increment_usage(p_org_id uuid, p_metric text, p_amount bigint default 1, p_period date default date_trunc('month', now())::date)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters (org_id, metric, period_start, value)
  values (p_org_id, p_metric, p_period, p_amount)
  on conflict (org_id, metric, period_start)
  do update set value = public.usage_counters.value + excluded.value, updated_at = now()
  returning value;
$$;

-- Idempotency log for Stripe webhooks (service role only; no client policies).
create table public.stripe_events (
  id            text primary key,          -- evt_...
  type          text not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);
