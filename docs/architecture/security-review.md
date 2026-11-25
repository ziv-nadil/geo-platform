# Security review — 2026-11-25

Scope: code against `docs/architecture/security.md`: migrations + RLS, `web/src/lib/server/**`,
`web/src/app/api/**`, `web/src/proxy.ts`, dashboard server actions, admin view-as, dev bypass,
cron auth and the Stripe webhook.

## Fixed in this branch

| ID | Severity | Finding | Fix | Test |
|----|----------|---------|-----|------|
| H1 | High | **Org admin could become owner.** `invitations_update` only checked `can_write(org,'admin')`. An admin could invite an account they control as `admin`, `UPDATE` its role to `owner` (or retarget a pending owner invitation's email) through the Data API, then accept it; `accept_invitation()` trusts the stored role and bypasses the owner guard on `memberships`. | `supabase/migrations/20261125000300_security_review.sql`: update policy applies the owner rule to old and new rows. | `rls_smoke.sql` "H1" block (fails without the migration). |
| H2 | High | **Route handlers skipped MFA.** `requireOrgAccess()` accepted members at any `aal`. RLS enforces `aal_ok()` + `org_mfa_ok()`, but these routes continue with the secret key, so a password-only (aal1) session of a user who enrolled MFA, or of a `require_mfa` org, could write vault secrets (`/secrets`), open the Stripe billing portal, upload files and run tests. | `auth.ts`: `requireOrgAccess` loads verified-factor + org `require_mfa` with the membership and returns 403 `mfa_required` (`mfaSatisfied()`). | `src/lib/server/__tests__/security.test.ts`, `org-access.db.test.ts` (DB-backed, fails without the fix). |
| M1 | Medium | `POST /api/onboarding/[orgId]/test/[stepId]` (and the `/tests` alias) had no Origin check, unlike every other state-changing route. SameSite=Lax cookies mitigate, but it triggers vault reads and outbound calls. | `checkOrigin(request)` added. | `security.test.ts` (checkOrigin). |
| M2 | Medium | `proxy.ts` gated on `NEXT_PUBLIC_SUPABASE_ANON_KEY`, but the app uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, so the signed-out redirect for `/app` and `/admin` never ran (pages still refused data; defense in depth lost). | Use the publishable key name. | n/a (config). |
| L1 | Low | Dev identity bypass in `db.ts` (`DEV_IMPERSONATE_USER_ID`) was guarded only by `NODE_ENV`, unlike `lib/data.ts` (also localhost DB). | Both now also refuse when `VERCEL`/`VERCEL_ENV` is set; `db.ts` requires a localhost `DATABASE_URL` (`devBypassAllowed()`). | `security.test.ts` (prod, Vercel preview, remote DB all return null). |

## Fixed in the fixes pass (claude/fixes)

| ID | Severity | Finding | Fix | Test |
|----|----------|---------|-----|------|
| M4 | Medium | `safeFetch` DNS-rebinding TOCTOU; `::a.b.c.d` and `2002::/16` not treated as private. | The validated address is pinned with an undici `Agent` `connect.lookup` hook (one agent per hop; TLS still verifies the hostname). `isPrivateAddress` now blocks `::/96` and 6to4. | `safe-fetch.test.ts` (pin reaches a host that does not resolve; ranges). |
| M5 | Medium | Members could write to `brand-assets` directly via Storage, bypassing sniff/SVG/size checks and MFA. | Migration `20261125000500_security_fixes.sql` drops the authenticated insert/update policies; uploads only go through `/api/onboarding/[orgId]/files` (secret key). Read (signed URL) and admin delete remain. | `rls_smoke.sql` "M5/L3". |
| L2 | Low | Regex SVG screen missed entity-encoded schemes and `<set attributeName="href">`. | `svgIsSafe` now uses a real XML parse (`fast-xml-parser`): well-formed, `<svg>` root, no DOCTYPE/ENTITY, no script/foreignObject/iframe/object/embed in any namespace prefix, no `on*`, entities decoded before scheme checks, links only `#fragment` or inline raster data URIs, CSS `url()`/`@import` rejected. | `uploads.test.ts`. |
| L3 | Low | Org admin could add any `auth.users` id as a member without an invitation. | `memberships_insert` policy dropped and `insert` revoked from `authenticated`; members arrive via `accept_invitation()` or the server key. | `rls_smoke.sql` "M5/L3". |

## Open (medium / low): not fixed here

| ID | Severity | Finding | Suggested fix |
|----|----------|---------|---------------|
| M3 | Medium | Rate limits (`rateLimited`) are per serverless instance and in memory; the intake nonce replay cache is too. Effective limits scale with instance count. **Not fixable in code alone:** needs a Vercel Firewall rate-limit rule (or a shared store). | Add Vercel Firewall rules for `/api/onboarding/*/secrets`, `/test`, `/files` (as §6.2 says), e.g. 20 req/min per IP+path, before go-live; or Upstash/Postgres-backed buckets. |
| L4 | Low | `entity_candidates` has no restrictive MFA policy and grants `update` on all columns (members can rewrite `name`, counts). | `apply_tenant_rls`-style `_mfa` policy; column grant `update (status)`. |
| L5 | Low | Owner-guard bypass relies on the custom GUC `beacon.accepting_invitation`, which any session able to run SQL can set. PostgREST can't, and `withRls` callers don't take SQL from users, so not reachable today. | Check `pg_trigger_depth()` / a security-definer-only marker, or move the insert into a function owned by a role the trigger trusts. |
| L6 | Low | `PUT /progress` caps `data` at 200 KB but `notes` is unbounded; `startViewAs` does not validate `orgId` as a UUID or cap `reason` length. | Length caps and `isUuid` check. |
| L7 | Low | `checkOrigin` builds the allowlist from `x-forwarded-host`/`host`. Fine on Vercel (platform sets them); behind another proxy it should rely on `NEXT_PUBLIC_APP_URL` only. | Prefer `NEXT_PUBLIC_APP_URL` when set and ignore request host headers in production. |

## Checked, no issue found

- Cron routes: `Authorization: Bearer CRON_SECRET`, constant-time compare, 503 when unset (never open).
- Stripe webhook: signature verified on the raw body, excluded from the proxy matcher, idempotent via `stripe_events`, subscription re-fetched from the API.
- Secret intake: JWE with org binding, 300 s expiry, nonce, values never logged or echoed; vault paths derived from a fixed catalog and `[a-z0-9_]` segments only; `secret_refs` not client-writable.
- Secret broker: org from server context, project id from `organizations`, access logged before the read.
- Staff visibility: `platform_admins`/`platform_audit_log` ungranted; grants need aal2 + unexpired grant; audit masks staff as `agency`; view-as grants are `view` only and audited.
- Server actions in `app/[orgSlug]/actions.ts` all run under `withRls`; owner changes blocked by `tg_memberships_guard`.
- `metrics_daily` (definer view over an unexposed matview) filters with `can_read` + MFA; other views are `security_invoker`.
