# GEO Engine: Runbook

How to run GEO Engine locally on real infrastructure, and how production gets provisioned once
credentials exist. Security design: `docs/architecture/security.md`.

## Local development (no Docker, no mocks)

```bash
scripts/dev-db.sh            # PG16 in .devdb/ + Supabase compat stub + migrations + demo seed; prints DATABASE_URL
scripts/dev-db.sh --reset    # drop and rebuild the database
scripts/dev-db.sh --stop
```

`web/.env.local` for local work:

```
DATABASE_URL=postgres://postgres@localhost:54322/beacon
# Without Supabase Auth locally, act as a seeded user (ignored in production):
DEV_IMPERSONATE_USER_ID=00000000-0000-4000-a000-000000000011   # Dana, Northwind owner
# DEV_IMPERSONATE_AAL=aal2  with ...0001 = the demo platform admin (admin console)
```

Seeded users: `...0001` super admin placeholder (needs aal2), `...0011` Dana (Northwind owner),
`...0012` Sam (Northwind member), `...0021` Maya (Lumen owner), `...0022` Leo (Lumen viewer).

Checks:

```bash
PGHOST=localhost PGPORT=54322 PGUSER=postgres supabase/tests/local/run.sh    # migrations + seed + RLS smoke tests (separate DB)
cd web && DATABASE_URL=postgres://postgres@localhost:54322/beacon \
  NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/validate-queries.ts   # every query function, as real users, RLS on
python3 supabase/scripts/gen_types.py beacon web/src/lib/db.types.ts            # regenerate DB types (PGHOST/PGPORT/PGUSER set)
```

How data access works: `web/src/lib/server/db.ts` connects with `DATABASE_URL` (the `postgres`
driver). `withRls(claims, fn)` runs each query in a transaction as role `authenticated` with
`request.jwt.claims` set, exactly like PostgREST, so every RLS policy applies. `withService` bypasses
RLS and is used only by the admin console (aal2 + `platform_admins`, audited) and server jobs
(secret refs, test results, Stripe sync). Query functions: `web/src/lib/server/queries/index.ts`.

## Production provisioning

### 1. Accounts and tokens (once, by a human)

Add each value in the cloud environment settings (never paste in chat):

| Variable | Where |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com > Account > Access Tokens |
| `SUPABASE_PROJECT_REF` | the `beacon-geo` project's ref (Project Settings > General) |
| `SUPABASE_DB_PASSWORD` | set when creating the project (Database settings to reset) |
| `VERCEL_TOKEN` (+ `VERCEL_SCOPE` if in a team) | vercel.com > Account Settings > Tokens |
| `INFISICAL_*` | see step 3 |
| `INTAKE_JWE_PRIVATE_JWK` | step 4 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe > Developers (webhook endpoint `https://<app>/api/stripe/webhook`; events `checkout.session.completed`, `customer.subscription.*`) |
| `DNS_VERIFY_SECRET`, `AWS_EXTERNAL_ID_SECRET`, `INDEXNOW_SECRET` (derives per-client IndexNow keys) | `openssl rand -hex 32` each; never rotate casually (they derive per-client TXT values and ExternalIds) |
| Agency identities (optional per integration) | `GOOGLE_CLIENT_ID/SECRET` + `AGENCY_GOOGLE_REFRESH_TOKEN` + `AGENCY_GOOGLE_EMAIL`, `AGENCY_EMAIL`, `AGENCY_GITHUB_TOKEN`, `AGENCY_BING_API_KEY`, `AWS_ACCESS_KEY_ID/SECRET_ACCESS_KEY` (our principal for AssumeRole), `GOOGLE_ADS_DEVELOPER_TOKEN`/`GOOGLE_ADS_LOGIN_CUSTOMER_ID`/`GOOGLE_ADS_API_VERSION` |

In the Supabase project, create the new-style API keys (Project Settings > API Keys: publishable +
secret). Legacy anon/service_role keys are not used.

### 2. Run the script

```bash
scripts/provision.sh --dry-run      # prints every step, changes nothing
scripts/provision.sh                # link + db push, read keys + pooler URL, set Vercel env, deploy
scripts/provision.sh --skip-deploy
```

It does, in order:
1. `supabase link --project-ref $SUPABASE_PROJECT_REF` and `supabase db push` (migrations only; `seed.sql` is never pushed to prod).
2. Reads the publishable/secret API keys and the **transaction-mode pooler URL** (port 6543) via the Management API.
3. `vercel link` (project `beacon-geo`), then sets production env: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, plus every optional variable that is set (as Sensitive).
4. `vercel deploy --prod`.
It exits with a clear message listing any missing required variable.

### 3. Infisical (security.md §1) and per-client isolation (architecture/isolation.md)

**Cost gate: Infisical Pro is required before the first real client credential is stored** (owner decision 2026-11-26,
DECISIONS.md). Free allows 5 identities in total; per-client isolation needs one reader identity per client
(~$23/identity/mo monthly billing, ~$20 annual). Do not store a real client credential on Free.

