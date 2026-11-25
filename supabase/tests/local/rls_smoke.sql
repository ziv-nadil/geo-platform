-- RLS smoke tests (cover the list in supabase/policies_reference.sql §5). Run after migrations +
-- seed (see run.sh). Each block impersonates a user the way PostgREST does (role authenticated +
-- request.jwt.claims with sub and aal) and asserts what they can see/do. Everything is rolled back.
\set ON_ERROR_STOP 1

\set admin  '00000000-0000-4000-a000-000000000001'
\set dana   '00000000-0000-4000-a000-000000000011'
\set sam    '00000000-0000-4000-a000-000000000012'
\set maya   '00000000-0000-4000-a000-000000000021'
\set leo    '00000000-0000-4000-a000-000000000022'
\set nw     '10000000-0000-4000-b000-000000000001'
\set lumen  '10000000-0000-4000-b000-000000000002'

-- ---------------------------------------------------------------- Dana: Northwind owner (aal1, no MFA enrolled)
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'dana', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.organizations;            assert n = 1, 'dana sees 1 org, got ' || n;
  select count(*) into n from public.memberships;               assert n = 2, 'dana sees 2 memberships, got ' || n;
  select count(*) into n from public.profiles;                  assert n = 2, 'dana sees self + sam only, got ' || n;
  select count(*) into n from public.audit_events;              assert n = 2, 'owner sees org audit events, got ' || n;
  select count(*) into n from public.audit_events where actor_kind = 'agency' and actor_user_id is null;
  assert n = 1, 'staff action masked as agency';
  select count(*) into n from public.audit_events where actor_user_id = '00000000-0000-4000-a000-000000000001';
  assert n = 0, 'staff uid never visible';
  select count(*) into n from public.prompts where org_id = '10000000-0000-4000-b000-000000000002'; assert n = 0, 'no cross-tenant prompts';
  select count(*) into n from public.metrics_daily where org_id <> '10000000-0000-4000-b000-000000000001'; assert n = 0, 'metrics_daily filtered';
  select count(*) into n from public.metrics_daily;             assert n > 0, 'metrics_daily has northwind rows';
  select count(*) into n from public.share_of_voice_daily where org_id <> '10000000-0000-4000-b000-000000000001'; assert n = 0, 'sov view filtered';
  select count(*) into n from public.mentions;                  assert n > 0, 'dana reads mentions';
  select count(*) into n from public.subscriptions;             assert n = 1, 'owner sees own subscription';
  -- staff tables are not even granted
  begin perform 1 from public.platform_admins; raise exception 'FAIL: platform_admins readable';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.platform_audit_log; raise exception 'FAIL: platform_audit_log readable';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.platform_access_grants;    assert n = 0, 'clients see no grants';
  -- the staff-revealing helper is not executable by clients:
  begin perform private.client_visible_actor('00000000-0000-4000-a000-000000000001'); raise exception 'FAIL: client_visible_actor callable';
  exception when insufficient_privilege then null; end;
