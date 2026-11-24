# Overnight backlog (lead pulls in order; each item = one short-named session or subagent)

| # | Item | Agent / model | Depends on | Est. |
|---|---|---|---|---|
| 1 | Backend: real PG dev DB, seed, queries, API routes, provision.sh | in-chat subagent (opus/high) | — | running |
| 2 | Frontend: design system, auth, onboarding wizard, all tabs on real queries | in-chat subagent (opus/high) | 1 | running |
| 3 | Engines: adapters, analysis, cron, crawler ingestion | session "Engines" (opus/high) | — | running |
| 4 | Integrate: merge Engines branch, wire the pipeline into dashboard queries, full build | lead | 1–3 | 30m |
| 5 | QA: Playwright e2e for signup → onboarding → dashboard → admin, on the dev DB | session "QA" (sonnet/medium) | 4 | 1–1.5h |
| 6 | Security review of code (RLS, secret intake, admin view-as, safeFetch) | session "Security review" (opus/high) | 4 | 1h |
| 7 | Fix wave from 5–6 | session "Fixes" (opus/high) | 5,6 | 1h |
| 8 | Design polish: tooltips copy, empty states, a11y audit, screenshots | session "Design polish" (sonnet/medium) | 4 | 1h |
| 9 | Reports + exports (PDF/CSV), weekly email digest, Slack bot notifications | session "Reports" (sonnet/high) | 4 | 1.5h |
| 10 | Billing: Stripe products/plans setup script, portal, seat limits, webhooks tests | session "Billing" (sonnet/high) | 4 | 1h |
| 11 | Prompt discovery: GSC/KW planner/LLM generation by persona × funnel | session "Discovery" (sonnet/high) | 3 | 1h |
| 12 | Marketing site + docs/help center for clients | session "Site" (sonnet/medium) | 8 | 1h |
| 13 | Provision + deploy to Vercel/Supabase/Infisical | lead | tokens + network (Access) | 30m |
| 14 | AthenaHQ visual parity pass | session "Athena UI" | user computer connected + approval | 2h |
