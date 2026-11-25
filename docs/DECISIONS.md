# Decisions (from the platform owner)

| Date | Question | Answer | Impact |
|---|---|---|---|
| 2026-11-25 | Engine budget default | Narrow scope: engines = OpenAI, Anthropic, Gemini, Google AI Overviews only (drop Perplexity and AI Mode). 100 prompts per client, ONE location, runs twice a week (not daily). Needs a cheap, API-drivable VPN/proxy to run searches from the client's preferred country: research it. | Cost well below $95/client; rework cadence and engine list in methodology/costs; add per-client country setting; brain to research VPN/proxy options |
| 2026-11-25 | AthenaHQ research source | Owner explicitly approves using their connected AthenaHQ account (explicit approval for the teardown). | Unblocks teardown agent via the AthenaHQ MCP connector |
| 2026-11-25 | DataForSEO LLM Scraper as add-on | Keep excluded (API-only). | No change |
| 2026-11-25 | Org creation | Invite-only at launch (project created after email verification and Stripe checkout or admin approval). | Matches security design |
| 2026-11-25 | Infisical Pro timing | Stay on Free until later (no audit logs yet; use test data only until upgrade). | Defer Pro; no real client credentials before upgrade is the safe reading |
| 2026-11-25 | Shared-worker residual risk | Accept at launch; per-client identities only if a contract demands. | Keep 3 shared identities + broker scoping |
| 2026-11-25 | Domain-user password+TOTP mode | Not answered directly. Owner instead said: build a content agent per client following our best practice; each client has its own agent that can access only its own tokens, with FULL separation between clients' agents, info and tokens. | New requirement: per-client agent runtime + isolated secrets. Tension with shared-worker acceptance above (see note). Domain-login mode still OPEN |
| 2026-11-25 | Staff visibility | Internal log only (staff writes show as "Agency team"); DPA wording covers staff support access. | As designed in security.md |

**Note:** "Accept shared worker" and "full separation per client agent" conflict for the content agents. Needs a follow-up: per-client identities for client-facing content agents (cost ~+$20/client/mo), shared worker only for monitoring?