end $$;
update public.organizations set name = 'Northwind Analytics (renamed)' where slug = 'northwind';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('brand-assets', '10000000-0000-4000-b000-000000000002/evil.svg');
    raise exception 'FAIL: cross-tenant upload allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('brand-assets', 'not-a-uuid/evil.svg');
    raise exception 'FAIL: upload outside org folder allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('untrusted-html', '10000000-0000-4000-b000-000000000001/x.html');
    raise exception 'FAIL: direct upload to untrusted-html allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.organizations set plan = 'agency' where slug = 'northwind';
    raise exception 'FAIL: client changed plan';
  exception when insufficient_privilege then null; end;
  begin
    update public.organizations set infisical_project_id = 'x' where slug = 'northwind';
    raise exception 'FAIL: client changed infisical_project_id';
  exception when insufficient_privilege then null; end;
  begin
    perform infisical_project_id from public.secret_refs;
    raise exception 'FAIL: client read secret_refs.infisical_project_id';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.memberships where user_id = '00000000-0000-4000-a000-000000000011';
    raise exception 'FAIL: last owner removed';
  exception when check_violation then null; end;
  begin
    insert into public.memberships (org_id, user_id, role)
    values ('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'viewer');
    raise exception 'FAIL: platform admin added as member';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.organizations (name, slug) values ('Evil', 'evil');
    raise exception 'FAIL: client created an org';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- ---------------------------------------------------------------- Sam: Northwind member
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'sam', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
insert into public.prompts (org_id, text) values ('10000000-0000-4000-b000-000000000001', 'Test prompt from a member');
do $$
declare n int;
begin
  select count(*) into n from public.prompts where text = 'Test prompt from a member' and created_by = '00000000-0000-4000-a000-000000000012';
  assert n = 1, 'created_by stamped with member id';
  select count(*) into n from public.audit_events;  assert n = 0, 'members cannot read audit events';
  select count(*) into n from public.api_keys;      assert n = 0, 'members cannot read api keys';
  select count(*) into n from public.subscriptions; assert n = 0, 'members cannot read billing';
  select count(*) into n from public.invitations;   assert n = 0, 'members cannot read invitations';
  begin
    insert into public.prompts (org_id, text) values ('10000000-0000-4000-b000-000000000002', 'cross tenant');
    raise exception 'FAIL: cross-tenant insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.prompt_runs (org_id, prompt_id, engine_id)
    select org_id, id, 'chatgpt' from public.prompts limit 1;
    raise exception 'FAIL: client wrote worker data';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.secret_refs (org_id, step_id, field_id, infisical_project_id, secret_name)
    values ('10000000-0000-4000-b000-000000000001', 'github', 'github_token', 'x', 'GITHUB_TOKEN');
    raise exception 'FAIL: client wrote secret_refs';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.audit_events (org_id, actor_kind, action) values ('10000000-0000-4000-b000-000000000001', 'member', 'forged');
    raise exception 'FAIL: client forged audit event';
  exception when insufficient_privilege then null; end;
  update public.memberships set role = 'owner' where user_id = '00000000-0000-4000-a000-000000000012';
  get diagnostics n = row_count;
  assert n = 0, 'member cannot change roles';
end $$;
rollback;

-- ---------------------------------------------------------------- Leo: Lumen viewer
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.prompts;      assert n = 18, 'leo reads lumen prompts, got ' || n;
  select count(*) into n from public.secret_refs;  assert n = 0, 'no refs seeded';
  begin
    insert into public.prompts (org_id, text) values ('10000000-0000-4000-b000-000000000002', 'viewer write');
    raise exception 'FAIL: viewer wrote a prompt';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- ---------------------------------------------------------------- MFA: enrolled factor + aal1 => nothing; org require_mfa
begin;
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-4000-a000-000000000022', 'verified');
update public.organizations set settings = settings || '{"require_mfa": true}' where id = '10000000-0000-4000-b000-000000000001';
select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.prompts; assert n = 0, 'enrolled user with aal1 sees nothing, got ' || n;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated', 'aal', 'aal2')::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.prompts; assert n = 18, 'aal2 restores access, got ' || n;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', :'dana', 'role', 'authenticated', 'aal', 'aal1')::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.prompts; assert n = 0, 'require_mfa org: aal1 member sees nothing';
  select count(*) into n from public.metrics_daily; assert n = 0, 'require_mfa applies to metrics view';
end $$;
rollback;

-- ---------------------------------------------------------------- Maya: Lumen owner (invitation flow)
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'maya', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
insert into public.invitations (org_id, email, role, token_hash)
values ('10000000-0000-4000-b000-000000000002', 'dana@northwind.example', 'owner', encode(extensions.digest('tok-123', 'sha256'), 'hex'));
select set_config('request.jwt.claims', json_build_object('sub', :'dana', 'role', 'authenticated', 'aal', 'aal1')::text, true);
select public.accept_invitation('tok-123');
do $$
declare n int;
begin
  select count(*) into n from public.organizations; assert n = 2, 'dana now sees 2 orgs, got ' || n;
