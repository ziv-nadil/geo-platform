# Waiting on you (review queue)

Decisions were made so work didn't stop. Each item says what I chose and what you need to do.

## Blocking (needs your action)

1. **Connect your computer for the AthenaHQ UI teardown.** Open the Claude desktop app → Settings → Claude Code →
   Remote Control and share a folder, or run `claude remote-control` in a terminal. Then tell me, and I'll
   browse AthenaHQ while you're logged in. Until then the teardown uses the AthenaHQ MCP connector + public docs.
2. **Accounts + tokens.** Add each token in the cloud environment settings (session title bar → environment → Edit →
   Network secrets / environment variables). Never paste tokens in chat. A new session picks them up.
   | Service | Create | Env var I read |
   |---|---|---|
   | Vercel | Free Hobby account → Account Settings → Tokens | `VERCEL_TOKEN` |
   | Supabase | Free org + project "beacon-geo" → Account → Access Tokens | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` |
   | Infisical Cloud | Free org → Organization → Machine Identities (Universal Auth, org admin for project creation) | `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET` |
   | Stripe | Test-mode account → Developers → API keys (restricted key ok) | `STRIPE_SECRET_KEY` |
   | Google OAuth (SSO + GSC/GA4 checks) | GCP project → OAuth client (Web) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
   | OpenAI / Perplexity / Gemini / Anthropic | API keys for engine monitoring | `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` (env var only) |
   | DataForSEO | Account (pay-as-you-go, $50 min) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` |
| Bria (images) | API key from Bria console | `BRIA_API_KEY` |
3. **Network allowlist.** If the environment is on "Limited" network, allow: `api.vercel.com`, `api.supabase.com`,
   `*.supabase.co`, `app.infisical.com`, `api.stripe.com`, `api.openai.com`, `api.perplexity.ai`,
   `generativelanguage.googleapis.com`, `api.dataforseo.com`.
   Confirmed needed: agents could NOT reach infisical.com, vercel.com, supabase.com, stripe.com, dataforseo.com, openai.com
   or ai.google.dev from this session, so pricing and docs were taken from search snippets.

4. **AthenaHQ teardown is paused.** My permission system blocked the agent that would reverse-engineer AthenaHQ
   through your connected AthenaHQ account. Decide whether to approve that explicitly (and whether public-web research only
   is fine). Until then the dashboard tabs are built from my own knowledge of GEO tools plus the AthenaHQ connector's
   tool list (brand kit, competitors, prompt discovery, site health, source tags, creators, outreach, API keys).

## Decided for you (review when convenient)

- **All services go on your personal accounts** (personal email, new personal orgs). No Explorium accounts, connectors or branding. Claude is the only exception.

- Name "GEO Engine" → subdomain `beacon-geo.vercel.app`.
- Vercel Hobby is non-commercial. Upgrade to Pro before paying clients use it.
- Our agency email address for the "give our email access" option: placeholder `geo-ops@<yourdomain>`. Tell me the real one.
- Anchor Browser / agentic signups: not used. Signups need your email verification and payment details, so a one-time manual
  setup (table above) is safer than storing your logins in a third-party browser.
- "Coach lane" was read as a rolling memory file: `docs/COACH.md`.

## Found during the build
(agents append below)

- **Infisical identities (finance):** the free tier caps us at 5 machine identities (projects are unlimited). Design: a fixed identity set
  (app-writer + one per worker type) added to each client project with a project role. Expect Pro (~$18–23 per identity per month) at launch.

### Product agent (onboarding spec) — open questions
- Real agency email for `{{AGENCY_EMAIL}}` (placeholder geo-ops@<yourdomain>), GitHub login for `{{AGENCY_GITHUB_USER}}`, AWS principal ARN for the cross-account role, and our Google Ads manager (MCC) ID plus a developer token (apply for Basic access; approval takes days). The wizard can't go live without these.
- RESOLVED: Google Indexing API dropped. Replaced by sitemap refresh + IndexNow; browser-agent "Request indexing" is a design only (docs/research/gsc-request-indexing.md).
- Bing: confirm "Administrator" is the intended Owner-equivalent; verify current Bing Webmaster UI path with a real login (could not confirm online).
- Peec.ai and Profound API endpoints for the key test are unverified; need a trial account each. Also Cloudflare AI Crawl Control REST path.
- Domain-user access mode stores a password and TOTP secret in the vault. Accept the risk, or restrict to agency-email mode only? (Security agent should review.)
- Step 4 (GitHub) has no skip logic in the config. Should the UI skip it automatically for non-Git CMS clients?
- Wix, Framer, HubSpot, Shopify grant steps need a real-account walkthrough before launch.
- **Engine budget (research):** realistic engine cost is about $95 per client per month (100 prompts), ~$1.9k at 20 clients, not $50–200 total.
  Default: 100 prompts per client with the cadence above. Lever: 50 prompts → about $47 per client.
