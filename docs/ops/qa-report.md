# QA report: GEO Engine web (e2e)

Run date: 2026-11-25. Branch `claude/qa` (code at `e9b3026`). Dev DB via `scripts/dev-db.sh`, app via `next dev` with the dev auth bypass.
Suite: `web/e2e/` (Playwright 1.63, chromium). Run all: `web/e2e/run.sh` (one dev server per identity, because `DEV_AUTH_USER_ID` is process-wide).

**Result: 55 passed, 6 failed, 61 total.** The failures map to the bugs below.

## Environment problems hit first

- **B1 (blocker for a fresh checkout)** `scripts/dev-db.sh` fails on `supabase/migrations/20261125000100_engines_pipeline.sql:137`: `function public.can_read_org(uuid) does not exist`. The tenancy helpers live in schema `private` (`private.can_read(org)`, `private.can_write(org, role)`), and the migration also uses `public.can_edit_org`. The seed never runs, so the app has no data. I worked around it locally with an uncommitted sed (`private.can_read(org_id)`, `private.can_write(org_id,'member')`); the file in the repo is unchanged. Also on `claude/zealous-hamilton-nlkizt`. Severity: **critical** for onboarding any dev or CI.
- Playwright: `@playwright/test@1.63.0` added to `web/package.json` devDependencies (matches the preinstalled browser).

## Results by test

| Identity | Test | Result |
|---|---|---|
| anon | login page shows 'Auth not configured' | PASS |
| anon | signup page renders without crashing | PASS |
| anon | /app without any identity does not expose dashboard data | PASS |
| anon | /admin without identity shows sign-in prompt, not the console | PASS |
| client | tab overview loads with data | PASS |
| client | tab prompts loads with data | PASS |
| client | tab competitors loads with data | PASS |
| client | tab citations loads with data | PASS |
| client | tab responses loads with data | PASS |
| client | tab sentiment loads with data | PASS |
| client | tab site-health loads with data | PASS |
| client | tab crawlers loads with data | PASS |
| client | tab content loads with data | PASS |
| client | tab creators loads with data | PASS |
| client | tab outreach loads with data | PASS |
| client | tab reports loads with data | PASS |
| client | tab settings loads with data | PASS |
| client | tab onboarding loads with data | PASS |
| client | overview shows seeded KPIs (not empty) | PASS |
| client | tooltips on overview | PASS |
| client | tooltips on competitors | PASS |
| client | tooltips on citations | PASS |
| client | tooltips on sentiment | PASS |
| client | tooltips on crawlers | PASS |
| client | every metric tooltip on overview has definition + formula | PASS |
| client | date range switch updates URL / view | PASS |
| client | prompt detail opens from list | PASS |
| client | prompt detail with unknown id is 404 | PASS |
| client | competitors: add then remove | **FAIL** |
| client | competitor form validates domain | PASS |
| client | source tags: create, edit, delete | PASS |
| client | settings: every tab renders | PASS |
| client | settings: members tab lists seeded members | PASS |
| client | tenant isolation: Northwind user cannot open Lumen | PASS |
| client | tenant isolation: org switcher lists only own orgs | PASS |
| client | /admin is 404 for a client user | PASS |
| client | admin API refuses a client user | PASS |
| client | onboarding API refuses another org | PASS |
| client | unknown org slug is 404 | PASS |
| lumen | progress bar is consistent with the summary text | **FAIL** |
| lumen | step count is consistent (header vs 'N of M steps') | PASS |
| lumen | step navigation: sidebar, Next and Previous | PASS |
| lumen | review step is reachable and lists all steps | PASS |
| lumen | skip an optional step and undo (progress changes) | **FAIL** |
| lumen | required (non-optional) step has no plain skip except GitHub | PASS |
| lumen | selector field shows/hides dependent fields (access method) | PASS |
| lumen | CMS selector toggles fields (WordPress adds Username, Other swaps credential for notes) | PASS |
| lumen | instructions variant follows the CMS | PASS |
| lumen | instructions variant follows the DNS provider | PASS |
| lumen | instructions do not leak raw placeholders or variant keys | **FAIL** |
| lumen | live test returns not_configured gracefully | PASS |
| lumen | test API returns not_configured JSON | **FAIL** |
| lumen | skip state persists across reload | **FAIL** |
| lumen | tenant isolation: Lumen owner cannot open Northwind | PASS |
| lumen | /admin is 404 for client owner | PASS |
| admin (aal2) | /admin loads | PASS |
| admin (aal2) | /admin/settings loads | PASS |
| admin (aal2) | admin console shows MFA verified | PASS |
| admin (aal2) | admin cannot open a client org without a support grant | PASS |
| admin (aal1) | console loads but flags that MFA is required for client access | PASS |
| admin (aal1) | client org data is not reachable at aal1 | PASS |

## Bugs found

| # | Sev | Title |
|---|---|---|
| B1 | critical | Migration 20261125000100 references nonexistent `public.can_read_org`/`can_edit_org` (above) |
| B2 | high | Adding a competitor succeeds in the DB but the row never appears in the UI |
| B3 | high | `/api/onboarding/*` ignores the dev auth bypass (401); live tests and progress saves fail silently |
| B4 | medium | Raw `{{AGENCY_EMAIL}}` / `{{DNS_TXT_VALUE}}` placeholders and variant keys shown in onboarding instructions |
| B5 | medium | Two progress bars disagree (top 25%, summary 21%); top bar does not follow skips |
| B6 | medium | Skipping a step is not persisted (reload loses it), same cause as B3 |
| B7 | low | Not-found pages return HTTP 200 (dev) instead of 404 |
| B8 | low | Misc nits: "Step 1 of 15" vs "3 of 14 steps"; admin label "Super Admin (placeholder)"; dialog title duplicated as description; add-competitor dialog keeps old input after submit |