end $$;
rollback;

-- ---------------------------------------------------------------- Staff
begin;
-- aal1 staff: nothing
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.organizations; assert n = 0, 'aal1 staff sees nothing, got ' || n;
end $$;
-- aal2 without grant: nothing
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated', 'aal', 'aal2')::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.organizations; assert n = 0, 'staff without grant sees nothing, got ' || n;
  select count(*) into n from public.prompts;       assert n = 0, 'staff without grant sees no prompts';
end $$;
reset role;
-- server creates a view grant for Lumen and an expired one for Northwind
insert into public.platform_access_grants (admin_user_id, org_id, mode, reason, created_at, expires_at) values
  (:'admin', :'lumen', 'view', 'Support ticket #123 review', now(), now() + interval '60 minutes'),
  (:'admin', :'nw', 'view', 'Old grant that has expired', now() - interval '2 hours', now() - interval '61 minutes');
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.organizations; assert n = 1, 'view grant: exactly lumen, got ' || n;
  select count(*) into n from public.prompts;       assert n = 18, 'view grant: lumen prompts';
  select count(*) into n from public.platform_access_grants; assert n = 2, 'staff sees own grants';
  begin
    insert into public.prompts (org_id, text) values ('10000000-0000-4000-b000-000000000002', 'staff write');
    raise exception 'FAIL: view grant allowed a write';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.platform_access_grants (admin_user_id, org_id, mode, reason, expires_at)
values (:'admin', :'lumen', 'act', 'Fix onboarding for client', now() + interval '30 minutes');
set local role authenticated;
update public.onboarding_progress set status = 'complete', notes = 'Accepted by staff'
where org_id = '10000000-0000-4000-b000-000000000002' and step_id = 'gsc';
insert into public.prompts (org_id, text) values ('10000000-0000-4000-b000-000000000002', 'Staff-added prompt');
do $$
declare n int;
begin
  select count(*) into n from public.onboarding_progress
  where org_id = '10000000-0000-4000-b000-000000000002' and step_id = 'gsc' and updated_by is null and completed_at is not null;
  assert n = 1, 'act grant writes; staff stamped as NULL actor';
  select count(*) into n from public.prompts where text = 'Staff-added prompt' and created_by is null;
  assert n = 1, 'staff-created prompt has NULL created_by';
end $$;
reset role;
-- grant window checks
do $$
begin
  begin
    insert into public.platform_access_grants (admin_user_id, org_id, mode, reason, expires_at)
    values ('00000000-0000-4000-a000-000000000001', '10000000-0000-4000-b000-000000000002', 'act', 'Too long act-as grant', now() + interval '2 hours');
    raise exception 'FAIL: act grant longer than 30 min accepted';
  exception when check_violation then null; end;
  begin
    update public.platform_audit_log set action = 'tampered';
    raise exception 'FAIL: platform_audit_log is mutable';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- ---------------------------------------------------------------- anon
begin;
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.plans; assert n > 0, 'anon can read plans';
  begin perform 1 from public.organizations; raise exception 'FAIL: anon read organizations';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.metrics_daily; raise exception 'FAIL: anon read metrics';
  exception when insufficient_privilege then null; end;
  begin perform private.can_read('10000000-0000-4000-b000-000000000001'); raise exception 'FAIL: anon used private helper';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- ---------------------------------------------------------------- H1: admins cannot escalate to owner via invitations
begin;
select set_config('request.jwt.claims', '{}', true);
update public.memberships set role = 'admin' where org_id = :'nw' and user_id = :'sam';
insert into public.invitations (id, org_id, email, role, token_hash, expires_at) values
  ('20000000-0000-4000-c000-000000000001', :'nw', 'alt@evil.example', 'admin', 'h1-admin', now() + interval '1 day'),
  ('20000000-0000-4000-c000-000000000002', :'nw', 'newowner@northwind.example', 'owner', 'h1-owner', now() + interval '1 day');
