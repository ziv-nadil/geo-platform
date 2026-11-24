-- RLS smoke tests. Run after migrations + seed (see run.sh). Each block impersonates a user the
-- way PostgREST does (role authenticated + request.jwt.claims) and asserts what they can see/do.
-- Every block runs in a transaction that is rolled back.
\set ON_ERROR_STOP 1

-- Users from seed.sql
\set admin  '00000000-0000-4000-a000-000000000001'
\set dana   '00000000-0000-4000-a000-000000000011'
\set sam    '00000000-0000-4000-a000-000000000012'
\set maya   '00000000-0000-4000-a000-000000000021'
\set leo    '00000000-0000-4000-a000-000000000022'

-- ---------------------------------------------------------------- Dana: Northwind owner
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'dana', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.organizations;            assert n = 1, 'dana sees 1 org, got ' || n;
  select count(*) into n from public.organizations where slug = 'lumen'; assert n = 0, 'dana must not see lumen';
  select count(*) into n from public.memberships;               assert n = 2, 'dana sees 2 memberships, got ' || n;
  select count(*) into n from public.platform_admins;           assert n = 0, 'clients never see platform_admins';
  select count(*) into n from public.profiles;                  assert n = 2, 'dana sees self + sam only, got ' || n;
  select count(*) into n from public.profiles where email = 'admin@beacon-geo.example'; assert n = 0, 'admin profile hidden';
  select count(*) into n from public.audit_log;                 assert n = 1, 'dana sees only org-visible audit rows, got ' || n;
  select count(*) into n from public.audit_log where visibility = 'platform'; assert n = 0, 'platform audit hidden';
  select count(*) into n from public.prompts where org_id = '10000000-0000-4000-b000-000000000002'; assert n = 0, 'no cross-tenant prompts';
  select count(*) into n from public.metrics_daily where org_id <> '10000000-0000-4000-b000-000000000001'; assert n = 0, 'metrics_daily filtered';
  select count(*) into n from public.metrics_daily;             assert n > 0, 'metrics_daily has northwind rows';
  select count(*) into n from public.share_of_voice_daily where org_id <> '10000000-0000-4000-b000-000000000001'; assert n = 0, 'sov view filtered';
  select count(*) into n from public.mentions;                  assert n > 0, 'dana reads mentions';
  select count(*) into n from public.subscriptions;             assert n = 1, 'owner sees own subscription';
