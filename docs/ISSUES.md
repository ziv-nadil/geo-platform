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
