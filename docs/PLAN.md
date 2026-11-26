# GEO Engine — Master Plan

Working name: **GEO Engine**. It's a placeholder and easy to rename.
Goal: an agency platform to onboard GEO (Generative Engine Optimization) clients, then
monitor and improve their visibility in AI engines (ChatGPT, Perplexity, Gemini, Claude,
Google AI Overviews / AI Mode). The scope is AthenaHQ's feature set with a cleaner light-mode design.

Scale target: about 20 client accounts with about 5 users each. Free or low-cost tiers first.

## Decisions (made; revisit in docs/ISSUES.md if needed)

| Area | Decision | Why |
|---|---|---|
| App | Next.js (App Router, TS, Tailwind v4) in `/web` | Vercel-native, one codebase for UI + API routes |
| Hosting | Vercel Hobby → `beacon-geo.vercel.app` | Free subdomain, preview deploys. Move to Pro ($20/mo) before charging clients, because Hobby is non-commercial |
| DB / Auth / Storage | Supabase (Postgres + RLS, Auth, Storage) | Agent-friendly API/CLI/MCP, generous free tier, SSO (Google, Microsoft/Azure, SAML on Pro) |
| Multi-tenancy | `organizations` (= client accounts) + `memberships` with roles; RLS on every table; platform staff live in `platform_admins`, **never** in a client's member list | Super admin sees all accounts and stays invisible to clients |
| Secrets | **Infisical Cloud**: one project per client, envs `prod`, a machine identity per worker scoped to one project, audit logs | Per-client isolation, E2E encryption, MCP/CLI for agents, free tier |
| Billing | Stripe Checkout + Customer Portal + webhooks → `subscriptions` table | Standard, low effort |
| AI engine data | Direct APIs (OpenAI Responses + web_search, Perplexity **Agent API** (Sonar chat-completions retired 2026-09-27), Gemini + Google Search grounding, Anthropic + web_search) + **DataForSEO** for Google AI Overviews / AI Mode. Cadence: AIO/AI Mode daily; LLM engines weekly (top 25 prompts × 3 runs, rest × 1) | Compliant and stable. **About $95 per client per month (~$1.9k for 20 clients)**, see docs/research/ai-engine-methodology.md |
| Jobs / scheduling | Vercel Cron → API route that enqueues; worker on Supabase Edge Functions / pg_cron (later: Inngest free tier if needed) | No extra infra |
| AthenaHQ teardown | AthenaHQ MCP connector + public site/docs now; pixel-level UI pass once your computer is connected | Cloud session can't reach your browser |

## Layer 1 — Onboarding (per client)

A wizard with a progress bar. Each step has: **what we need → how to grant it
(step-by-step) → "Test connection" (live validation) → status (✅ working / ⚠️ partial: missing X / ❌ failed)**.
Secrets typed into the wizard go straight to Infisical (client project). Only
references are stored in Postgres.

Steps: 1. Company info & assets · 2. Brand book · 3. Access method (our email vs a user in
their domain) · 4. GitHub (blog) · 5. CMS · 6. GSC (Owner) · 7. Bing Webmaster (Owner) ·
8. GA4 + key event · 9. Google Cloud (YouTube Data, Keyword Planner/Ads; indexing is via sitemap refresh + IndexNow, see docs/research/gsc-request-indexing.md) ·
10. DNS verification (TXT) · 11. GEO/ASO analytics (Peec, Ahrefs, Similarweb, Profound,
AthenaHQ, …) · 12. AWS (S3 + CloudFront) or similar · 13. Cloudflare (AI crawler monitoring) ·
14. Slack admin (bots) · 15. Review & submit.
Detailed spec: `docs/product/onboarding-spec.md`.

## Layer 2 — Dashboard (AthenaHQ parity, better design)

Full tab inventory in `docs/research/athenahq-teardown.md`. It includes: Overview/visibility score,
Prompts (tracked prompts, topics, prompt discovery), Competitors / share of voice, Citations &
Sources (source tags), Response explorer per engine, Sentiment, Site Health (crawl audit),
AI crawler analytics, Content/Action center (brand kit, generation), Creators (YouTube/TikTok),
Outreach, Reports, Settings (members, SSO, API keys, billing), Super-admin console.
Every metric gets a tooltip.

## Agents (sub-sessions reporting to the lead)

| Agent | Model / effort | Goal | Output |
|---|---|---|---|
| Researcher-Athena | sonnet / high | Full AthenaHQ feature & data-model teardown | `docs/research/athenahq-teardown.md` |
| Researcher-Engines | sonnet / high | How to measure visibility in each AI engine: APIs, costs, metrics formulas | `docs/research/ai-engine-methodology.md` |
| Product (onboarding) | sonnet / medium | Per-integration grant instructions, required scopes, validation tests | `docs/product/onboarding-spec.md` + `web/src/config/onboarding.ts` |
| Security | opus / high | Infisical design, RLS, super-admin invisibility, threat model | `docs/architecture/security.md` |
| Backend | opus / high | Supabase schema, RLS, migrations, seed, integration testers | `supabase/`, `web/src/lib/server/` |
| Frontend + Design | opus / high | Design system, app shell, auth, onboarding wizard, dashboard tabs | `web/src/app`, `web/src/components` |
| Finance/Ops | haiku / low | Cost model, free-tier limits, upgrade triggers | `docs/ops/costs.md` |
| QA (wave 2) | sonnet / medium | Build, lint, e2e smoke via Playwright, report bugs | `docs/ops/qa-report.md` |
| Security review (wave 2) | opus / high | Review RLS + secret flows in code | appended to `docs/architecture/security.md` |

Every agent checks for installable skills relevant to its role (SearchSkills / ListSkills)
and records what it found in its output doc.

## Memory ("coach lane")
`docs/COACH.md` is the rolling memory of the main conversation: decisions, state and next steps.
The lead updates it after each wave, so any fresh or compacted session can resume from it.

## Open items for you
See `docs/ISSUES.md`.
