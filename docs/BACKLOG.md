# Overnight backlog (lead pulls in order; each item = one short-named session or subagent)

| # | Item | Agent / model | Depends on | Est. |
|---|---|---|---|---|
| 1 | Backend: real PG dev DB, seed, queries, API routes, provision.sh | in-chat subagent (opus/high) | — | running |
| 2 | Frontend: design system, auth, onboarding wizard, all tabs on real queries | in-chat subagent (opus/high) | 1 | running |
| 3 | Engines: adapters, analysis, cron, crawler ingestion | session "Engines" (opus/high) | — | running |
| 4 | Integrate: merge Engines branch, wire the pipeline into dashboard queries, full build | lead | 1–3 | 30m |
| 5 | QA: Playwright e2e for signup → onboarding → dashboard → admin, on the dev DB | session "QA" (sonnet/medium) | 4 | 1–1.5h |
| 6 | Security review of code (RLS, secret intake, admin view-as, safeFetch) | session "Security review" (opus/high) | 4 | 1h |
| 7 | Fix wave from 5–6 | session "Fixes" (sonnet/medium) | 5,6 | 1h |
| 8 | Design polish: tooltips copy, empty states, a11y audit, screenshots | session "Design polish" (haiku/low) | 4 | 1h |
| 9 | Reports + exports (PDF/CSV), weekly email digest, Slack bot notifications | session "Reports" (sonnet/low) | 4 | 1.5h |
| 10 | Billing: Stripe products/plans setup script, portal, seat limits, webhooks tests | session "Billing" (sonnet/low) | 4 | 1h |
| 11 | Prompt discovery: GSC/KW planner/LLM generation by persona × funnel | session "Discovery" (sonnet/low) | 3 | 1h |
| 12 | Marketing site + docs/help center for clients | session "Site" (haiku/low) | 8 | 1h |
| 12b | **Content Gap → Listicles**: find prompts where competitors are cited and we aren't, cluster them into gaps, generate brand-kit-compliant listicle drafts, review/approve, publish to the CMS/GitHub blog | session "Content gaps" (sonnet/medium) | 3, onboarding CMS | 1.5h |
| 13 | Provision + deploy to Vercel/Supabase/Infisical | lead | tokens + network (Access) | 30m |
| 14 | AthenaHQ visual parity pass | session "Athena UI" | user computer connected + approval | 2h |

## Budget rule (user, 2026-11-24)
Stay under the 5-hour usage limit (it was at 77% at 22:16 UTC and resets about 01:50 UTC). Start no new sessions until it resets.
Default to sonnet/haiku at low or medium effort; opus only for security review.
