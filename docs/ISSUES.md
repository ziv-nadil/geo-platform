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

- Name "Beacon GEO" → subdomain `beacon-geo.vercel.app`.
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
- Google Indexing API officially supports only JobPosting/BroadcastEvent pages. Keep it in step 9 as best-effort, or drop it?
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
- **Infisical region.** US cloud by default. Any EU clients needing EU data residency? (The EU region is a separate org/URL; decide before
  creating projects.)
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
