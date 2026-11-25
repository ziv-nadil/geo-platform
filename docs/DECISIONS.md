# Decisions (from the platform owner)

| Date | Question | Answer | Impact |
|---|---|---|---|
| 2026-11-25 | Engine budget default | Narrow scope: engines = OpenAI, Anthropic, Gemini, Google AI Overviews only (drop Perplexity and AI Mode). 100 prompts per client, ONE location, runs twice a week (not daily). Needs a cheap, API-drivable VPN/proxy to run searches from the client's preferred country: research it. | Cost well below $95/client; rework cadence and engine list in methodology/costs; add per-client country setting; brain to research VPN/proxy options |
| 2026-11-25 | AthenaHQ research source | Owner explicitly approves using their connected AthenaHQ account (explicit approval for the teardown). | Unblocks teardown agent via the AthenaHQ MCP connector |
| 2026-11-25 | DataForSEO LLM Scraper as add-on | Keep excluded (API-only). | No change |
| 2026-11-25 | Location | No VPN: per-org country/language via native API parameters; proxy only if consumer-UI scraping (excluded). | Migration 20261125001100, Settings UI |
| 2026-11-25 | Org creation | Invite-only at launch (project created after email verification and Stripe checkout or admin approval). | Matches security design |
