-- =====================================================================================
-- ASO Engine: RLS helper functions and policy reference (Security architect, 2026-11-24)
-- Design: docs/architecture/security.md, §3.
--
-- STATUS: reference, not a migration. The backend agent integrates it into supabase/migrations/.
-- It assumes the tenancy migration (20261124000100_tenancy.sql) has run: public.org_role,
-- public.organizations, public.memberships, public.platform_admins, public.secret_refs,
-- public.integration_tests.
--
-- Key differences from the draft tenancy migration (see security.md §3.4):
--   1. Helpers live in schema `private`, which the Data API does not expose, so they cannot be called
--      via /rest/v1/rpc and leak nothing (e.g. "is this uuid a staff member?").
--   2. is_platform_admin() requires an MFA session (aal2) and a non-disabled staff row.
--   3. Tenant tables have NO blanket staff bypass. Staff read/write a tenant only through an audited,
--      time-boxed, per-org grant (public.platform_access_grants), the "view-as"/"act-as" mode.
--   4. secret_refs / integration_tests / audit tables are written by the server (secret key) only.
--
-- Conventions: every helper is STABLE SECURITY DEFINER with search_path = '' (all names schema-
-- qualified), so it reads memberships without recursing through RLS and can't be hijacked.
-- Policies wrap calls in (select ...) per Supabase's RLS performance guidance.
-- =====================================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 0. Supporting columns and tables
-- -------------------------------------------------------------------------------------
alter table public.platform_admins
  add column if not exists granted_by  uuid references auth.users (id) on delete set null,
  add column if not exists disabled_at timestamptz;

-- Audited, time-boxed staff access to ONE org ("view-as" = read-only, "act-as" = read/write).
create table if not exists public.platform_access_grants (
  id             uuid primary key default gen_random_uuid(),
  admin_user_id  uuid not null references public.platform_admins (user_id) on delete cascade,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  mode           text not null check (mode in ('view', 'act')),
  reason         text not null check (char_length(reason) between 10 and 500),
  ticket_ref     text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  ended_at       timestamptz,
  check (expires_at > created_at),
  check (expires_at <= created_at + case when mode = 'act' then interval '30 minutes'
                                         else interval '60 minutes' end)
);
create index if not exists platform_access_grants_lookup_idx
  on public.platform_access_grants (admin_user_id, org_id, expires_at desc);

-- Staff audit trail. Never readable by clients. Append-only.
create table if not exists public.platform_audit_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  actor_user_id  uuid,                      -- staff uid, or null for system jobs
  action         text not null,             -- e.g. admin.view_as.start, vault.provisioned, admin.console.view
  org_id         uuid,                      -- no FK: rows must outlive deleted orgs
  target_type    text,
  target_id      text,
  metadata       jsonb not null default '{}'::jsonb,   -- NEVER secret values
  ip             inet,
  user_agent     text,
  request_id     text
);
create index if not exists platform_audit_log_org_idx on public.platform_audit_log (org_id, at desc);

-- Client-visible org audit trail. Staff actors are stored as NULL plus actor_kind = 'agency'.
create table if not exists public.audit_events (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  at             timestamptz not null default now(),
  actor_user_id  uuid references auth.users (id) on delete set null,
  actor_kind     text not null check (actor_kind in ('member', 'agency', 'system')),
  action         text not null,             -- e.g. secret.set, member.invited, integration.tested
  target_type    text,
  target_id      text,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists audit_events_org_idx on public.audit_events (org_id, at desc);

-- Every broker read of a client secret (written BEFORE the Infisical call).
create table if not exists public.secret_access_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  secret_ref_id  uuid references public.secret_refs (id) on delete set null,
  purpose        text not null check (purpose in ('connection_test', 'job', 'agent_tool', 'rotation')),
  job_id         text,
  worker         text not null,             -- e.g. 'beacon-worker@vercel:prod'
  outcome        text not null default 'requested' check (outcome in ('requested', 'ok', 'denied', 'error'))
);
create index if not exists secret_access_log_org_idx on public.secret_access_log (org_id, at desc);

