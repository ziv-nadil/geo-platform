-- Beacon GEO: tenancy, identity and authorization helpers.
--
-- Model
--   organizations  = client accounts (one per agency client)
--   memberships    = client users inside an organization (owner|admin|member|viewer)
--   platform_admins= Beacon staff (super admins). Kept OUT of memberships so clients never
--                    see them in member lists, and readable only by platform admins.
--
-- All helper functions are SECURITY DEFINER with an empty search_path, so they can read
-- memberships/platform_admins without recursing through RLS and cannot be hijacked by objects
-- in a user-controlled schema.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.org_status as enum ('onboarding', 'active', 'paused', 'churned');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
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
  logo_path             text,                        -- path inside the brand-assets bucket
  plan                  text not null default 'trial', -- FK added in billing migration
  status                public.org_status not null default 'onboarding',
  -- References only, never secret values. Not client-writable (column grants below).
  infisical_project_id  text,
  stripe_customer_id    text unique,
  settings              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.tg_set_updated_at();

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text,
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
  for each row execute function public.tg_set_updated_at();

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

-- ---------------------------------------------------------------------------
-- Authorization helpers (used by every RLS policy)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_role(org uuid, roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = org and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;

-- Read access: any member, or platform staff.
create or replace function public.can_read_org(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or public.is_member(org);
$$;

-- Write access for day-to-day work (prompts, competitors, content, onboarding answers).
create or replace function public.can_edit_org(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or public.has_role(org, array['owner','admin','member']::public.org_role[]);
$$;

-- Administrative access (members, invitations, API keys, billing, secrets).
create or replace function public.can_admin_org(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or public.has_role(org, array['owner','admin']::public.org_role[]);
$$;

-- Returns the uid to record in *_by columns. Platform-admin actions are recorded as NULL
-- ("Beacon team") so a client can never learn who on staff touched their account.
create or replace function public.client_visible_actor(actor uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when actor is null then null
    when exists (select 1 from public.platform_admins pa where pa.user_id = actor) then null
    else actor
  end;
$$;

-- Trigger: stamp updated_by (or created_by / uploaded_by / invited_by) with the caller,
-- masking platform admins. Column name is passed as the trigger argument.
create or replace function public.tg_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  col text := tg_argv[0];
  actor uuid := coalesce((select auth.uid()), (to_jsonb(new) ->> col)::uuid);
begin
  new := jsonb_populate_record(new, jsonb_build_object(col, public.client_visible_actor(actor)));
  return new;
end;
$$;

-- Users who share at least one organization with the caller (for profile visibility).
create or replace function public.shares_org_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships a
    join public.memberships b on b.org_id = a.org_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

-- Safe uuid parse for storage paths ("<org_id>/file.png").
create or replace function public.try_uuid(v text)
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
-- Profiles are created from auth.users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
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
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Membership integrity
-- ---------------------------------------------------------------------------
-- Platform admins must never appear in a client's member list.
create or replace function public.tg_memberships_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if exists (select 1 from public.platform_admins pa where pa.user_id = new.user_id) then
      raise exception 'platform admins cannot be organization members' using errcode = '42501';
    end if;
    -- Only owners (or staff / service role) may grant or change the owner role.
    if (select auth.uid()) is not null
       and coalesce(current_setting('beacon.accepting_invitation', true), '') <> 'on'
       and not public.is_platform_admin()
       and (new.role = 'owner' or (tg_op = 'UPDATE' and old.role = 'owner'))
       and not public.has_role(new.org_id, array['owner']::public.org_role[]) then
      raise exception 'only owners can grant or change the owner role' using errcode = '42501';
    end if;
  end if;
  -- Never leave an organization without an owner.
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
  for each row execute function public.tg_memberships_guard();

create trigger invitations_stamp_actor before insert on public.invitations
  for each row execute function public.tg_stamp_actor('invited_by');

-- Accept an invitation by its plain token (called from the app after sign-in).
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

  update public.invitations
  set status = 'accepted', accepted_by = uid, accepted_at = now()
  where id = inv.id;

  perform set_config('beacon.accepting_invitation', 'off', true);
  return inv.org_id;
end;
$$;
