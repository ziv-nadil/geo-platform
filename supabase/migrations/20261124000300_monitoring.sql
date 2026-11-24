-- Beacon GEO: AI-visibility monitoring (AthenaHQ parity).
--
-- Flow: prompts x engines -> prompt_runs -> responses -> mentions + citations.
-- Workers (service role) write runs/responses/mentions/citations; clients only read them.

create type public.funnel_stage as enum ('awareness', 'consideration', 'decision', 'retention');
create type public.prompt_source as enum ('manual', 'discovered', 'imported', 'suggested');
create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed', 'skipped');
create type public.mention_entity as enum ('brand', 'competitor');
create type public.sentiment as enum ('positive', 'neutral', 'negative');
create type public.source_type as enum ('owned', 'competitor', 'earned', 'ugc', 'other');

-- ---------------------------------------------------------------------------
-- Brands (websites) and competitors
-- ---------------------------------------------------------------------------
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  domain      text not null,                     -- e.g. "acme.com" (no scheme)
  aliases     text[] not null default '{}',      -- names to match in answers
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, domain)
);
create unique index brands_one_primary on public.brands (org_id) where is_primary;
create trigger brands_updated_at before update on public.brands
  for each row execute function private.tg_set_updated_at();

create table public.competitors (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  brand_id    uuid references public.brands (id) on delete cascade,
  name        text not null,
  domain      text,
  aliases     text[] not null default '{}',
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, name)
);
create index competitors_org_idx on public.competitors (org_id);
create trigger competitors_updated_at before update on public.competitors
  for each row execute function private.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Prompts
-- ---------------------------------------------------------------------------
create table public.topics (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  brand_id     uuid references public.brands (id) on delete cascade,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now(),
  unique (org_id, name)
);

create table public.prompts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  brand_id      uuid references public.brands (id) on delete cascade,
  topic_id      uuid references public.topics (id) on delete set null,
  persona_id    uuid references public.brand_personas (id) on delete set null,
  text          text not null check (char_length(text) between 3 and 2000),
  funnel_stage  public.funnel_stage,
  locale        text not null default 'en-US' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  country       text check (country is null or country ~ '^[A-Z]{2}$'),
  tags          text[] not null default '{}',
  source        public.prompt_source not null default 'manual',
  active        boolean not null default true,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index prompts_org_active_idx on public.prompts (org_id) where active;
create index prompts_topic_idx on public.prompts (topic_id);
create trigger prompts_updated_at before update on public.prompts
  for each row execute function private.tg_set_updated_at();
create trigger prompts_actor before insert on public.prompts
  for each row execute function private.tg_stamp_actor('created_by');

-- ---------------------------------------------------------------------------
-- Engines (global reference data)
-- ---------------------------------------------------------------------------
create table public.engines (
  id             text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name           text not null,
  provider       text not null,      -- openai | perplexity | google | anthropic | dataforseo | microsoft
  default_model  text,
  method         text not null,      -- 'api' | 'serp'
  active         boolean not null default true,
  sort_order     integer not null default 0
);

-- Which engines each org tracks (plan-limited).
create table public.org_engines (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  engine_id  text not null references public.engines (id) on delete cascade,
  enabled    boolean not null default true,
  primary key (org_id, engine_id)
);

-- ---------------------------------------------------------------------------
-- Runs, responses, mentions, citations
-- ---------------------------------------------------------------------------
create table public.prompt_runs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  prompt_id    uuid not null references public.prompts (id) on delete cascade,
  engine_id    text not null references public.engines (id),
  run_at       timestamptz not null default now(),
  model        text,
  status       public.run_status not null default 'queued',
  error        text,
  latency_ms   integer,
  cost_usd     numeric(10, 5),
  batch_id     uuid,
  created_at   timestamptz not null default now()
);
create index prompt_runs_org_time_idx on public.prompt_runs (org_id, run_at desc);
create index prompt_runs_prompt_idx on public.prompt_runs (prompt_id, engine_id, run_at desc);

create table public.responses (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  prompt_run_id    uuid not null unique references public.prompt_runs (id) on delete cascade,
  text             text not null,
  raw              jsonb,                       -- provider payload (trimmed)
  brand_mentioned  boolean not null default false,
  word_count       integer,
  created_at       timestamptz not null default now()
);
create index responses_org_idx on public.responses (org_id, created_at desc);

