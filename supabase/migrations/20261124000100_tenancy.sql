-- Beacon GEO: tenancy, identity, staff access and authorization helpers.
-- Design source of truth: docs/architecture/security.md §3 and supabase/policies_reference.sql
-- (integrated here and in 20261124000500_rls.sql).
--
-- Model
--   organizations          = client accounts (one per agency client)
--   memberships            = client users inside an organization (owner > admin > member > viewer)
--   platform_admins        = Beacon staff. NEVER in memberships (trigger) and not granted to API roles.
--   platform_access_grants = audited, time-boxed per-org staff access ("view-as" 60 min / "act-as" 30 min)
--   platform_audit_log     = append-only staff audit, invisible to clients
--   audit_events           = client-visible org audit; staff actors masked as 'agency'
--
-- All helpers live in schema `private` (not exposed by the Data API, so not callable via /rpc),
-- are SECURITY DEFINER with search_path = '' and fully qualified names.
-- There is NO blanket staff bypass: staff need an aal2 (MFA) session AND an unexpired grant.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.org_status as enum ('onboarding', 'active', 'paused', 'churned');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- ---------------------------------------------------------------------------
-- Generic trigger functions (no EXECUTE grant needed for triggers)
-- ---------------------------------------------------------------------------
create or replace function private.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.tg_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

-- Safe uuid parse for storage paths ("<org_id>/file.png").
create or replace function private.try_uuid(v text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return v::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) between 1 and 200),
  slug                  text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  website               text,
  logo_path             text,                          -- path inside the brand-assets bucket
  plan                  text not null default 'trial', -- FK added in the billing migration
  status                public.org_status not null default 'onboarding',
  -- References only, never secret values. Server-written (no client column grant).
  infisical_project_id  text,
  stripe_customer_id    text unique,
  settings              jsonb not null default '{}'::jsonb,  -- e.g. {"require_mfa": true}
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.tg_set_updated_at();

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.tg_set_updated_at();

create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text,
  granted_by  uuid references auth.users (id) on delete set null,
  disabled_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.memberships (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.org_role not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);
create trigger memberships_updated_at before update on public.memberships
  for each row execute function private.tg_set_updated_at();

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  email        extensions.citext not null,
  role         public.org_role not null default 'member',
  -- sha256 hex of the invite token. The plain token only exists in the invite email/link.
  token_hash   text not null unique,
  status       public.invitation_status not null default 'pending',
  invited_by   uuid references auth.users (id) on delete set null,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_by  uuid references auth.users (id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index invitations_org_idx on public.invitations (org_id);
create unique index invitations_pending_unique on public.invitations (org_id, email) where status = 'pending';

-- Audited, time-boxed staff access to ONE org ("view" = read-only, "act" = read/write).
create table public.platform_access_grants (
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
create index platform_access_grants_lookup_idx
  on public.platform_access_grants (admin_user_id, org_id, expires_at desc);

-- Staff audit trail. Never readable by clients. Append-only.
create table public.platform_audit_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  actor_user_id  uuid,                      -- staff uid, or null for system jobs
  action         text not null,             -- e.g. admin.view_as.start, vault.provisioned, org.create
  org_id         uuid,                      -- no FK: rows must outlive deleted orgs
  target_type    text,
  target_id      text,
  metadata       jsonb not null default '{}'::jsonb,   -- NEVER secret values
  ip             inet,
  user_agent     text,
  request_id     text
);
create index platform_audit_log_org_idx on public.platform_audit_log (org_id, at desc);
create trigger platform_audit_log_append_only
  before update or delete on public.platform_audit_log
  for each row execute function private.tg_append_only();
create trigger platform_audit_log_no_truncate
  before truncate on public.platform_audit_log
  for each statement execute function private.tg_append_only();

-- Client-visible org audit trail. Staff actors are stored as NULL plus actor_kind = 'agency'.
create table public.audit_events (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  at             timestamptz not null default now(),
  actor_user_id  uuid references auth.users (id) on delete set null,
  actor_kind     text not null check (actor_kind in ('member', 'agency', 'system')),
  action         text not null,             -- e.g. secret.set, member.invited, integration.tested
  target_type    text,
  target_id      text,
  metadata       jsonb not null default '{}'::jsonb   -- NEVER secret values
);
create index audit_events_org_idx on public.audit_events (org_id, at desc);
create trigger audit_events_append_only
  before update on public.audit_events
  for each row execute function private.tg_append_only();
-- (delete stays possible so ON DELETE CASCADE from organizations works on offboarding.)

-- ---------------------------------------------------------------------------
-- Authorization helpers (schema private; used by every RLS policy)
-- ---------------------------------------------------------------------------
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

-- Caller holds any membership in the org.
create or replace function private.is_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = (select auth.uid())
  );
$$;

