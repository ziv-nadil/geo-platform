-- Beacon GEO: Row Level Security for every table.
-- Integrates supabase/policies_reference.sql (security agent) — see docs/architecture/security.md §3.
--
-- Rules
--   * Helpers live in schema private (not RPC-callable): can_read(org), can_write(org, min_role),
--     has_role(org, min_role), admin_can_view/act(org), aal_ok(), org_mfa_ok(org).
--   * No blanket staff bypass. Staff reach tenant rows only via an aal2 session + unexpired
--     platform_access_grants row (view = read, act = write). Fleet views use the server key.
--   * Worker/server-produced data (runs, responses, mentions, citations, crawler hits, site-health
--     pages, integration tests, usage, billing, secret refs, audit) is read-only for clients;
--     the server writes it with the secret key (bypasses RLS).
--   * anon gets nothing except plans/engines (pricing page).
--   * Every tenant table gets a RESTRICTIVE MFA policy (aal_ok + org require_mfa).

-- ---------------------------------------------------------------------------
-- Policy builders
-- ---------------------------------------------------------------------------
-- Collaborative tenant table: members read; role >= p_write_min (or staff act-as) writes.
create or replace function private.apply_tenant_rls(
  p_table      regclass,
  p_write_min  public.org_role default 'member',
  p_delete_min public.org_role default 'admin',
  p_read_min   public.org_role default 'viewer'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := p_table::text;
  n text := replace(split_part(p_table::text, '.', 2), '"', '');
  read_expr text := case when p_read_min = 'viewer'
    then '(select private.can_read(org_id))'
    else format('((select private.has_role(org_id, %L)) or (select private.admin_can_view(org_id)))', p_read_min) end;
begin
  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon', t);
  execute format('grant select, insert, update, delete on %s to authenticated', t);

  execute format('drop policy if exists %I on %s', n || '_select', t);
  execute format('create policy %I on %s for select to authenticated using (%s)', n || '_select', t, read_expr);

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

-- Server-written tenant table: clients (and staff with a grant) only read.
create or replace function private.apply_tenant_read_rls(
  p_table    regclass,
  p_read_min public.org_role default 'viewer'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := p_table::text;
  n text := replace(split_part(p_table::text, '.', 2), '"', '');
  read_expr text := case when p_read_min = 'viewer'
    then '(select private.can_read(org_id))'
    else format('((select private.has_role(org_id, %L)) or (select private.admin_can_view(org_id)))', p_read_min) end;
begin
  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon, authenticated', t);
  execute format('grant select on %s to authenticated', t);
  execute format('drop policy if exists %I on %s', n || '_select', t);
  execute format('create policy %I on %s for select to authenticated using (%s)', n || '_select', t, read_expr);
  execute format('drop policy if exists %I on %s', n || '_mfa', t);
  execute format('create policy %I on %s as restrictive for select to authenticated
                    using ((select private.aal_ok()) and (select private.org_mfa_ok(org_id)))', n || '_mfa', t);
end;
$$;

revoke all on function private.apply_tenant_rls(regclass, public.org_role, public.org_role, public.org_role) from public, anon, authenticated;
revoke all on function private.apply_tenant_read_rls(regclass, public.org_role) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Baseline: RLS on everywhere, nothing for anon, no default grants for future tables
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------------
-- Collaborative tenant tables
-- ---------------------------------------------------------------------------
select private.apply_tenant_rls('public.onboarding_progress');
select private.apply_tenant_rls('public.brand_profiles');
select private.apply_tenant_rls('public.brand_personas');
select private.apply_tenant_rls('public.brand_messaging');
select private.apply_tenant_rls('public.brand_voice_terms');
select private.apply_tenant_rls('public.brand_assets');
select private.apply_tenant_rls('public.brands', 'admin', 'admin');
select private.apply_tenant_rls('public.competitors');
select private.apply_tenant_rls('public.topics');
select private.apply_tenant_rls('public.prompts');
select private.apply_tenant_rls('public.source_tags');
select private.apply_tenant_rls('public.source_tag_rules');
select private.apply_tenant_rls('public.content_items');
select private.apply_tenant_rls('public.creators');
select private.apply_tenant_rls('public.outreach_contacts');
select private.apply_tenant_rls('public.reports');
select private.apply_tenant_rls('public.site_health_properties', 'admin', 'admin');
select private.apply_tenant_rls('public.site_health_issues');        -- members triage status
select private.apply_tenant_rls('public.org_engines', 'admin', 'admin');
select private.apply_tenant_rls('public.invitations', 'admin', 'admin', 'admin');
select private.apply_tenant_rls('public.api_keys', 'admin', 'admin', 'admin');

-- Owner invitations only by owners (or staff act-as).
drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    (select private.can_write(org_id, 'admin'))
    and (role <> 'owner' or (select private.has_role(org_id, 'owner')) or (select private.admin_can_act(org_id)))
  );

-- ---------------------------------------------------------------------------
-- Server-written tenant tables (read-only for clients)
-- ---------------------------------------------------------------------------
select private.apply_tenant_read_rls('public.prompt_runs');
select private.apply_tenant_read_rls('public.responses');
select private.apply_tenant_read_rls('public.mentions');
select private.apply_tenant_read_rls('public.citations');
select private.apply_tenant_read_rls('public.crawler_hits');
select private.apply_tenant_read_rls('public.site_health_pages');
select private.apply_tenant_read_rls('public.site_health_issue_pages');
select private.apply_tenant_read_rls('public.integration_tests');
select private.apply_tenant_read_rls('public.usage_counters');
select private.apply_tenant_read_rls('public.subscriptions', 'admin');
select private.apply_tenant_read_rls('public.audit_events', 'admin');
select private.apply_tenant_read_rls('public.secret_access_log', 'admin');

-- secret_refs: members read status; NO client writes (a client-writable ref could point the broker
-- at another org's path). infisical_project_id is not even readable by clients.
alter table public.secret_refs enable row level security;
revoke all on public.secret_refs from anon, authenticated;
grant select (id, org_id, step_id, field_id, environment, secret_path, secret_name, infisical_secret_version,
              last_tested_at, test_status, test_message, created_by, created_at, updated_at)
  on public.secret_refs to authenticated;
create policy secret_refs_select on public.secret_refs for select to authenticated
  using ((select private.can_read(org_id)));
create policy secret_refs_mfa on public.secret_refs as restrictive for select to authenticated
  using ((select private.aal_ok()) and (select private.org_mfa_ok(org_id)));

-- ---------------------------------------------------------------------------
-- Core tables with bespoke policies
-- ---------------------------------------------------------------------------
-- organizations: read by members / staff-with-grant; admins edit a safe column subset only.
-- Creation and deletion run on the server with the secret key (POST /api/admin/orgs).
revoke all on public.organizations from anon;
revoke insert, update, delete on public.organizations from authenticated;
grant select on public.organizations to authenticated;
grant update (name, website, logo_path, settings) on public.organizations to authenticated;
-- infisical_project_id, stripe_customer_id, plan, status, slug: server-only (no column grant).

create policy organizations_select on public.organizations for select to authenticated
  using ((select private.can_read(id)));
create policy organizations_update on public.organizations for update to authenticated
  using ((select private.can_write(id, 'admin')))
  with check ((select private.can_write(id, 'admin')));
create policy organizations_mfa on public.organizations as restrictive for all to authenticated
  using ((select private.aal_ok()) and (select private.org_mfa_ok(id)));

-- memberships: members see co-members; admins manage (owner rules enforced by tg_memberships_guard).
revoke all on public.memberships from anon;
grant select, insert, update, delete on public.memberships to authenticated;
create policy memberships_select on public.memberships for select to authenticated
  using ((select private.can_read(org_id)));
create policy memberships_insert on public.memberships for insert to authenticated
  with check ((select private.can_write(org_id, 'admin')));
create policy memberships_update on public.memberships for update to authenticated
  using ((select private.can_write(org_id, 'admin')))
  with check ((select private.can_write(org_id, 'admin')));
-- Admins remove others; anyone may leave (owner guard trigger still applies).
create policy memberships_delete on public.memberships for delete to authenticated
  using ((select private.can_write(org_id, 'admin')) or user_id = (select auth.uid()));
create policy memberships_mfa on public.memberships as restrictive for all to authenticated
  using ((select private.aal_ok()) and (select private.org_mfa_ok(org_id)));

-- profiles: self, co-members, and members of an org a staff member is viewing.
revoke all on public.profiles from anon;
revoke insert, delete on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.can_see_profile(id)));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- platform_admins / platform_audit_log: invisible to clients. No grants => absent from the Data API.
revoke all on public.platform_admins from anon, authenticated;
revoke all on public.platform_audit_log from anon, authenticated;

-- platform_access_grants: created/ended only by the server; staff may read their own (banner).
revoke all on public.platform_access_grants from anon, authenticated;
grant select on public.platform_access_grants to authenticated;
create policy platform_access_grants_own on public.platform_access_grants for select to authenticated
  using (admin_user_id = (select auth.uid()) and (select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- Reference & server-only tables
-- ---------------------------------------------------------------------------
revoke all on public.engines, public.plans from authenticated;
grant select on public.engines, public.plans to anon, authenticated;
create policy engines_select on public.engines for select to anon, authenticated using (true);
create policy plans_select on public.plans for select to anon, authenticated using (active);

-- stripe_events: RLS on, no grants, no policies => server key only.
revoke all on public.stripe_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges in public
-- ---------------------------------------------------------------------------
revoke execute on function public.increment_usage(uuid, text, bigint, date) from public, anon, authenticated;
grant execute on function public.increment_usage(uuid, text, bigint, date) to service_role;
