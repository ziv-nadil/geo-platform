-- Beacon GEO: client onboarding wizard, secret references, integration tests, brand book.
--
-- SECRET HANDLING: secret values never touch Postgres. The wizard POSTs secret fields to
-- /api/onboarding/[orgId]/secrets, which writes them to the client's Infisical project and stores
-- only a reference row in secret_refs. onboarding_progress.data holds non-secret answers only.

create type public.onboarding_status as enum ('not_started', 'in_progress', 'needs_attention', 'complete');
create type public.integration_test_status as enum ('pass', 'partial', 'fail', 'not_configured');

-- Step ids mirror web/src/config/onboarding.ts (company, brand_book, access_method, github, cms,
-- gsc, bing, ga4, gcloud, dns, analytics, aws, cloudflare, slack, review). Kept as text so the
-- product spec can add steps without a migration.
create table public.onboarding_progress (
  org_id        uuid not null references public.organizations (id) on delete cascade,
  step_id       text not null check (step_id ~ '^[a-z0-9_]{1,64}$'),
  status        public.onboarding_status not null default 'not_started',
  data          jsonb not null default '{}'::jsonb,   -- non-secret answers only
  notes         text,
  updated_by    uuid references auth.users (id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (org_id, step_id)
);
create trigger onboarding_progress_updated_at before update on public.onboarding_progress
  for each row execute function private.tg_set_updated_at();
create trigger onboarding_progress_actor before insert or update on public.onboarding_progress
  for each row execute function private.tg_stamp_actor('updated_by');

create or replace function private.tg_onboarding_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'complete' and (tg_op = 'INSERT' or old.status is distinct from 'complete') then
    new.completed_at := now();
  elsif new.status <> 'complete' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger onboarding_progress_completed_at before insert or update on public.onboarding_progress
  for each row execute function private.tg_onboarding_completed_at();

-- Pointer to a secret stored in Infisical. NEVER the value.
create table public.secret_refs (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  step_id               text not null check (step_id ~ '^[a-z0-9_]{1,64}$'),
  field_id              text not null check (field_id ~ '^[a-z0-9_]{1,64}$'),
  infisical_project_id  text not null,
  environment           text not null default 'prod',
  secret_path           text not null default '/' check (secret_path ~ '^/[A-Za-z0-9_/-]*$'),
  secret_name           text not null check (secret_name ~ '^[A-Z0-9_]{1,128}$'),
  infisical_secret_version integer,
  last_tested_at        timestamptz,
  test_status           public.integration_test_status,
  test_message          text,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (org_id, step_id, field_id)
);
create trigger secret_refs_updated_at before update on public.secret_refs
  for each row execute function private.tg_set_updated_at();
create trigger secret_refs_actor before insert on public.secret_refs
  for each row execute function private.tg_stamp_actor('created_by');

-- History of "Test connection" runs. checks = [{id,label,ok,detail}], missing = ["scope x", ...]
create table public.integration_tests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  step_id       text not null,
  status        public.integration_test_status not null,
  checks        jsonb not null default '[]'::jsonb,
  missing       text[] not null default '{}',
  duration_ms   integer,
  triggered_by  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index integration_tests_org_step_idx on public.integration_tests (org_id, step_id, created_at desc);
create trigger integration_tests_actor before insert on public.integration_tests
  for each row execute function private.tg_stamp_actor('triggered_by');

-- Every broker read of a client secret, written BEFORE the Infisical call (security.md §1.5).
create table public.secret_access_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  secret_ref_id  uuid references public.secret_refs (id) on delete set null,
  purpose        text not null check (purpose in ('connection_test', 'job', 'agent_tool', 'rotation')),
  job_id         text,
  worker         text not null,             -- e.g. 'beacon-worker@vercel:prod'
  outcome        text not null default 'requested' check (outcome in ('requested', 'ok', 'denied', 'error'))
);
create index secret_access_log_org_idx on public.secret_access_log (org_id, at desc);