-- Caller's role is at least p_min_role (owner > admin > member > viewer).
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

-- Staff row, not disabled, AND the current session passed MFA (aal2).
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
       where pa.user_id = (select auth.uid()) and pa.disabled_at is null
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

-- MFA rule: a user who enrolled a verified factor must present aal2.
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
    where f.user_id = (select auth.uid()) and f.status = 'verified'
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

-- Mask staff in client-visible *_by columns. Not RPC-callable (private schema, no grant).
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

-- Profiles visible to the caller: self, co-members, or members of an org staff currently view.
create or replace function private.can_see_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
      or exists (
        select 1
        from public.memberships a
        join public.memberships b on b.org_id = a.org_id
        where a.user_id = (select auth.uid()) and b.user_id = p_user_id
      )
      or exists (
        select 1 from public.memberships m
        where m.user_id = p_user_id and private.admin_can_view(m.org_id)
      );
$$;

-- Trigger: stamp a *_by column with the caller, masking staff as NULL ("Agency team").
-- Column name is the trigger argument. With the server key (auth.uid() null) the provided value is
-- kept but still masked if it is a staff uid.
create or replace function private.tg_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  col text := tg_argv[0];
  actor uuid := coalesce((select auth.uid()), (to_jsonb(new) ->> col)::uuid);
begin
  new := jsonb_populate_record(new, jsonb_build_object(col, private.client_visible_actor(actor)));
  return new;
end;
$$;

-- Trigger: audit_events never reveal staff identity.
create or replace function private.tg_audit_events_mask()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_user_id is not null
     and exists (select 1 from public.platform_admins pa where pa.user_id = new.actor_user_id) then
    new.actor_user_id := null;
    new.actor_kind := 'agency';
  end if;
  return new;
end;
$$;
create trigger audit_events_mask before insert on public.audit_events
  for each row execute function private.tg_audit_events_mask();

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
  private.can_see_profile(uuid),
  private.try_uuid(text)
to authenticated, service_role;
-- client_visible_actor: deliberately no grant to authenticated (only used inside definer triggers).
grant execute on function private.client_visible_actor(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Profiles are created from auth.users
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Membership integrity
-- ---------------------------------------------------------------------------
create or replace function private.tg_memberships_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    -- Platform admins must never appear in a client's member list.
    if exists (select 1 from public.platform_admins pa where pa.user_id = new.user_id) then
      raise exception 'platform admins cannot be organization members' using errcode = '42501';
    end if;
    -- Only owners (or staff act-as / the server key) may grant or change the owner role.
    if (select auth.uid()) is not null
       and coalesce(current_setting('beacon.accepting_invitation', true), '') <> 'on'
       and not private.admin_can_act(new.org_id)
       and (new.role = 'owner' or (tg_op = 'UPDATE' and old.role = 'owner'))
       and not private.has_role(new.org_id, 'owner') then
      raise exception 'only owners can grant or change the owner role' using errcode = '42501';
    end if;
  end if;
  -- Never leave an organization without an owner (unless the org itself is being deleted).
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations o where o.id = old.org_id)
     and not exists (
       select 1 from public.memberships m
       where m.org_id = old.org_id and m.role = 'owner' and m.user_id <> old.user_id
     ) then
    raise exception 'an organization must keep at least one owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_guard
  before insert or update or delete on public.memberships
  for each row execute function private.tg_memberships_guard();

create trigger invitations_stamp_actor before insert on public.invitations
  for each row execute function private.tg_stamp_actor('invited_by');

-- Accept an invitation by its plain token (RPC from the app after sign-in; must stay in public).
create or replace function public.accept_invitation(token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
  uid uuid := (select auth.uid());
  user_email text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select u.email into user_email from auth.users u where u.id = uid;

  select * into inv from public.invitations i
  where i.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
    and i.status = 'pending'
  for update;

  if inv.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'invitation expired' using errcode = 'P0001';
  end if;
  if lower(inv.email::text) <> lower(coalesce(user_email, '')) then
    raise exception 'invitation was sent to a different email' using errcode = '42501';
  end if;

  -- The role was chosen by an owner/admin when inviting (checked by RLS on invitations).
  perform set_config('beacon.accepting_invitation', 'on', true);
  insert into public.memberships (org_id, user_id, role)
  values (inv.org_id, uid, inv.role)
  on conflict (org_id, user_id) do nothing;
  perform set_config('beacon.accepting_invitation', 'off', true);

  update public.invitations
  set status = 'accepted', accepted_by = uid, accepted_at = now()
  where id = inv.id;

  insert into public.audit_events (org_id, actor_user_id, actor_kind, action, target_type, target_id, metadata)
  values (inv.org_id, uid, 'member', 'member.joined', 'invitation', inv.id::text, jsonb_build_object('role', inv.role));

  return inv.org_id;
end;
$$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