### B2 Competitor added but not shown
- Steps: as Dana (Northwind owner) open `/app/northwind/competitors`, Add competitor, name `QA Rival`, domain `qa-rival-example.com`, submit.
- Expected: row appears (zeros until the next run, as the dialog says) and can be removed with "Stop tracking".
- Actual: dialog closes, no error, list unchanged even after reload. `select * from competitors` shows the row, so the write works and the read does not surface it (likely the list reads from a metrics view or materialized data that needs `refresh_metrics()`, or filters on a run-derived join). A user can add the same competitor repeatedly. Test: `competitors: add then remove`.
- Hints: `web/src/app/app/[orgSlug]/actions.ts` (addCompetitor), `getCompetitors` in `web/src/lib/data.ts`, `web/src/components/dashboard/competitors-view.tsx`.

### B3 Onboarding API ignores dev bypass, and the UI is silent on 401
- Steps: as Lumen owner open `/app/lumen/onboarding`, step Access method, pick an option, press "Run live test"; or DNS step with domain + provider.
- Expected: pages work with the bypass, so these calls should too, returning `not_configured` (documented in `test/[stepId]/route.ts`), and the UI should show "The test service is not configured".
- Actual: `POST /api/onboarding/<org>/test/<step>` and `PUT .../progress` return `401 {"error":"unauthenticated"}`; the panel shows nothing at all (no error, no spinner end state). The `not_configured` UI path therefore could not be exercised end to end here.
- Hints: `web/src/app/api/onboarding/[orgId]/**/route.ts` should use `devBypassClaims()` from `web/src/lib/data.ts`; `web/src/components/onboarding/tests-panel.tsx` should surface non-2xx responses.
- Tests: `live test returns not_configured gracefully` (passes only because *some* text such as "not configured|sign in|could not" is accepted; it is a weak check, see note), `test API returns not_configured JSON` (FAIL).

### B4 Unresolved placeholders in instructions
- Steps: Lumen onboarding, Access method, option A: text reads "You will see our email in every following step: {{AGENCY_EMAIL}}." DNS step: "Value / Content: {{DNS_TXT_VALUE}}". Search Console step also prints the raw variant keys `agency_email` and `domain_user` as lines above the matching instructions.
- Expected: real agency email / issued TXT token substituted; variant keys hidden.
- Actual: literal tokens (these are the exact values the client must copy, so the DNS step is unusable as is).
- Hints: `web/src/components/onboarding/instructions-panel.tsx`, `web/src/config/onboarding.ts` (steps `access`, `dns`, `gsc`); env `AGENCY_EMAIL`, token from the progress/verification record.
- Test: `instructions do not leak raw placeholders or variant keys` (FAIL).

### B5 Progress bars disagree
- Steps: Lumen onboarding. Header progress bar `aria-valuenow=25`, summary "21% complete · 3 of 14". Skip an optional step: summary goes to 29%, the top bar stays 25 (it is not driven by step status).
- Expected: one number. Actual: two sources; the top bar seems stale or computed differently.
- Hints: `web/src/components/onboarding/wizard.tsx`, `web/src/components/ui/progress.tsx`.
- Test: `progress bar is consistent with the summary text` (FAIL). `skip an optional step and undo` (FAIL) fails only on the top-bar assertion; the summary and undo work.

### B6 Skip not persisted
- Steps: skip Cloudflare, reload, step is back to not skipped. Same `PUT progress` 401 as B3, so possibly dev-only; recheck after B3 is fixed.
- Test: `skip state persists across reload` (FAIL).

### B7 Not-found HTTP status
- `/app/lumen` as Dana, `/admin` as a client, `/app/nonexistent` all render "404 This page could not be found" but with HTTP **200** in `next dev` (streaming with `cacheComponents`). Content-based isolation is correct; verify the status code on a production build, since crawlers and uptime checks read the status.

## Passed behaviours worth knowing

- Login/signup show "Auth not configured" without Supabase env; anonymous `/app` and `/admin` show "Sign in to see this account" and no data.
- All 14 dashboard tabs load for a client owner, no page errors, seeded KPIs present; metric "?" tooltips render on overview, competitors, citations, sentiment and crawlers with definition + formula.
- Prompt detail loads; unknown id is 404. Settings has 7 tabs, all render; members list shows seeded members.
- Source tag create / edit / delete works.
- Tenant isolation holds in both directions (Northwind owner cannot open any Lumen page, Lumen owner cannot open Northwind, `/api/onboarding/<other org>` refused); org data is not shown to a platform admin without a grant (404), also at aal1.
- `/admin` is 404 for client users and loads for a platform admin at aal2. At aal1 the console loads and shows "MFA required for client access" (treated as intended; confirm that is the desired rule, since the brief suggests aal2 is required for `/admin`).
- Onboarding wizard: sidebar / Next / Previous navigation, review step, skip + undo of an optional step (summary changes), dependent fields show/hide (access method, CMS), instructions switch by CMS and by DNS provider.

## Coverage gaps / notes

- A live test returning `not_configured` could not be verified end to end (B3).
- Mutating tests clean up after themselves (competitors via psql). Re-seed with `scripts/dev-db.sh --reset` if state drifts.
- Tests run against `next dev`; behaviour of a production build (HTTP statuses, dev bypass off) is not covered.
