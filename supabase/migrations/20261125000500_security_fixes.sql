-- Security review follow-ups (docs/architecture/security-review.md): M5 and L3.
--
-- M5: members could write any object under '<org>/' in brand-assets straight through the Storage API,
-- bypassing the server's magic-byte sniff, SVG screen and size cap. Uploads now happen only in
-- /api/onboarding/[orgId]/files, which uses the secret key (bypasses RLS). Reads (signed URLs) and admin deletes stay.
drop policy if exists "brand-assets: editors upload" on storage.objects;
drop policy if exists "brand-assets: editors update" on storage.objects;

-- L3: an org admin could add any existing auth.users id to the org without that user's consent.
-- Members now arrive only through accept_invitation() (security definer) or the server key.
drop policy if exists memberships_insert on public.memberships;
revoke insert on public.memberships from authenticated;