-- ---------------------------------------------------------------------------
-- Brand book
-- ---------------------------------------------------------------------------
create table public.brand_profiles (
  org_id           uuid primary key references public.organizations (id) on delete cascade,
  legal_name       text,
  display_name     text,
  tagline          text,
  description      text,
  industry         text,
  founded_year     integer check (founded_year between 1800 and 2200),
  headquarters     text,
  employee_range   text,
  target_markets   text[] not null default '{}',
  products         jsonb not null default '[]'::jsonb,   -- [{name, url, description}]
  value_props      text[] not null default '{}',
  differentiators  text[] not null default '{}',
  social_links     jsonb not null default '{}'::jsonb,   -- {linkedin, x, youtube, ...}
  colors           jsonb not null default '[]'::jsonb,   -- [{name, hex}]
  fonts            jsonb not null default '[]'::jsonb,
  updated_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger brand_profiles_updated_at before update on public.brand_profiles
  for each row execute function private.tg_set_updated_at();
create trigger brand_profiles_actor before insert or update on public.brand_profiles
  for each row execute function private.tg_stamp_actor('updated_by');

create table public.brand_personas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null,
  role_title   text,
  description  text,
  goals        text[] not null default '{}',
  pain_points  text[] not null default '{}',
  objections   text[] not null default '{}',
  channels     text[] not null default '{}',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index brand_personas_org_idx on public.brand_personas (org_id);
create trigger brand_personas_updated_at before update on public.brand_personas
  for each row execute function private.tg_set_updated_at();

create type public.messaging_kind as enum ('pillar', 'claim', 'proof_point', 'boilerplate', 'cta', 'faq');

create table public.brand_messaging (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  kind        public.messaging_kind not null,
  title       text,
  content     text not null,
  persona_id  uuid references public.brand_personas (id) on delete set null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index brand_messaging_org_idx on public.brand_messaging (org_id);
create trigger brand_messaging_updated_at before update on public.brand_messaging
  for each row execute function private.tg_set_updated_at();

create type public.voice_term_kind as enum ('use', 'avoid', 'trademark', 'glossary', 'tone');

create table public.brand_voice_terms (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  kind         public.voice_term_kind not null,
  term         text not null,
  replacement  text,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (org_id, kind, term)
);

create type public.brand_asset_kind as enum ('logo', 'brand_book', 'font', 'image', 'document', 'other');

-- Metadata for files in the private `brand-assets` bucket; object path = '<org_id>/<file>'.
create table public.brand_assets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  kind          public.brand_asset_kind not null default 'other',
  storage_path  text not null unique,
  filename      text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = org_id::text)
);
create index brand_assets_org_idx on public.brand_assets (org_id);
create trigger brand_assets_actor before insert on public.brand_assets
  for each row execute function private.tg_stamp_actor('uploaded_by');

-- ---------------------------------------------------------------------------
-- Storage bucket (private) + policies on storage.objects
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets', 'brand-assets', false, 52428800,
  array['image/png','image/jpeg','image/svg+xml','image/webp','image/gif','application/pdf',
        'font/woff','font/woff2','font/ttf','font/otf','text/plain','text/markdown']
)
on conflict (id) do update set public = false;

-- NOTE (security.md §3.4/§6.3): SVG and other active formats are stored but must never be rendered
-- inline on the app origin. Serve via signed URL with Content-Disposition: attachment, or rasterize.
create policy "brand-assets: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'brand-assets'
    and (select private.can_read(private.try_uuid((storage.foldername(name))[1])))
  );

create policy "brand-assets: editors upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and (select private.can_write(private.try_uuid((storage.foldername(name))[1]), 'member'))
  );

create policy "brand-assets: editors update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'brand-assets'
    and (select private.can_write(private.try_uuid((storage.foldername(name))[1]), 'member'))
  )
  with check (
    bucket_id = 'brand-assets'
    and (select private.can_write(private.try_uuid((storage.foldername(name))[1]), 'member'))
  );

create policy "brand-assets: admins delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'brand-assets'
    and (select private.can_write(private.try_uuid((storage.foldername(name))[1]), 'admin'))
  );

-- untrusted-html: private bucket for design-system HTML uploads. NO policies for authenticated:
-- uploads go through a server route issuing a signed upload URL for '<org_id>/<uuid>.html', and
-- serving goes through the separate usercontent origin (security.md §6.3).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('untrusted-html', 'untrusted-html', false, 2097152, array['text/html'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['text/html'];