create table public.mentions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  response_id      uuid not null references public.responses (id) on delete cascade,
  prompt_run_id    uuid not null references public.prompt_runs (id) on delete cascade,
  entity_type      public.mention_entity not null,
  brand_id         uuid references public.brands (id) on delete cascade,
  competitor_id    uuid references public.competitors (id) on delete cascade,
  name             text not null,               -- surface form found in the answer
  position         integer check (position >= 1), -- rank order among entities in the answer
  sentiment        public.sentiment,
  sentiment_score  numeric(4, 3) check (sentiment_score between -1 and 1),
  snippet          text,
  created_at       timestamptz not null default now(),
  check (
    (entity_type = 'brand' and brand_id is not null and competitor_id is null) or
    (entity_type = 'competitor' and competitor_id is not null and brand_id is null)
  )
);
create index mentions_org_idx on public.mentions (org_id, created_at desc);
create index mentions_run_idx on public.mentions (prompt_run_id);
create index mentions_competitor_idx on public.mentions (competitor_id) where competitor_id is not null;

create table public.citations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  response_id    uuid not null references public.responses (id) on delete cascade,
  prompt_run_id  uuid not null references public.prompt_runs (id) on delete cascade,
  url            text not null,
  domain         text not null,
  title          text,
  source_type    public.source_type not null default 'other',
  competitor_id  uuid references public.competitors (id) on delete set null,
  position       integer check (position >= 1),
  created_at     timestamptz not null default now()
);
create index citations_org_idx on public.citations (org_id, created_at desc);
create index citations_domain_idx on public.citations (org_id, domain);
create index citations_run_idx on public.citations (prompt_run_id);

-- Source tags: user-defined labels for citation domains/URLs (e.g. "Review sites", "Docs").
create table public.source_tags (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null,
  color        text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  description  text,
  created_at   timestamptz not null default now(),
  unique (org_id, name)
);

create table public.source_tag_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  tag_id      uuid not null references public.source_tags (id) on delete cascade,
  match_type  text not null check (match_type in ('domain', 'url_prefix')),
  pattern     text not null,
  created_at  timestamptz not null default now(),
  unique (tag_id, match_type, pattern)
);

-- ---------------------------------------------------------------------------
-- Site health (crawl audits)
-- ---------------------------------------------------------------------------
create type public.issue_severity as enum ('critical', 'high', 'medium', 'low', 'info');
create type public.issue_status as enum ('open', 'in_progress', 'resolved', 'ignored');

create table public.site_health_properties (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  brand_id        uuid references public.brands (id) on delete cascade,
  root_url        text not null,
  score           numeric(5, 2) check (score between 0 and 100),
  pages_crawled   integer not null default 0,
  last_audit_at   timestamptz,
  audit_status    public.run_status,
  created_at      timestamptz not null default now(),
  unique (org_id, root_url)
);

create table public.site_health_pages (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  property_id      uuid not null references public.site_health_properties (id) on delete cascade,
  url              text not null,
  status_code      integer,
  score            numeric(5, 2) check (score between 0 and 100),
  title            text,
  word_count       integer,
  has_schema       boolean,
  issues_count     integer not null default 0,
  data             jsonb not null default '{}'::jsonb,
  last_crawled_at  timestamptz,
  unique (property_id, url)
);

create table public.site_health_issues (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  property_id     uuid not null references public.site_health_properties (id) on delete cascade,
  code            text not null,               -- e.g. 'missing_llms_txt', 'blocked_gptbot'
  title           text not null,
  category        text,                        -- crawlability | content | schema | performance
  severity        public.issue_severity not null default 'medium',
  status          public.issue_status not null default 'open',
  recommendation  text,
  affected_pages  integer not null default 0,
  first_seen_at   timestamptz not null default now(),
  resolved_at     timestamptz,
  unique (property_id, code)
);

create table public.site_health_issue_pages (
  issue_id  uuid not null references public.site_health_issues (id) on delete cascade,
  page_id   uuid not null references public.site_health_pages (id) on delete cascade,
  org_id    uuid not null references public.organizations (id) on delete cascade,
  detail    text,
  primary key (issue_id, page_id)
);

