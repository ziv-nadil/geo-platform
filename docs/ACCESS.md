# GEO Engine: access checklist

Owner: Access agent. Last updated 2026-11-24. Sources: `docs/ISSUES.md`, `docs/ops/costs.md`, `docs/architecture/security.md`
(branch `claude/zealous-hamilton-nlkizt`).

> **PERSONAL ACCOUNTS ONLY.** Do not use any Explorium company account, workspace, org or connector for GEO Engine (Claude itself is the only exception).
> Create every service below with your **personal email**, not your work email, and make a **new personal org/team** in each. The GitHub repo is already under your personal account (`ziv-nadil`).

**Rules.** Never paste a token, key or password into chat. Add each one in the cloud environment settings
(session title bar → environment menu → **Edit**): under **Network secrets** (labelled "API credentials" in older apps) where offered,
otherwise as an **environment variable**. Env vars and secrets reach **new sessions only**, so after adding, a fresh session is needed to verify.
The Anthropic API key can only go in a plain environment variable (Network secrets cannot cover Anthropic's hosts), where every user of the
environment can read it. Your call.
Network hosts: set Network access to **Full**, or **Limited/Custom** with the hosts below under Allowed domains (keep "Allow package managers" ticked).

Status key: `todo` · `added` (you say it's in) · `verified` (read-only call succeeded, value never printed).

Verified from this session on 2026-11-24: none of the vendor hosts below are reachable yet (only `api.github.com` and `generativelanguage.googleapis.com` respond), and no vendor env vars are present.

## Network allowlist (do once, unblocks everything)

`api.vercel.com`, `vercel.com`, `api.supabase.com`, `*.supabase.co`, `supabase.com`, `app.infisical.com`, `infisical.com`, `api.stripe.com`,
`api.openai.com`, `api.perplexity.ai`, `generativelanguage.googleapis.com`, `api.dataforseo.com`, `oauth2.googleapis.com`,
`www.googleapis.com`, `searchconsole.googleapis.com`, `api.cloudflare.com`, `engine.prod.bria-api.com`, `pagespeedonline.googleapis.com`, `api.unsplash.com`, `slack.com`, `api.slack.com`, `api.github.com`.
`api.anthropic.com` is already routed by the harness; no entry needed.

## Checklist (ordered by what it unblocks)

| # | Service | Why | Plan | Steps | Env var(s) | Host(s) | Verify call (read-only) | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | **Supabase** | Postgres, auth, RLS; blocks backend and all data work | Free now; Pro ($25/mo) before prod | Use your personal email (not work) and a new personal org: supabase.com → sign up → New organization → New project `beacon-geo` (save DB password in your own manager). Account → Access Tokens → Generate new token. Project ref = the id in `https://<ref>.supabase.co` or Project Settings → General | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | `api.supabase.com`, `*.supabase.co` | `GET https://api.supabase.com/v1/projects` | todo |
| 2 | **Vercel** | Hosting and deploys of the web app | Hobby (free, non-commercial); Pro ($20/mo) before paying clients | Use your personal email (not work) and a new personal org: vercel.com → sign up → Account Settings → Tokens → Create (scope: your account, expiry 90 days) | `VERCEL_TOKEN` | `api.vercel.com` | `GET https://api.vercel.com/v2/user` | todo |
| 3 | **Infisical Cloud** | Vault for client credentials (security design D1-D10) | Free at launch (3 machine identities); Pro at first paying client or >5 identities | Use your personal email (not work) and a new personal org: app.infisical.com → sign up (US region unless an EU client needs EU) → create org "GEO Engine". Organization → Access Control → Machine Identities → Create, Universal Auth, org role Admin (needed for project creation) → Add Client Secret. Copy Client ID and Secret straight into the environment settings | `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET` | `app.infisical.com`, `infisical.com` | `POST https://app.infisical.com/api/v1/auth/universal-auth/login` then `GET /api/v2/workspace` | todo. **Decision (lead): stay on Infisical Free at launch; upgrade to Pro at first paying client.** Needs 1 org + 3 machine identities (`beacon-provisioner`, `beacon-app-writer`, `beacon-worker`), fits under the 5-identity cap. AWS Secrets Manager is the documented fallback |
| 5 | **Google OAuth** | Staff/client SSO; GSC and GA4 checks | Free | Use your personal email (not work) and a new personal org: console.cloud.google.com → new project `beacon-geo` → APIs & Services → OAuth consent screen (External, testing, add yourself as test user) → Credentials → Create OAuth client ID (Web). Redirect URIs: `https://beacon-geo.vercel.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`. Enable APIs: Search Console, Analytics Data, Analytics Admin, YouTube Data | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `oauth2.googleapis.com`, `www.googleapis.com`, `searchconsole.googleapis.com` | Client id/secret cannot be read-tested alone: POST `oauth2.googleapis.com/token` with a bogus code and expect `invalid_grant` (not `invalid_client`) | todo |
| 6 | **OpenAI** (ChatGPT engine) | Engine monitoring | Pay-as-you-go, set a $20 monthly limit | Use your personal email (not work) and a new personal org: platform.openai.com → API keys → Create (project key, restricted to Responses + Models) | `OPENAI_API_KEY` | `api.openai.com` | `GET /v1/models` | todo |
| 8 | **Gemini** | Engine monitoring | Free tier, 5,000 grounded requests per month | Use your personal email (not work) and a new personal org: aistudio.google.com → Get API key | `GEMINI_API_KEY` | `generativelanguage.googleapis.com` | `GET /v1beta/models` | todo |
| 9 | **Anthropic** (Claude engine) | Engine monitoring | User decision: use the existing Explorium Anthropic account for now (the one allowed Explorium exception, Claude itself) | Use your personal email (not work) and a new personal org: console.anthropic.com → API keys → Create. **Environment variable only** (visible to everyone using the environment) | `ANTHROPIC_API_KEY` | `api.anthropic.com` | `GET /v1/models` | todo |
| 10 | **DataForSEO** | Google AI Overviews / AI Mode data | Pay-as-you-go, $50 minimum | Use your personal email (not work) and a new personal org: dataforseo.com → sign up → Dashboard → API Access → API login + password (not the website password) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | `api.dataforseo.com` | `GET /v3/appendix/user_data` | todo (optional; user asking about alternatives, can defer Google AIO/AI Mode) |
| 14 | **Your computer via Remote Control** | AthenaHQ UI teardown while logged in | n/a | Claude desktop app → Settings → Claude Code → Remote Control → share a folder, or run `claude remote-control` in a terminal in that folder. Then tell the lead session | n/a | n/a | `list_computer_folders` shows it online | todo |
| 15 | **Bria** (image generation) | Marketing and content imagery | Your existing personal Bria account | Use your personal Bria account (not work). Open the Bria console/dashboard and copy your API token. Add it in the environment settings, never in chat | `BRIA_API_KEY` | `engine.prod.bria-api.com` (**unverified**: from memory, docs.bria.ai was unreachable from this session; confirm in Bria's API docs) | a cheap read call per Bria docs (auth header `api_token`); confirm endpoint once docs are reachable | **key already in env settings per user**; needs a fresh session to verify |
| 16 | **Google PageSpeed Insights** (optional) | Site speed checks for audits | Free GCP API key | In your personal GCP project `beacon-geo` (same as row 5): APIs & Services → Library → enable PageSpeed Insights API → Credentials → Create API key → restrict to that API | `PAGESPEED_API_KEY` | `pagespeedonline.googleapis.com` | `GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&key=<key>` | todo (optional) |

## Removed by user decision (2026-11-25)

- Stripe: billing is handled outside the platform. Org-creation gating must use platform-admin approval only (done: security.md updated; `BILLING_ENABLED=false` keeps Stripe code dormant).
- Perplexity: removed for now (user decision).
- Cloudflare: client grants access during onboarding; no agency account needed.
- GitHub App: client grants access during onboarding. (reconciled: security.md and onboarding text now use client-granted PAT / deploy key / collaborator.)
- Slack app: client grants access during onboarding. (reconciled: client installs their own Slack app, or an incoming webhook.)
- Unsplash: not needed, Bria covers imagery.

## Browser-assisted steps (Supabase, Vercel, Google OAuth, OpenAI, Gemini, PageSpeed, Anthropic)

User asked the Access agent to drive a browser on their computer while they sign in. Needs Remote Control with a shared folder and a browser tool in the session. As of 2026-11-25 no folder is shared and no browser tool is available, so these remain manual. Keys created in a browser still have to be entered by the user into the environment settings.

## Other items from ISSUES.md needing you (not tokens)

- AWS account (principal ARN for the cross-account role), a registrable domain for user content, the real agency email, agency GitHub login.
- Google Ads manager (MCC) ID and developer token (apply for Basic access, takes days).
- Peec.ai and Profound trial accounts (API endpoint checks).
- Infisical region: decided, US cloud. Decide: Infisical Pro timing.

## Change log

- 2026-11-24: initial checklist. All rows `todo`.
- 2026-11-24: added personal-accounts-only rule (lead instruction); every signup step says so.
- 2026-11-25: added Bria, PageSpeed Insights (optional), Unsplash (optional) at lead's request. Bria host unverified.
- 2026-11-25: user decisions: removed Stripe, Perplexity, Cloudflare, GitHub App, Slack, Unsplash; Infisical under review; Anthropic via Explorium account; Bria key in env settings.
- 2026-11-25: Infisical decision: Free tier, 1 org + 3 machine identities; Pro at first paying client (lead). Bria verification is being done by a separate "Bria test" session.
- 2026-11-25 (reconcile): Infisical decision recorded (Free at launch). Anthropic: the existing company Anthropic account may be used (the Claude exception). Stripe dormant behind `BILLING_ENABLED`; Perplexity off by default; Unsplash removed.
