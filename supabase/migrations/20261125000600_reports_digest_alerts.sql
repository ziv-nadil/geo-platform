-- Reports storage, weekly digest opt-out, alert de-duplication.

-- Private bucket for generated report files (PDF/CSV/JSON). Writes are service-role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 20971520, array['application/pdf', 'text/csv', 'application/json'])
on conflict (id) do update set public = false;

create policy "reports: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'reports'
    and (select private.can_read(private.try_uuid((storage.foldername(name))[1])))
  );

-- Per-user weekly digest opt-out (users update their own profile row via existing RLS).
alter table public.profiles add column if not exists digest_opt_out boolean not null default false;

-- One row per fired alert; (org_id, dedupe_key) makes cron retries and overlapping runs idempotent.
create table public.alert_events (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  kind        text not null check (kind in ('visibility_drop', 'competitor_citation', 'crawler_block')),
  dedupe_key  text not null,
  payload     jsonb not null default '{}'::jsonb,
  delivered   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (org_id, dedupe_key)
);
alter table public.alert_events enable row level security;
revoke all on public.alert_events from anon, authenticated;  -- service role only