end $$;
-- storage: own org folder ok
insert into storage.objects (bucket_id, name) values ('brand-assets', '10000000-0000-4000-b000-000000000001/logo.svg');
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('brand-assets', '10000000-0000-4000-b000-000000000002/evil.svg');
    raise exception 'FAIL: cross-tenant upload allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('brand-assets', 'not-a-uuid/evil.svg');
    raise exception 'FAIL: upload outside org folder allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.organizations set plan = 'agency' where slug = 'northwind';
    raise exception 'FAIL: client changed plan';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.memberships where user_id = '00000000-0000-4000-a000-000000000011';
    raise exception 'FAIL: last owner removed';
  exception when check_violation then null;
  end;
  begin
    insert into public.memberships (org_id, user_id, role)
    values ('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'viewer');
    raise exception 'FAIL: platform admin added as member';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.organizations set name = 'Northwind Analytics (renamed)' where slug = 'northwind';
rollback;

-- ---------------------------------------------------------------- Sam: Northwind member
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'sam', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.prompts (org_id, text) values ('10000000-0000-4000-b000-000000000001', 'Test prompt from a member');
do $$
declare n int;
begin
  select count(*) into n from public.prompts where text = 'Test prompt from a member' and created_by = '00000000-0000-4000-a000-000000000012';
  assert n = 1, 'created_by stamped with member id';
  select count(*) into n from public.audit_log;   assert n = 0, 'members cannot read audit log';
  select count(*) into n from public.api_keys;    assert n = 0, 'members cannot read api keys';
  select count(*) into n from public.subscriptions; assert n = 0, 'members cannot read billing';
  begin
    insert into public.prompts (org_id, text) values ('10000000-0000-4000-b000-000000000002', 'cross tenant');
    raise exception 'FAIL: cross-tenant insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.prompt_runs (org_id, prompt_id, engine_id)
    select org_id, id, 'chatgpt' from public.prompts limit 1;
    raise exception 'FAIL: client wrote worker data';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.secret_refs (org_id, step_id, field_id, infisical_project_id, secret_name)
    values ('10000000-0000-4000-b000-000000000001', 'github', 'github_token', 'x', 'GITHUB_TOKEN');
    raise exception 'FAIL: client wrote secret_refs';
  exception when insufficient_privilege then null;
  end;
  update public.memberships set role = 'owner' where user_id = '00000000-0000-4000-a000-000000000012';
  get diagnostics n = row_count;
  assert n = 0, 'member cannot change roles';
end $$;
rollback;

-- ---------------------------------------------------------------- Leo: Lumen viewer
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.prompts;      assert n = 7, 'leo reads lumen prompts, got ' || n;
  select count(*) into n from public.secret_refs;  assert n = 0, 'viewer cannot list secret refs';
  begin
    insert into public.prompts (org_id, text) values ('10000000-0000-4000-b000-000000000002', 'viewer write');
    raise exception 'FAIL: viewer wrote a prompt';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- ---------------------------------------------------------------- Maya: Lumen owner (invitation flow)
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'maya', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.invitations (org_id, email, role, token_hash)
values ('10000000-0000-4000-b000-000000000002', 'dana@northwind.example', 'owner', encode(extensions.digest('tok-123', 'sha256'), 'hex'));
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-000000000011', 'role', 'authenticated')::text, true);
select public.accept_invitation('tok-123');
do $$
declare n int;
begin
  select count(*) into n from public.organizations; assert n = 2, 'dana now sees 2 orgs, got ' || n;
end $$;
rollback;

-- ---------------------------------------------------------------- Super admin
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.organizations;   assert n = 2, 'admin sees all orgs';
  select count(*) into n from public.audit_log;       assert n = 2, 'admin sees all audit rows';
  select count(*) into n from public.platform_admins; assert n = 1, 'admin sees platform_admins';
  select count(*) into n from public.memberships where user_id = '00000000-0000-4000-a000-000000000001'; assert n = 0, 'admin holds no membership';
end $$;
update public.onboarding_progress set status = 'complete', notes = 'Accepted by staff'
where org_id = '10000000-0000-4000-b000-000000000002' and step_id = 'gsc';
select public.write_audit('10000000-0000-4000-b000-000000000002', 'onboarding.accept_partial', 'step', 'gsc');
do $$
declare n int;
begin
  select count(*) into n from public.onboarding_progress
  where org_id = '10000000-0000-4000-b000-000000000002' and step_id = 'gsc' and updated_by is null and completed_at is not null;
  assert n = 1, 'staff edits are stamped as NULL actor';
  select count(*) into n from public.audit_log where action = 'onboarding.accept_partial' and visibility = 'platform' and actor_kind = 'platform_admin';
  assert n = 1, 'staff audit rows forced to platform visibility';
end $$;
-- Maya (Lumen owner) must not see that staff audit row or who changed the step
select set_config('request.jwt.claims', json_build_object('sub', :'maya', 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.audit_log where action = 'onboarding.accept_partial'; assert n = 0, 'client cannot see staff action';
end $$;
rollback;

-- ---------------------------------------------------------------- anon
begin;
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.plans; assert n > 0, 'anon can read plans';
  begin
    perform 1 from public.organizations;
    raise exception 'FAIL: anon read organizations';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.metrics_daily;
    raise exception 'FAIL: anon read metrics';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- ---------------------------------------------------------------- RLS enabled on every public table
do $$
declare n int;
begin
  select count(*) into n from pg_tables where schemaname = 'public' and not rowsecurity;
  assert n = 0, n || ' public tables without RLS';
end $$;

select 'rls_smoke: all assertions passed' as result;