1. Org "GEO Engine" on Infisical Cloud, **Pro**. Note the org id → `INFISICAL_ORG_ID`.
2. Project `beacon-platform` (env `prod`, `preview`) for our own secrets, including `INTAKE_JWE_PRIVATE_JWK`.
3. Vercel-side machine identities (only these two in production): `beacon-provisioner` (org permission to create
   projects **and identities**; token TTL 300 s, alert on every use) and `beacon-app-writer` (write-only intake).
   Preferred auth: **OIDC** with Vercel (issuer `https://oidc.vercel.com/<team>`, subject
   `owner:<team>:project:beacon-geo:environment:production`). Set `INFISICAL_<ROLE>_IDENTITY_ID`.
   Fallback: Universal Auth, set `INFISICAL_<ROLE>_CLIENT_ID` + `INFISICAL_<ROLE>_CLIENT_SECRET`.
   Also set `INFISICAL_<ROLE>_MACHINE_IDENTITY_ID` (used to add identities to client projects / self-removal).
   `beacon-worker` (shared reader) exists only for `ISOLATION_MODE=shared` (dev / migration week); see step 9.
4. Vercel env: `ISOLATION_MODE=per_client` (the default when `VERCEL_ENV=production`), `GITHUB_REPOSITORY=<owner>/geo-platform`,
   `GITHUB_DISPATCH_TOKEN` (fine-grained, this repo only, **Actions: write**), `GITHUB_ADMIN_TOKEN` (fine-grained, this repo
   only, **Administration + Environments + Variables: write**; used only by org creation), optional
   `GITHUB_OIDC_SUB_PREFIX` (otherwise read from `GET /repos/{owner}/{repo}/actions/oidc/customization/sub`; repos created
   after 2026-07-15 use an id-based prefix), optional `INFISICAL_CLIENT_READER_PROJECT_ROLE` (default `viewer`; must be read-only).
   Every one of these is optional for the app to boot: without them the features report `not_configured`.
5. GitHub: org on **Team** (environments in a private repo). Protect `main` (required review; CODEOWNERS on
   `.github/workflows/**`, `web/src/lib/server/secrets/**`, `web/src/lib/server/isolation/**`, `web/src/lib/server/jobs/**`).
6. **Per client, on org creation** (`POST /api/admin/orgs`), the provisioner, in order:
   1. creates project `beacon-<slug>` (env `prod` only) and its folders;
   2. creates identity `reader-<slug>` (org role `no-access`);
   3. attaches **OIDC auth** to it: issuer `https://token.actions.githubusercontent.com`, audience `infisical`,
      subject exactly `<prefix>:environment:client-<slug>`, claim `environment=client-<slug>`, TTL 600 s;
   4. adds `reader-<slug>` to `beacon-<slug>` **only**, role `viewer` (read-only); adds `beacon-app-writer` (`no-access`
      plus the write-only privilege, still applied by hand: the response lists it as pending);
   5. removes itself from the project;
   6. creates GitHub environment `client-<slug>` (deployment branch `main` only; vars `ORG_ID`, `ORG_SLUG`,
      `INFISICAL_IDENTITY_ID`; **no secrets**);
   7. stores `organizations.infisical_project_id`, `reader_identity_id`, `runner_environment`, `runner_oidc_subject` (ids only).
   The response shows every step (`vault.steps`, `github.steps`). Any `ok: false` step: fix and re-run step 7 below.
7. **Environments backfill / repair** (idempotent):
   `GITHUB_ADMIN_TOKEN=… GITHUB_REPOSITORY=… DATABASE_URL=… node --experimental-strip-types scripts/github-environments.ts [--dry-run] [--slug acme]`.
   It prints `not_configured` without the token. Orgs that predate isolation also need steps 6.2–6.4 (identity) once;
   run them by re-creating the reader through the provisioner (`provisionReaderIdentity`) and then this script.
8. **Per client environment secrets** (Settings → Environments → `client-<slug>`): only platform keys the job needs
   (`DATABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `ANTHROPIC_API_KEY`, `APIFY_TOKEN`). **Never** a
   client credential: those are read at runtime from that client's vault project via OIDC. Optional var `INFISICAL_SITE_URL`.
9. **Cut-over** (isolation.md §5 Phase 3): after a week side by side, remove `beacon-worker` from every client project
   and delete it. From then on no Vercel runtime can read a client secret value.
10. Verify per client: Actions → `client-job` → Run workflow (`org_slug`, `job_type=monitoring`). The run must use
    environment `client-<slug>`; `secret_access_log.runner_sub` must equal `organizations.runner_oidc_subject`.

### 4. Intake key

```bash
node -e "import('jose').then(async j=>{const {privateKey}=await j.generateKeyPair('ECDH-ES+A256KW',{crv:'P-256',extractable:true});console.log(JSON.stringify({...await j.exportJWK(privateKey),kid:'intake-'+new Date().toISOString().slice(0,10)}))})"
```

Store the output as `INTAKE_JWE_PRIVATE_JWK` (Infisical `beacon-platform/prod` and Vercel Sensitive env).
Rotate every 180 days: move the old one to `INTAKE_JWE_PRIVATE_JWK_PREVIOUS` for the overlap.

### 5. First platform admin

1. Sign up with the staff account, enroll TOTP (Settings > Security).
2. In the Supabase SQL editor: `insert into public.platform_admins (user_id, note) values ('<auth.users id>', 'founder');`
3. Sign in again with MFA (aal2); `/admin` now works. Staff never get memberships; client data needs a
   view-as/act-as grant (`public.platform_access_grants`, 60/30 min).

### 6. After deploy

- Supabase Auth: Site URL + exact redirect URLs, email confirmation on, Turnstile, Google/Microsoft providers (security.md §4).
- Schedule `select public.refresh_metrics();` hourly (pg_cron in Supabase: `select cron.schedule('refresh-metrics', '7 * * * *', 'select public.refresh_metrics()');`).
- Run `supabase/tests/local/rls_smoke.sql` logic as pgTAP against a preview branch before inviting clients.