- **DataForSEO "LLM Scraper"** scrapes the ChatGPT/Gemini consumer UIs, so I EXCLUDED it per your API-only choice. Tell me if you want it as a "UI parity" add-on.
- **Engine models:** the research names gpt-5.4-mini and Claude Haiku 4.5. Backend will use the cheapest current search-capable model per vendor
  (Claude Haiku 5.5) and verify the [V?] items with live calls once API keys + network access exist.

### Security agent: decisions needed (details in docs/architecture/security.md)
- **Infisical Pro before the first real client credential.** Audit logs are Pro+ only (not Free). The design uses
  3 machine identities + 1–2 humans (4–5 identities; Free caps at 5 incl. humans). Recommend Pro from the first paying client,
  about 5 × $18–23/mo (verify on infisical.com/pricing). OK?
- **Accept the shared-worker residual risk.** One `beacon-worker` identity can read all clients' machine credentials. Our
  broker enforces per-org scoping, with dual audit and alerts. Per-client identities cost ~+$20/client/mo. Accept for launch, and upgrade
  per client only if a contract demands hard isolation?
- **Org creation: invite-only at launch.** An Infisical project is created only after email verification **and** (Stripe
  checkout complete **or** platform-admin approval). Do you want open self-serve signup at all?
- **Staff visibility to clients.** Staff never appear in member lists. Staff *writes* show in the client audit as "Agency team"
  (no name). Staff *reads* (view-as) are logged only in our internal log. Your client contract/DPA should state that agency
  staff may access account data for support. Do you want the client to see "Agency team viewed your account" entries instead?