-- ---------------------------------------------------------------------------
-- AI crawler analytics (Cloudflare logs / GraphQL analytics)
-- ---------------------------------------------------------------------------
create table public.crawler_hits (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  property_id   uuid references public.site_health_properties (id) on delete set null,
  ts            timestamptz not null,
  bot           text not null,                  -- GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Google-Extended...
  bot_operator  text,                           -- OpenAI, Perplexity, Anthropic, Google, ...
  path          text not null,
  status        integer,
  hits          integer not null default 1,     -- pre-aggregated counts are allowed
  country       text,
  source        text not null default 'cloudflare'
);
create index crawler_hits_org_ts_idx on public.crawler_hits (org_id, ts desc);
create index crawler_hits_org_bot_idx on public.crawler_hits (org_id, bot, ts desc);

-- ---------------------------------------------------------------------------
-- Action center: content, creators, outreach, reports
-- ---------------------------------------------------------------------------
create type public.content_status as enum ('idea', 'draft', 'in_review', 'approved', 'published', 'archived');

create table public.content_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  brand_id            uuid references public.brands (id) on delete set null,
  prompt_id           uuid references public.prompts (id) on delete set null,
  title               text not null,
  content_type        text not null default 'article',   -- article | faq | comparison | listicle | landing | social
  status              public.content_status not null default 'idea',
  target_url          text,
  published_url       text,
  body_md             text,
  brief               jsonb not null default '{}'::jsonb,
  brand_kit_snapshot  jsonb,                              -- brand book state used for generation
  model               text,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index content_items_org_idx on public.content_items (org_id, status);
create trigger content_items_updated_at before update on public.content_items
  for each row execute function private.tg_set_updated_at();
create trigger content_items_actor before insert on public.content_items
  for each row execute function private.tg_stamp_actor('created_by');

create type public.creator_platform as enum ('youtube', 'tiktok');

create table public.creators (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  platform         public.creator_platform not null,
  external_id      text,
  handle           text not null,
  display_name     text,
  url              text,
  followers        bigint,
  avg_views        bigint,
  relevance_score  numeric(5, 2),
  topics           text[] not null default '{}',
  cited_count      integer not null default 0,      -- times their content was cited by AI engines
  status           text not null default 'new' check (status in ('new', 'shortlisted', 'contacted', 'partnered', 'ignored')),
  data             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (org_id, platform, handle)
);

create type public.outreach_status as enum ('new', 'queued', 'contacted', 'replied', 'won', 'lost', 'ignored');

create table public.outreach_contacts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  name               text,
  email              extensions.citext,
  publication        text,
  url                text,
  domain             text,
  role_title         text,
  status             public.outreach_status not null default 'new',
  citation_count     integer not null default 0,
  notes              text,
  last_contacted_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index outreach_contacts_org_idx on public.outreach_contacts (org_id, status);
create trigger outreach_contacts_updated_at before update on public.outreach_contacts
  for each row execute function private.tg_set_updated_at();

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  title         text not null,
  report_type   text not null default 'visibility',  -- visibility | competitors | citations | executive
  period_start  date,
  period_end    date,
  status        public.run_status not null default 'queued',
  schedule      text,                                -- null = one-off; 'weekly' | 'monthly'
  storage_path  text,
  data          jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create trigger reports_actor before insert on public.reports
  for each row execute function private.tg_stamp_actor('created_by');

-- ---------------------------------------------------------------------------
-- API keys (hashed) and audit log
-- ---------------------------------------------------------------------------
create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null,
  prefix        text not null,               -- first chars shown in UI, e.g. "bk_live_ab12"
  key_hash      text not null unique,        -- sha256 hex of the full key
  scopes        text[] not null default '{read}',
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index api_keys_org_idx on public.api_keys (org_id);
create trigger api_keys_actor before insert on public.api_keys
  for each row execute function private.tg_stamp_actor('created_by');

-- Audit lives in public.audit_events (client-visible, staff masked) and public.platform_audit_log
-- (staff only), both created in 20261124000100_tenancy.sql.