select set_config('request.jwt.claims', json_build_object('sub', :'sam', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    update public.invitations set role = 'owner' where id = '20000000-0000-4000-c000-000000000001';
    raise exception 'FAIL: admin promoted an invitation to owner';
  exception when insufficient_privilege then null; end;
  update public.invitations set email = 'alt@evil.example' where id = '20000000-0000-4000-c000-000000000002';
  get diagnostics n = row_count; assert n = 0, 'admin retargeted a pending owner invitation';
  begin
    insert into public.invitations (org_id, email, role, token_hash) values ('10000000-0000-4000-b000-000000000001', 'x@evil.example', 'owner', 'h1-x');
    raise exception 'FAIL: admin created an owner invitation';
  exception when insufficient_privilege then null; end;
  update public.invitations set role = 'member' where id = '20000000-0000-4000-c000-000000000001';
  get diagnostics n = row_count; assert n = 1, 'admin can still edit non-owner invitations';
end $$;
rollback;
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'dana', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  update public.invitations set role = 'owner' where org_id = '10000000-0000-4000-b000-000000000001' and email = 'priya@northwind.example';
  get diagnostics n = row_count; assert n = 1, 'owner can change an invitation to owner';
end $$;
rollback;

-- ---------------------------------------------------------------- content gaps: tenant RLS + admin-only approval
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'sam', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare gid uuid; cid uuid; n int;
begin
  insert into public.content_gaps (org_id, group_key, label) values ('10000000-0000-4000-b000-000000000001', 't|p|f', 'Gap') returning id into gid;
  insert into public.content_items (org_id, gap_id, title, content_type, status) values ('10000000-0000-4000-b000-000000000001', gid, 'L', 'listicle', 'draft') returning id into cid;
  update public.content_items set status = 'in_review' where id = cid;
  begin update public.content_items set status = 'approved' where id = cid; raise exception 'FAIL: member approved content';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.content_gaps where org_id = '10000000-0000-4000-b000-000000000002'; assert n = 0, 'no cross-tenant gaps';
end $$;
rollback;
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'dana', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare cid uuid;
begin
  insert into public.content_items (org_id, title, content_type, status) values ('10000000-0000-4000-b000-000000000001', 'L', 'listicle', 'in_review') returning id into cid;
  update public.content_items set status = 'approved' where id = cid;
end $$;
rollback;
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
begin
  begin insert into public.content_gaps (org_id, group_key, label) values ('10000000-0000-4000-b000-000000000002', 'x', 'x'); raise exception 'FAIL: viewer wrote a gap';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- ---------------------------------------------------------------- M5/L3: no direct storage writes, no direct member adds
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'dana', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner) values ('brand-assets', '10000000-0000-4000-b000-000000000001/evil.svg', auth.uid());
    raise exception 'FAIL: member wrote to brand-assets directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.memberships (org_id, user_id, role) values ('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000022', 'member');
    raise exception 'FAIL: admin/owner added a user without an invitation';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- ---------------------------------------------------------------- geo_audits tenancy
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'dana', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  insert into public.geo_audits (org_id, url, score) values ('10000000-0000-4000-b000-000000000001', 'https://nw.example', 80);
  select count(*) into n from public.geo_audits; assert n = 1, 'dana sees her org audit, got ' || n;
  begin
    insert into public.geo_audits (org_id, url, score) values ('10000000-0000-4000-b000-000000000002', 'https://x.example', 10);
    raise exception 'FAIL: cross-tenant geo_audits insert allowed';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
rollback;

-- ---------------------------------------------------------------- structural checks
do $$
declare n int;
begin
  select count(*) into n from pg_tables where schemaname = 'public' and not rowsecurity;
  assert n = 0, n || ' public tables without RLS';
  select count(*) into n from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public' and table_name not in ('plans', 'engines');
  assert n = 0, n || ' anon grants outside plans/engines';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('is_platform_admin', 'client_visible_actor', 'can_read_org', 'is_member', 'has_role');
  assert n = 0, 'no authorization helpers left in public';
end $$;

select 'rls_smoke: all assertions passed' as result;
