# Beacon GEO: access checklist

Owner: Access agent. Last updated 2026-11-25. Sources: `docs/ISSUES.md`, `docs/ops/costs.md`, `docs/architecture/security.md`
(branch `claude/zealous-hamilton-nlkizt`).

> **PERSONAL ACCOUNTS ONLY.** Do not use any Explorium company account, workspace, org or connector for Beacon GEO (Claude itself is the only exception).
> Create every service below with your **personal email**, not your work email, and make a **new personal org/team** in each. The GitHub repo is already under your personal account (`ziv-nadil`).

**Rules.** Never paste a token, key or password into chat. Add each one in the cloud environment settings
(session title bar → environment menu → **Edit**): under **Network secrets** (labelled "API credentials" in older apps) where offered,
otherwise as an **environment variable**. Env vars and secrets reach **new sessions only**, so after adding, a fresh session is needed to verify.
The Anthropic API key can only go in a plain environment variable (Network secrets cannot cover Anthropic's hosts), where every user of the
environment can read it. Your call.
Network hosts: set Network access to **Full**, or **Limited/Custom** with the hosts below under Allowed domains (keep "Allow package managers" ticked).

Status key: `todo` · `added` (you say it's in) · `verified` (read-only call succeeded, value never printed).

2026-11-25: Network access is **Full**; all hosts below are reachable. The allowlist section is only needed if you switch back to Limited.

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
| 3 | **Infisical Cloud** | Vault for client credentials (security design D1-D10) | Free (5 identities); Pro before first real client credential | Use your personal email (not work) and a new personal org: app.infisical.com → sign up (US region unless an EU client needs EU) → create org "Beacon GEO". Organization → Access Control → Machine Identities → Create, Universal Auth, org role Admin (needed for project creation) → Add Client Secret. Copy Client ID and Secret straight into the environment settings | `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET` | `app.infisical.com`, `infisical.com` | `POST https://app.infisical.com/api/v1/auth/universal-auth/login` then `GET /api/v2/workspace` | todo. **Decision (lead): stay on Infisical Free at launch; upgrade to Pro at first paying client.** Needs 1 org + 3 machine identities (`beacon-provisioner`, `beacon-app-writer`, `beacon-worker`), fits under the 5-identity cap. AWS Secrets Manager is the documented fallback |
| 5 | **Google OAuth** | Staff/client SSO; GSC and GA4 checks | Free | Use your personal email (not work) and a new personal org: console.cloud.google.com → new project `beacon-geo` → APIs & Services → OAuth consent screen (External, testing, add yourself as test user) → Credentials → Create OAuth client ID (Web). Redirect URIs: `https://beacon-geo.vercel.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`. Enable APIs: Search Console, Analytics Data, Analytics Admin, YouTube Data | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `oauth2.googleapis.com`, `www.googleapis.com`, `searchconsole.googleapis.com` | Client id/secret cannot be read-tested alone: POST `oauth2.googleapis.com/token` with a bogus code and expect `invalid_grant` (not `invalid_client`) | todo |
| 6 | **OpenAI** (ChatGPT engine) | Engine monitoring | Pay-as-you-go, set a $20 monthly limit | Use your personal email (not work) and a new personal org: platform.openai.com → API keys → Create (project key, restricted to Responses + Models) | `OPENAI_API_KEY` | `api.openai.com` | `GET /v1/models` | todo |
| 8 | **Gemini** | Engine monitoring | Free tier, 5,000 grounded requests per month | Use your personal email (not work) and a new personal org: aistudio.google.com → Get API key | `GEMINI_API_KEY` | `generativelanguage.googleapis.com` | `GET /v1beta/models` | todo |
| 9 | **Anthropic** (Claude engine) | Engine monitoring | User decision: use the existing Explorium Anthropic account for now (the one allowed Explorium exception, Claude itself) | Use your personal email (not work) and a new personal org: console.anthropic.com → API keys → Create. **Environment variable only** (visible to everyone using the environment) | `ANTHROPIC_API_KEY` | `api.anthropic.com` | `GET /v1/models` | todo |
| 10 | **DataForSEO** | Google AI Overviews / AI Mode data | Pay-as-you-go, $50 minimum | Use your personal email (not work) and a new personal org: dataforseo.com → sign up → Dashboard → API Access → API login + password (not the website password) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | `api.dataforseo.com` | `GET /v3/appendix/user_data` | todo (optional; user asking about alternatives, can defer Google AIO/AI Mode) |
| 14 | **Your computer via Remote Control** | AthenaHQ UI teardown while logged in | n/a | Claude desktop app → Settings → Claude Code → Remote Control → share a folder, or run `claude remote-control` in a terminal in that folder. Then tell the lead session | n/a | n/a | `list_computer_folders` shows it online | todo |
| 15 | **Bria** (image generation) | Marketing and content imagery | Your existing personal Bria account | Use your personal Bria account (not work). Open the Bria console/dashboard and copy your API token. Add it in the environment settings, never in chat | `BRIA_API_KEY` | `engine.prod.bria-api.com` (**unverified**: from memory, docs.bria.ai was unreachable from this session; confirm in Bria's API docs) | a cheap read call per Bria docs (auth header `api_token`); confirm endpoint once docs are reachable | **BLOCKED 2026-11-25**: `engine.prod.bria-api.com` is the confirmed API host (docs, header `api_token`) but is proxy-403; the saved secret is for `bria.ai` (wrong host). Add `engine.prod.bria-api.com` to Allowed domains and re-save the secret for that host |
| 16 | **Google PageSpeed Insights** (optional) | Site speed checks for audits | Free GCP API key | In your personal GCP project `beacon-geo` (same as row 5): APIs & Services → Library → enable PageSpeed Insights API → Credentials → Create API key → restrict to that API | `PAGESPEED_API_KEY` | `pagespeedonline.googleapis.com` | `GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&key=<key>` | todo (optional) |
| 18 | **Anchor Browser** (hosted browser the Access agent drives for signups) | Lets the agent navigate Supabase, Vercel, Google, OpenAI, Gemini while you sign in via live view | Existing personal account | User saved a Network secret for host `anchorbrowser.io` (user approved using Anchor for these sign-ins, 2026-11-25). Secret is attached by the proxy, never visible to Claude. Keys created are shown in the browser; user copies them into environment settings | Network secret (no env var) | `anchorbrowser.io`; **API host likely `api.anchorbrowser.io`, unverified, may need its own secret entry** | create a session via the Anchor API from a fresh session | **BLOCKED 2026-11-25**: `anchorbrowser.io` returns 200 (homepage only); API host `api.anchorbrowser.io` returns proxy 403 (not in allowlist). Add `api.anchorbrowser.io` to Allowed domains and save a Network secret for it (header `anchor-api-key`); then fresh session |

## Removed by user decision (2026-11-25)

- Stripe: billing is handled outside the platform. Org-creation gating must use platform-admin approval only (lead to update security design D-gating).
- Perplexity: removed for now (user decision).
- Cloudflare: client grants access during onboarding; no agency account needed.
- GitHub App: client grants access during onboarding. (security.md assumed an agency-registered app; lead to reconcile.)
- Slack app: client grants access during onboarding. (same note as GitHub.)
- Unsplash: not needed, Bria covers imagery.

## Browser-assisted steps (Supabase, Vercel, Google OAuth, OpenAI, Gemini, PageSpeed, Anthropic)

User asked the Access agent to drive a browser on their computer while they sign in. Needs Remote Control with a shared folder and a browser tool in the session. As of 2026-11-25 no folder is shared and no browser tool is available, so these remain manual. Keys created in a browser still have to be entered by the user into the environment settings.

## Other items from ISSUES.md needing you (not tokens)

- AWS account (principal ARN for the cross-account role), a registrable domain for user content, the real agency email, agency GitHub login.
- Google Ads manager (MCC) ID and developer token (apply for Basic access, takes days).
- Peec.ai and Profound trial accounts (API endpoint checks).
- Decide: Infisical region (US vs EU), Infisical Pro timing.

## Change log

- 2026-11-24: initial checklist. All rows `todo`.
- 2026-11-24: added personal-accounts-only rule (lead instruction); every signup step says so.
- 2026-11-25: added Bria, PageSpeed Insights (optional), Unsplash (optional) at lead's request. Bria host unverified.
- 2026-11-25: user decisions: removed Stripe, Perplexity, Cloudflare, GitHub App, Slack, Unsplash; Infisical under review; Anthropic via Explorium account; Bria key in env settings.
- 2026-11-25: Infisical decision: Free tier, 1 org + 3 machine identities; Pro at first paying client (lead). Bria verification is being done by a separate "Bria test" session.
- 2026-11-25: Anchor Browser network secret saved by user (row 18); Remote Control folder sharing not offered in user's app (only a "Connect new sessions" toggle), so Anchor is the browser path.
- 2026-11-25: Access agent verification: api.anchorbrowser.io 403 (blocked), anchorbrowser.io 200 (site only, no API), engine.prod.bria-api.com 403 (blocked), bria.ai 200. Secrets need correct hosts.
- 2026-11-25 (new session): re-verified, unchanged. Proxy still refuses CONNECT to `api.anchorbrowser.io`, `engine.prod.bria-api.com`, and every vendor API host (Supabase, Vercel, Infisical, OpenAI, DataForSEO). Only `anchorbrowser.io`, `bria.ai` (websites) and Google hosts respond. No vendor env vars present. Network allowlist and secret hosts have not been updated yet.
- 2026-11-25: user switched Network access to **Full**. All vendor API hosts now reachable (unauthenticated 401s as expected). Anchor (`api.anchorbrowser.io`) and Bria (`engine.prod.bria-api.com`) return 401 missing credentials: the saved Network secrets are bound to `anchorbrowser.io` / `bria.ai` and are not injected on the API hosts. Rows 15 and 18 now blocked only on re-saving the secrets for the API hosts.
- 2026-11-25: user re-saved secrets. A fresh session confirms the proxy now lists `api.anchorbrowser.io` and `engine.prod.bria-api.com`, but both still 401 (Bria: `missing_credentials`, i.e. `api_token` header absent). Likely wrong header name in the secret (must be `anchor-api-key` / `api_token`, not `Authorization`) or wrong key value.

## Handoff for the next Access session (read this first)

**Role.** Access agent for Beacon GEO. Only tells the user which accounts/tokens/hosts to set up and verifies them. No app code, no product questions.
**Lead session to report to:** `session_01AWqBEXskyXE3wo3zzPAFSx` (send one line per service with `mcp__claude-code-remote__send_message` after each status change). Work on branch `claude/access-checklist`; fetch `claude/zealous-hamilton-nlkizt` each round.

**Hard rules.** Never ask for tokens in chat; they go in environment settings (Network secrets, or env vars). Print only pass/fail, never values. Personal accounts only, no Explorium accounts (exception: Claude/Anthropic key, user approved using the Explorium Anthropic account for now). Commit ACCESS.md changes and push.

**Decisions made (2026-11-25).** Removed: Stripe, Perplexity, Cloudflare, GitHub App, Slack, Unsplash. Infisical stays, Free tier, 1 org + 3 machine identities. DataForSEO optional/deferrable. Anchor Browser approved by the user for driving signups (user signs in via live view; agent creates tokens; user copies them into settings).

**Open tasks, in order.**
1. Verify the network secrets for `anchorbrowser.io` and `bria.ai` (try `api.anchorbrowser.io`; confirm Bria's API host; may need extra secret entries). A "Bria test" session is also verifying `BRIA_API_KEY`.
2. With Anchor: Supabase (token + project ref), Vercel (token), Infisical (org + machine identity), Google OAuth client (+ PageSpeed key), OpenAI key, Gemini key, Anthropic key (env var only), optional DataForSEO.
3. After each: user adds the secret to settings; a NEW session verifies with a read-only call; update status here, push, message the lead.

**What does not carry over.** Chat history, subagents (none were running), task list (none open), and any secret added after a session starts (new sessions only). Everything needed is in this file.
