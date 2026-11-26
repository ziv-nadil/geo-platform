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

### 3. Infisical (security.md §1)

1. Org "GEO Engine" on Infisical Cloud (upgrade to Pro before the first real client credential: audit logs).
2. Project `beacon-platform` (env `prod`, `preview`) for our own secrets, including `INTAKE_JWE_PRIVATE_JWK`.
3. Three machine identities: `beacon-provisioner` (org role allowed to create projects), `beacon-app-writer`, `beacon-worker`.
   Preferred auth: **OIDC** with Vercel (issuer `https://oidc.vercel.com/<team>`, subject
   `owner:<team>:project:beacon-geo:environment:production`). Set `INFISICAL_<ROLE>_IDENTITY_ID`.
   Fallback: Universal Auth, set `INFISICAL_<ROLE>_CLIENT_ID` + `INFISICAL_<ROLE>_CLIENT_SECRET`.
   Also set `INFISICAL_<ROLE>_MACHINE_IDENTITY_ID` (used to add identities to client projects / self-removal).
4. Per client, `POST /api/admin/orgs` creates the project `beacon-<slug>`, its folders, adds the writer
   and worker, and removes the provisioner. The write-only **additional privilege** for app-writer is
   applied by hand until verified on our plan (the response lists it as a pending step).

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
