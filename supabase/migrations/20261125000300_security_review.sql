-- Security review 2026-11-25 (docs/architecture/security-review.md).
--
-- H1: an org admin could escalate to owner. invitations_update (from apply_tenant_rls) only checked
-- can_write(org, 'admin'), so an admin could invite an account they control as 'admin', UPDATE the
-- invitation's role to 'owner' (or retarget a pending owner invitation's email), then accept it:
-- accept_invitation() trusts the stored role and bypasses the owner guard on memberships.
-- The update check now applies the same owner rule as invitations_insert, on the old and new row.
drop policy if exists invitations_update on public.invitations;
create policy invitations_update on public.invitations for update to authenticated
  using (
    (select private.can_write(org_id, 'admin'))
    and (role <> 'owner' or (select private.has_role(org_id, 'owner')) or (select private.admin_can_act(org_id)))
  )
  with check (
    (select private.can_write(org_id, 'admin'))
    and (role <> 'owner' or (select private.has_role(org_id, 'owner')) or (select private.admin_can_act(org_id)))
  );