- **Domain-user access mode (product agent's question).** Allowed, but agency-email access is the default. Client passwords and
  TOTP seeds go in a separate `beacon-<slug>-logins` Infisical project with no machine identity, so agents never use them. OK?
- **Infisical region.** DECIDED: US cloud (app.infisical.com). EU is not configured; the egress allowlist only permits app.infisical.com.
- **Needed from you for the delegated-access design:** an AWS account for our cross-account role principal (no stored client AWS
  keys), a GitHub App and Slack app registered under the agency, and a separate registrable domain for user content (or accept
  `beacon-geo-usercontent.vercel.app` for now).
- **Vercel OIDC → Infisical OIDC auth** removes static Infisical secrets. Verify Vercel OIDC federation is available on the plan we
  use (team vs Hobby). Fallback: Universal Auth client secrets in Vercel Sensitive env vars.
- **Network allowlist.** Add `infisical.com` and `supabase.com` (docs/pricing) so agents can verify vendor facts directly. This
  wave read their docs via GitHub instead.
- **For the backend agent (no user action):** integrate `supabase/policies_reference.sql`. It is tested on a local Postgres 16 with a
  Supabase stub; cross-tenant, viewer, staff aal1/aal2/grant and MFA cases all behave. The draft `public.is_platform_admin()`
  grants every staff session silent all-tenant access without MFA, and `public.client_visible_actor()` is RPC-callable (reveals
  staff). See security.md §3.4.
- **No credentials or vendor network yet:** no tokens set, and api.vercel.com, api.supabase.com, app.infisical.com and api.stripe.com are all unreachable from the session. Everything is built and tested against a local Postgres. `scripts/provision.sh` deploys once the tokens and network allowlist exist.

### Backend agent (2026-11-25)
- **Done:** `policies_reference.sql` is integrated into the migrations (helpers in `private`, no staff bypass, aal2 + per-org grants, MFA restrictive policies, `secret_refs` server-write only, anon revoked everywhere). Verified by `supabase/tests/local/rls_smoke.sql` (all cases pass on PG16).
- **Supabase CLI v3 writes `supabase/config.jsonc`, not `config.toml`.** Kept as generated (project_id `beacon-geo`, buckets `brand-assets` + `untrusted-html`).
- **`supabase db start` can't run here:** Docker works, but the image pulls are blocked (ECR/GHCR blob hosts refused by the proxy, Docker Hub 429). Local validation uses PG16 + `supabase/dev/compat.sql` instead. Re-run `supabase db reset` once Docker pulls work, to catch Supabase-only differences (PG17, real `auth`/`storage` schemas).
- **Domain-user passwords/TOTP can't go through the wizard.** Security wants them in a `-logins` project with no machine identity, so the app-writer can't store them either. The intake route rejects `access_method` secrets with `human_only_secret`. Decide: staff enter them in Infisical by hand (current), or allow the app-writer write-only on `-logins`.
- **Frontend contract changes:** secret intake is now `POST /api/onboarding/:orgId/secrets` with header `x-beacon-intake: 1` and body `{ jwe: string[] }` (keys from `GET /api/intake/key`); responses never include `last4`. Tests: `POST /api/onboarding/:orgId/test/:stepId` (alias `/tests` with `{stepId}`); results are `{status: pass|partial|fail|not_configured, checks:[{id,label,ok,detail}], missing}`. Progress: `GET/PUT /api/onboarding/:orgId/progress`. Clients can only set `not_started|in_progress`; `complete`/`needs_attention` come from live tests or staff act-as.
- **Unverified vendor endpoints (no network to check):** Infisical identity-membership and environment-delete REST paths used in provisioning (`/api/v2/workspace/{id}/identity-memberships/{identityId}`, `/api/v1/workspace/{id}/environments/{envId}`); Bing `GetSiteRoles` role encoding; Cloudflare AI Crawl Control path (not implemented, reported in `missing`); Google Ads API version is required as `GOOGLE_ADS_API_VERSION`. Each failure is reported as a failed step, never as success.
- **Automated CMS draft test exists only for WordPress, Ghost and Sanity.** Webflow, Contentful, HubSpot, Shopify and Wix test auth only and list the draft check under `missing`. Framer/other are manual.
- **Rate limits are per-instance (in memory).** Add a Vercel Firewall rule for `/api/onboarding/*/secrets` (20/min/user) and `/test` (10/min/org) before launch. JWE nonce replay protection is also per instance; the 5-minute expiry bounds it.
- **Supabase pooler role:** `withRls` runs `set local role authenticated` over `DATABASE_URL`. Verify on the real project that the pooler user can assume `authenticated` (true for `postgres` on Supabase as far as I know; check on first deploy).
- **`metrics_daily` is a materialized view.** Schedule `public.refresh_metrics()` hourly with pg_cron (runbook step 6). The topic filter doesn't apply to Overview KPIs (they come from the MV); the per-tab live queries do honor it.

### Engines pipeline (Engines agent)
- **Engines: no live vendor calls yet.** No API keys in this session, and api.openai.com, api.perplexity.ai, api.dataforseo.com and
  api.cloudflare.com are blocked by the session network (Anthropic and Google hosts resolve). Adapter parsers are tested on
  **synthetic** fixtures built from the SDK types and the methodology doc (`web/src/lib/engines/__tests__/fixtures.ts`). First job with
  keys: run each adapter once and replace the fixtures with recorded responses, and confirm the [V?] items in methodology section 9.
- **Engines: Perplexity endpoint.** We POST `/v1/agent` via the official SDK transport (`@perplexity-ai/perplexity_ai` 0.44), with
  `effort` (default `low`; `preset` is deprecated in the SDK types) and `web_search` (`search_type: fast`). Cost comes from the
  API's `usage.cost.total_cost`. Verify on the first live call.
- **Engines: Claude model.** Default is the cheapest current model, `claude-haiku-5-5` ($0.10/$0.50 per M tokens, plus $10 per 1k
  searches) with `web_search_20250305`. The `_20260209` tool version is documented only for Sonnet/Opus-class models. Override with
  `ANTHROPIC_ENGINE_MODEL` / `ANTHROPIC_WEB_SEARCH_TOOL` for a calibration slice.
- **Engines: model defaults are config.** `gpt-5.4-mini` (the OpenAI SDK also lists newer gpt-5.6 models; we stay on the methodology's
  choice until a calibration run), `gemini-3.8-flash` (its $0.75/$3.75 price is [V?]), `claude-haiku-5-5`. Each run stores the model
  string the API actually returned. Env overrides: `OPENAI_ENGINE_MODEL`, `GEMINI_ENGINE_MODEL`, `PERPLEXITY_EFFORT`/`PERPLEXITY_ENGINE_MODEL`.
- **Engines: Vercel Hobby cron limits.** `web/vercel.json` schedules enqueue daily (02:00 UTC), the worker every 5 minutes, and
  crawlers hourly. Hobby only allows daily crons, so the worker and crawler schedules need **Vercel Pro**. Until then, trigger
  `/api/cron/worker` from Supabase pg_cron + pg_net or any external scheduler, using `Authorization: Bearer $CRON_SECRET`.
- **Engines: secrets broker not wired.** Crawler ingestion reads the Cloudflare token by reference (step `cdn_crawlers`, field
  `cf_api_token`) through `SecretBroker` (`web/src/lib/engines/crawlers/broker.ts`). Until the backend's
  `lib/server/secrets/broker.ts` calls `registerSecretBroker()`, every org reports `not_configured` and nothing is fetched.
  The zone name comes from `onboarding_progress(step_id='cdn_crawlers').data->>'cf_zone_name'`. Note: the onboarding
  migration comment says step id `cloudflare` while the config uses `cdn_crawlers`; the poll accepts both.
- **Engines: egress.** `lib/engines/http.ts` holds the engine/Cloudflare host allowlist (https only, no auto-redirects). When
  the platform `safeFetch` lands, it should delegate to it. The Gemini SDK gets the same allowlisted fetch via `httpOptions.fetch`.
- **Engines: schema additions** (`supabase/migrations/20261125000100_engines_pipeline.sql`, additive): prompts.tier/importance/branded/
  location_code; brands/competitors.extra_domains/negative_aliases/context_terms; scheduling + idempotency columns on prompt_runs
  (unique `(prompt_id, engine_id, run_date, run_index, trigger)`); usage/score columns on responses; audit columns on mentions/citations;
  new tables `source_domains`, `entity_candidates` (emerging competitors) and `pipeline_state`. DB enums are coarser than the method:
  sentiment `mixed` is stored as `neutral` (the score keeps the nuance), and fine source categories go in `citations.category`, mapped
  onto `source_type`. UI agents: `entity_candidates` is new data for an "emerging competitors" list.
- **Engines: budget guard.** The default is $150 per org per month (`ENGINE_MONTHLY_BUDGET_USD`, or override per org with
  `organizations.settings.engine_budget_usd`). LLM engines pause at 100%, and enqueue reports `warning` at 80%. No alerting channel
  exists yet. Manual runs bypass the guard.
- **Engines: DataForSEO mode.** Scheduled runs default to the Standard queue (`task_post` + `task_get`, polled by the worker).
  Set `DATAFORSEO_MODE=live` to make every run synchronous (simpler, about 3x the price). Manual runs always use live.
  No pingback endpoint yet; the worker polls instead.
- **Engines: metrics view.** `analytics.org_engine_daily` (metrics migration) still computes visibility as the % of runs that
  mention the brand. The methodology score (`responses.visibility_score`, the per-observation score_o) and the CI helpers in
  `lib/analysis/scoring.ts` are ready for the dashboards, but no rollup uses them yet. Backend/UI should decide which number is the headline.
- **Agency plan price:** Billing set it to $2,499 a month (annual = 10× monthly). Change it if you want.

- **Decisions 2026-11-25.** Secrets: stay on Infisical Free at launch (see security.md D5, costs.md). Stripe dormant behind `BILLING_ENABLED=false`; org creation is platform-admin approval only. Perplexity off by default (adapter kept, needs `PERPLEXITY_API_KEY`). Unsplash removed. GitHub/Slack access is granted by the client at onboarding. Anthropic: the existing company Anthropic account may be used (the Claude exception).
