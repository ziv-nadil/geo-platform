-- Beacon GEO: Row Level Security for every table, grants, and privileged-column guards.
--
-- Access tiers (helpers defined in 20261124000100_tenancy.sql):
--   can_read_org(org)   any member (viewer+) or platform admin
--   can_edit_org(org)   owner/admin/member or platform admin
--   can_admin_org(org)  owner/admin or platform admin
--   is_platform_admin() Beacon staff, NOT a member of any org
--
-- Worker-produced data (runs, responses, mentions, citations, crawler hits, site-health pages,
-- integration tests, usage) is read-only for clients; the service role (which bypasses RLS)
-- and platform admins write it.
--
-- Platform-admin invisibility:
--   * platform_admins rows: readable only by platform admins.
--   * platform admins never hold memberships (trigger), so they never appear in member lists.
--   * *_by columns are stamped through client_visible_actor(): staff actions are stored as NULL.
--   * audit_log rows from staff are forced to visibility='platform' and hidden from clients.
--   * profiles: a client can only read profiles of people sharing an org with them.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere in public
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Anonymous users get nothing except public reference data (pricing page, engine list).
revoke all on all tables in schema public from anon;
grant select on public.plans, public.engines to anon;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated using (public.can_read_org(id));
create policy organizations_insert on public.organizations
  for insert to authenticated with check (public.is_platform_admin());
create policy organizations_update on public.organizations
  for update to authenticated using (public.can_admin_org(id)) with check (public.can_admin_org(id));
create policy organizations_delete on public.organizations
  for delete to authenticated using (public.is_platform_admin());

-- Clients may rename/edit their org, but plan/status/slug and vault/billing references are staff-only.
create or replace function public.tg_organizations_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_platform_admin() then
    if new.plan is distinct from old.plan
       or new.status is distinct from old.status
       or new.slug is distinct from old.slug
       or new.infisical_project_id is distinct from old.infisical_project_id
       or new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'only Beacon staff can change plan, status, slug or integration references'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger organizations_guard before update on public.organizations
  for each row execute function public.tg_organizations_guard();

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_platform_admin() or public.shares_org_with(id));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_platform_admin())
  with check (id = (select auth.uid()) or public.is_platform_admin());

-- Only platform admins can see or manage the platform_admins table. No client policy exists.
create policy platform_admins_admin_all on public.platform_admins
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy memberships_select on public.memberships
  for select to authenticated using (public.can_read_org(org_id));
create policy memberships_insert on public.memberships
  for insert to authenticated with check (public.can_admin_org(org_id));
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.can_admin_org(org_id)) with check (public.can_admin_org(org_id));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.can_admin_org(org_id) or user_id = (select auth.uid()));

create policy invitations_select on public.invitations
  for select to authenticated using (public.can_admin_org(org_id));
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    public.can_admin_org(org_id)
    and (role <> 'owner' or public.is_platform_admin() or public.has_role(org_id, array['owner']::public.org_role[]))
  );
create policy invitations_update on public.invitations
  for update to authenticated
  using (public.can_admin_org(org_id)) with check (public.can_admin_org(org_id));
create policy invitations_delete on public.invitations
  for delete to authenticated using (public.can_admin_org(org_id));
-- Note: token_hash is a sha256 of a high-entropy token; it is not useful without the token.

-- ---------------------------------------------------------------------------
-- Generic org-scoped policies
-- ---------------------------------------------------------------------------
-- (a) Collaborative tables: members read, editors write, admins delete.
do $$
declare t text;
begin
  foreach t in array array[
    'onboarding_progress', 'brand_profiles', 'brand_personas', 'brand_messaging', 'brand_voice_terms',
    'brand_assets', 'brands', 'competitors', 'topics', 'prompts', 'source_tags', 'source_tag_rules',
    'content_items', 'creators', 'outreach_contacts', 'reports', 'site_health_properties', 'site_health_issues'
  ] loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated using (public.can_read_org(org_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.can_edit_org(org_id))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated using (public.can_admin_org(org_id))$f$, t);
  end loop;
end $$;

-- (b) Worker-produced tables: members read, only platform admins (and service role) write.
do $$
declare t text;
begin
  foreach t in array array[
    'prompt_runs', 'responses', 'mentions', 'citations', 'crawler_hits',
    'site_health_pages', 'site_health_issue_pages', 'integration_tests', 'usage_counters'
  ] loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated using (public.can_read_org(org_id))$f$, t);
    execute format($f$create policy %1$s_staff_write on public.%1$I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())$f$, t);
  end loop;
end $$;

-- (c) Admin-only tables.
create policy org_engines_select on public.org_engines
  for select to authenticated using (public.can_read_org(org_id));
create policy org_engines_write on public.org_engines
  for all to authenticated using (public.can_admin_org(org_id)) with check (public.can_admin_org(org_id));

create policy api_keys_select on public.api_keys
  for select to authenticated using (public.can_admin_org(org_id));
create policy api_keys_insert on public.api_keys
  for insert to authenticated with check (public.can_admin_org(org_id));
create policy api_keys_update on public.api_keys
  for update to authenticated using (public.can_admin_org(org_id)) with check (public.can_admin_org(org_id));
create policy api_keys_delete on public.api_keys
  for delete to authenticated using (public.can_admin_org(org_id));
-- key_hash is sha256 of a high-entropy key (not reversible); the plain key is shown once at creation.

-- Secret references: editors can see which fields are stored (for "saved" badges).
-- Only the server route (service role) writes them; staff may manage them directly.
create policy secret_refs_select on public.secret_refs
  for select to authenticated using (public.can_edit_org(org_id));
create policy secret_refs_staff_write on public.secret_refs
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Audit log: clients see only org-visible rows of their own org; staff see everything.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    public.is_platform_admin()
    or (visibility = 'org' and org_id is not null and public.can_admin_org(org_id))
  );
-- No insert/update/delete policies: use public.write_audit() or the service role.

-- ---------------------------------------------------------------------------
-- Reference & billing tables
-- ---------------------------------------------------------------------------
create policy engines_select on public.engines for select to anon, authenticated using (true);
create policy engines_staff_write on public.engines
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy plans_select on public.plans for select to anon, authenticated using (active or public.is_platform_admin());
create policy plans_staff_write on public.plans
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy subscriptions_select on public.subscriptions
  for select to authenticated using (public.can_admin_org(org_id));
create policy subscriptions_staff_write on public.subscriptions
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- stripe_events: RLS on, no policies => service role only.
revoke all on public.stripe_events from authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.increment_usage(uuid, text, bigint, date) from public, anon, authenticated;
grant execute on function public.increment_usage(uuid, text, bigint, date) to service_role;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

revoke execute on function public.write_audit(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.write_audit(uuid, text, text, text, jsonb) to authenticated;

revoke execute on function public.client_visible_actor(uuid) from public, anon, authenticated;
revoke execute on function public.shares_org_with(uuid) from public, anon;
