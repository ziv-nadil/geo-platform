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
| 2026-11-25 | Infisical region | US cloud. | No EU org at launch |
| 2026-11-25 | GitHub step for non-Git CMS | Auto-skip, provided Git isn't needed anywhere else in the process (lead to verify). | Add skip logic to onboarding config |
| 2026-11-25 | Domain-user access mode (clarified) | Client chooses ONE of: (a) share access with a dedicated email WE give them, or (b) a dedicated email THEY create for us. Both are dedicated agency-access identities. Whether we store that identity's password/TOTP is still to be confirmed. | Wizard step 3 keeps both modes; vault storage of login credentials to confirm |
| 2026-11-25 | Per-client agent isolation | User asked what risk we take without full separation (answer pending: explained in follow-up). | Open |
| 2026-11-25 | Content-agent isolation (final) | Wants the SAFE way: hard per-client isolation of agents, info and tokens. Asks the lead to RETHINK whether per-client Infisical identities are the right tool at 20 clients (evaluate alternatives, e.g. per-client project + short-lived scoped tokens, per-client sandboxed runtimes). | Lead/security to propose an isolation design and cost; owner approves |
| 2026-11-25 | Stored logins for dedicated email | Yes if needed (no choice when a service has no API/OAuth), but wants to know why it's unsafe. Minimize: prefer OAuth/API grants, store passwords/TOTP only when no alternative, in separate logins vault. | Keep logins vault as fallback only; explain risks to owner |
