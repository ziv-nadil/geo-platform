-- GEO content pipeline: per-org settings, planner title suggestions, competitive research, briefs,
-- article columns on content_items, and a private bucket for generated images.

create table public.content_settings (
  org_id            uuid primary key references public.organizations (id) on delete cascade,
  mode              text not null default 'approve' check (mode in ('approve', 'auto')),  -- auto = generate + deliver CMS drafts, never live
  default_words     integer not null default 1800 check (default_words between 600 and 5000),
  planner_cadence   text not null default 'weekly' check (planner_cadence in ('off', 'daily', 'weekly')),
  max_per_run       integer not null default 3 check (max_per_run between 1 and 10),
  last_planned_at   timestamptz,
  updated_at        timestamptz not null default now()
);
create trigger content_settings_updated_at before update on public.content_settings
  for each row execute function private.tg_set_updated_at();
select private.apply_tenant_rls('public.content_settings', 'admin', 'admin');

-- Titles the planner proposes per gap (several per gap, each with a rationale). The user picks one.
create table public.content_suggestions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  gap_id       uuid not null references public.content_gaps (id) on delete cascade,
  prompt_id    uuid references public.prompts (id) on delete set null,
  prompt_text  text,
  title        text not null,
  angle        text,
  rationale    text not null default '',
  status       text not null default 'suggested' check (status in ('suggested', 'selected', 'dismissed', 'created')),
  created_at   timestamptz not null default now(),
  unique (gap_id, title)
);
create index content_suggestions_org_idx on public.content_suggestions (org_id, status, created_at desc);
select private.apply_tenant_rls('public.content_suggestions');

-- Competitive research for one target prompt: AI-cited pages + top organic results, analysed.
create table public.content_research (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  gap_id       uuid references public.content_gaps (id) on delete set null,
  prompt_id    uuid references public.prompts (id) on delete set null,
  prompt_text  text not null,
  status       text not null default 'pending' check (status in ('pending', 'ready', 'partial', 'failed')),
  sources      jsonb not null default '[]'::jsonb,   -- [{url,kind:'cited'|'serp',rank,structure:{words,h2,tables,faq,stats,schema,freshness}}]
  summary      jsonb not null default '{}'::jsonb,   -- aggregate benchmarks (median words, % with tables/faq/schema, ...)
  notes        text[] not null default '{}',         -- degradations, e.g. "DataForSEO not_configured"
  created_at   timestamptz not null default now()
);
create index content_research_org_idx on public.content_research (org_id, created_at desc);
select private.apply_tenant_rls('public.content_research');

-- "How we beat them" brief.
create table public.content_briefs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  gap_id        uuid references public.content_gaps (id) on delete set null,
  research_id   uuid references public.content_research (id) on delete set null,
  suggestion_id uuid references public.content_suggestions (id) on delete set null,
  title         text not null,
  target_words  integer not null default 1800 check (target_words between 600 and 5000),
  brief         jsonb not null default '{}'::jsonb,
  model         text,
  created_at    timestamptz not null default now()
);
create index content_briefs_org_idx on public.content_briefs (org_id, created_at desc);
select private.apply_tenant_rls('public.content_briefs');

alter table public.content_items
  add column brief_id     uuid references public.content_briefs (id) on delete set null,
  add column target_words integer check (target_words is null or target_words between 600 and 5000),
  add column word_count   integer,
  add column article      jsonb,   -- structured GEO article (sections, tables, faq, charts, citations)
  add column images       jsonb not null default '[]'::jsonb,  -- [{kind,path,alt,mime,caption}] in the content-images bucket
  add column auto_created boolean not null default false;
create index content_items_brief_idx on public.content_items (brief_id);

-- Private bucket for generated hero/illustration/chart images. Writes are service-role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-images', 'content-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = false;

create policy "content-images: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'content-images'
    and (select private.can_read(private.try_uuid((storage.foldername(name))[1])))
  );