-- Stripe webhook idempotency (security.md §6.2)
create table if not exists public.stripe_events (
  id           text primary key,            -- Stripe event id (evt_...)
  type         text not null,
  received_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------------------------
-- 1. Helper functions
-- -------------------------------------------------------------------------------------
create or replace function private.role_rank(r public.org_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'member' then 2 when 'viewer' then 1 else 0 end;
$$;

create or replace function private.jwt_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1');
$$;

-- is_member(org_id): caller holds any membership in the org.
create or replace function private.is_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id
      and m.user_id = (select auth.uid())
  );
$$;

-- has_role(org_id, min_role): caller's role is at least min_role (owner > admin > member > viewer).
create or replace function private.has_role(p_org_id uuid, p_min_role public.org_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id
      and m.user_id = (select auth.uid())
      and private.role_rank(m.role) >= private.role_rank(p_min_role)
  );
$$;

-- is_platform_admin(): staff row, not disabled, AND the current session passed MFA (aal2).
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.jwt_aal() = 'aal2'
     and exists (
       select 1 from public.platform_admins pa
       where pa.user_id = (select auth.uid())
         and pa.disabled_at is null
     );
$$;

-- Staff "view-as": an active grant for this org (view or act).
create or replace function private.admin_can_view(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
     and exists (
       select 1 from public.platform_access_grants g
       where g.admin_user_id = (select auth.uid())
         and g.org_id = p_org_id
         and g.ended_at is null
         and g.expires_at > now()
     );
$$;

-- Staff "act-as": an active grant with mode = 'act'.
create or replace function private.admin_can_act(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
     and exists (
       select 1 from public.platform_access_grants g
       where g.admin_user_id = (select auth.uid())
         and g.org_id = p_org_id
         and g.mode = 'act'
         and g.ended_at is null
         and g.expires_at > now()
     );
$$;

create or replace function private.can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_member(p_org_id) or private.admin_can_view(p_org_id);
$$;

create or replace function private.can_write(p_org_id uuid, p_min_role public.org_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_org_id, p_min_role) or private.admin_can_act(p_org_id);
$$;

-- MFA rule (Supabase docs pattern): a user who enrolled a verified factor must present aal2.
create or replace function private.aal_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select array[private.jwt_aal()] <@ (
    select case when count(f.id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
    from auth.mfa_factors f
    where f.user_id = (select auth.uid())
      and f.status = 'verified'
  );
$$;

-- Org-level "require MFA for everyone" (organizations.settings.require_mfa = true).
create or replace function private.org_mfa_ok(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.jwt_aal() = 'aal2'
      or not coalesce((
           select (o.settings ->> 'require_mfa')::boolean
           from public.organizations o where o.id = p_org_id
         ), false);
$$;

-- Mask staff in client-visible *_by columns (replaces public.client_visible_actor, which is RPC-callable).
create or replace function private.client_visible_actor(p_actor uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_actor is null then null
    when exists (select 1 from public.platform_admins pa where pa.user_id = p_actor) then null
    else p_actor
  end;
$$;

-- Append-only guard for audit tables.
create or replace function private.tg_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

-- Function privileges: callable by policies (authenticated) and the server; never by anon.
revoke all on all functions in schema private from public, anon;
grant execute on function
  private.role_rank(public.org_role),
  private.jwt_aal(),
  private.is_member(uuid),
  private.has_role(uuid, public.org_role),
  private.is_platform_admin(),
  private.admin_can_view(uuid),
  private.admin_can_act(uuid),
  private.can_read(uuid),
  private.can_write(uuid, public.org_role),
  private.aal_ok(),
  private.org_mfa_ok(uuid),
  private.client_visible_actor(uuid)
to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. Standard tenant-table policy set (call once per table that has an org_id column)
-- -------------------------------------------------------------------------------------
-- select: members + staff view-as · insert/update: role >= p_write_min or staff act-as
-- delete: role >= p_delete_min or staff act-as · restrictive: MFA rules
create or replace function private.apply_tenant_rls(
  p_table      regclass,
  p_write_min  public.org_role default 'member',
  p_delete_min public.org_role default 'admin'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := p_table::text;                                         -- e.g. public.prompts
  n text := replace(split_part(p_table::text, '.', 2), '"', '');   -- e.g. prompts
begin
  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon', t);
  execute format('grant select, insert, update, delete on %s to authenticated', t);

  execute format('drop policy if exists %I on %s', n || '_select', t);
  execute format('create policy %I on %s for select to authenticated
                    using ((select private.can_read(org_id)))', n || '_select', t);

  execute format('drop policy if exists %I on %s', n || '_insert', t);
  execute format('create policy %I on %s for insert to authenticated
                    with check ((select private.can_write(org_id, %L)))', n || '_insert', t, p_write_min);

  execute format('drop policy if exists %I on %s', n || '_update', t);
  execute format('create policy %I on %s for update to authenticated
                    using ((select private.can_write(org_id, %L)))
                    with check ((select private.can_write(org_id, %L)))', n || '_update', t, p_write_min, p_write_min);

  execute format('drop policy if exists %I on %s', n || '_delete', t);
  execute format('create policy %I on %s for delete to authenticated
                    using ((select private.can_write(org_id, %L)))', n || '_delete', t, p_delete_min);

  execute format('drop policy if exists %I on %s', n || '_mfa', t);
  execute format('create policy %I on %s as restrictive for all to authenticated
                    using ((select private.aal_ok()) and (select private.org_mfa_ok(org_id)))', n || '_mfa', t);
end;
$$;
revoke all on function private.apply_tenant_rls(regclass, public.org_role, public.org_role) from public, anon, authenticated;

-- Usage (backend agent: one line per tenant table, in the migration that creates it):
--   select private.apply_tenant_rls('public.onboarding_progress');               -- members edit
--   select private.apply_tenant_rls('public.brand_profiles');
--   select private.apply_tenant_rls('public.prompts');
--   select private.apply_tenant_rls('public.competitors');
--   select private.apply_tenant_rls('public.invitations', 'admin', 'admin');     -- admins only

-- -------------------------------------------------------------------------------------
-- 3. Core tables with bespoke policies
-- -------------------------------------------------------------------------------------

-- organizations: read by members/staff-with-grant; admins edit a safe column subset; no client insert/delete
-- (org creation and deletion run on the server with the secret key, after gating, security.md §1.3).
alter table public.organizations enable row level security;
revoke all on public.organizations from anon;
revoke insert, update, delete on public.organizations from authenticated;
grant select on public.organizations to authenticated;
grant update (name, website, logo_path, settings) on public.organizations to authenticated;
-- infisical_project_id, stripe_customer_id, plan, status: server-only (no column grant).

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using ((select private.can_read(id)));

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update to authenticated
  using ((select private.can_write(id, 'admin')))
  with check ((select private.can_write(id, 'admin')));

drop policy if exists organizations_mfa on public.organizations;
create policy organizations_mfa on public.organizations as restrictive for all to authenticated
  using ((select private.aal_ok()) and (select private.org_mfa_ok(id)));

-- memberships: members see co-members; admins manage (owner rules enforced by tg_memberships_guard).
alter table public.memberships enable row level security;
revoke all on public.memberships from anon;
grant select, insert, update, delete on public.memberships to authenticated;

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using ((select private.can_read(org_id)));

drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check ((select private.can_write(org_id, 'admin')));

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using ((select private.can_write(org_id, 'admin')))
  with check ((select private.can_write(org_id, 'admin')));

-- Admins remove others; anyone may leave (the owner guard trigger still applies).
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using ((select private.can_write(org_id, 'admin')) or user_id = (select auth.uid()));

drop policy if exists memberships_mfa on public.memberships;
create policy memberships_mfa on public.memberships as restrictive for all to authenticated
  using ((select private.aal_ok()) and (select private.org_mfa_ok(org_id)));

-- platform_admins / platform_audit_log: invisible to clients. No grants, so absent from the Data API.
-- The admin console reads them server-side with the secret key.
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

alter table public.platform_audit_log enable row level security;
revoke all on public.platform_audit_log from anon, authenticated;
drop trigger if exists platform_audit_log_append_only on public.platform_audit_log;
create trigger platform_audit_log_append_only
  before update or delete on public.platform_audit_log
  for each row execute function private.tg_append_only();
drop trigger if exists platform_audit_log_no_truncate on public.platform_audit_log;
create trigger platform_audit_log_no_truncate
  before truncate on public.platform_audit_log
  for each statement execute function private.tg_append_only();

-- platform_access_grants: created/ended only by the server route (which also writes platform_audit_log).
-- Staff may read their own grants (for the "viewing as" banner).
alter table public.platform_access_grants enable row level security;
revoke all on public.platform_access_grants from anon, authenticated;
grant select on public.platform_access_grants to authenticated;
drop policy if exists platform_access_grants_own on public.platform_access_grants;
create policy platform_access_grants_own on public.platform_access_grants for select to authenticated
  using (admin_user_id = (select auth.uid()) and (select private.is_platform_admin()));

-- audit_events: org admins/owners (and staff with a grant) read; the server writes.
alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;
drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events for select to authenticated
  using ((select private.has_role(org_id, 'admin')) or (select private.admin_can_view(org_id)));
drop trigger if exists audit_events_append_only on public.audit_events;
create trigger audit_events_append_only
  before update on public.audit_events
  for each row execute function private.tg_append_only();
-- (delete stays possible so ON DELETE CASCADE from organizations works on offboarding.)

-- secret_refs: members read status; NO client writes. A client-writable ref could point the broker at
-- another org's path (security.md §1.5 item 3). The intake route writes with the secret key.
alter table public.secret_refs enable row level security;
revoke all on public.secret_refs from anon, authenticated;
grant select (id, org_id, step_id, field_id, environment, secret_path, secret_name,
              last_tested_at, test_status, test_message, created_at, updated_at)
  on public.secret_refs to authenticated;
-- (infisical_project_id is deliberately not granted: clients don't need it.)
drop policy if exists secret_refs_select on public.secret_refs;
create policy secret_refs_select on public.secret_refs for select to authenticated
  using ((select private.can_read(org_id)));

-- integration_tests: members read; server writes.
alter table public.integration_tests enable row level security;
revoke all on public.integration_tests from anon, authenticated;
grant select on public.integration_tests to authenticated;
drop policy if exists integration_tests_select on public.integration_tests;
create policy integration_tests_select on public.integration_tests for select to authenticated
  using ((select private.can_read(org_id)));

-- secret_access_log: org admins see when their credentials were used (by job/purpose, never by staff name).
alter table public.secret_access_log enable row level security;
revoke all on public.secret_access_log from anon, authenticated;
grant select on public.secret_access_log to authenticated;
drop policy if exists secret_access_log_select on public.secret_access_log;
create policy secret_access_log_select on public.secret_access_log for select to authenticated
  using ((select private.has_role(org_id, 'admin')) or (select private.admin_can_view(org_id)));

-- stripe_events: server only.
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 4. Storage
-- -------------------------------------------------------------------------------------
-- brand-assets (object path '<org_id>/<file>'): same rules via private helpers.
--   select: private.can_read(public.try_uuid((storage.foldername(name))[1]))
--   insert/update: private.can_write(..., 'member') · delete: private.can_write(..., 'admin')
--
-- untrusted-html: private bucket for design-system HTML uploads. NO policies for authenticated:
-- upload goes through a server route issuing a signed upload URL for '<org_id>/<uuid>.html', and serving
-- goes through the separate usercontent origin (security.md §6.3).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('untrusted-html', 'untrusted-html', false, 2097152, array['text/html'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['text/html'];

-- -------------------------------------------------------------------------------------
-- 5. Tests to write (pgTAP, supabase/tests/rls_*.sql). Each runs as role authenticated with a forged
--    request.jwt.claims (sub, aal):
--   - member of org A: cannot select/insert/update/delete any row of org B in every tenant table
--   - viewer of org A: can select, cannot insert/update/delete
--   - member: cannot update organizations.infisical_project_id / plan / status (column privilege error)
--   - member: cannot insert/update secret_refs (permission denied)
--   - platform admin with aal1: sees zero rows in org A
--   - platform admin with aal2 and no grant: sees zero rows; with 'view' grant: can select, cannot write;
--     with expired grant: zero rows; with 'act' grant: can write
--   - any authenticated user: select on platform_admins / platform_audit_log fails (permission denied)
--   - user with a verified TOTP factor and aal1: zero rows everywhere (restrictive aal_ok)
--   - org with settings.require_mfa = true: aal1 member sees zero rows
--   - update/delete on platform_audit_log fails even for service_role (append-only trigger)
-- =====================================================================================
