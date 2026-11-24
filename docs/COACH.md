# Coach lane: rolling memory of the main conversation

Read this first when resuming in a fresh or compacted session.

## User brief (condensed)
- Build a GEO agency platform. Layer 1: client onboarding wizard (progress bar; per-item: need → how to grant →
  live test → feedback on what's missing). Layer 2: dashboard cloning every AthenaHQ tab with a better light design + tooltips.
- Super admin sees all client accounts, invisible to clients. Each client has its own user mgmt. Signup, SSO, billing.
- About 20 accounts × 5 users. Cheap, agent-operable stack. Secrets per client in a separate project; security is critical.
- Work autonomously and in parallel. Make decisions and log open items in docs/ISSUES.md.

## User answers (2026-11-24)
- AthenaHQ UI: user chose "connect my computer". Not connected yet (no folders listed). Use MCP + public docs meanwhile.
- Name: Beacon GEO (placeholder). Engines: direct APIs + DataForSEO. Secrets: Infisical Cloud.

## State
- Wave 1 launched: research (Athena, engines), product onboarding spec, security design, backend schema,
  frontend app, finance. See docs/PLAN.md for the roster.
- Branch: claude/zealous-hamilton-nlkizt.

- AthenaHQ teardown agent was DENIED by the permission classifier (undermining oversight). Not relaunched; waiting on the user.
- DONE: finance (docs/ops/costs.md), onboarding spec (15 steps / 41 tests, web/src/config/onboarding.ts), engines
  (docs/research/ai-engine-methodology.md: ~$95 per client per month, Perplexity Agent API), security (docs/architecture/security.md,
  supabase/policies_reference.sql: no blanket super-admin bypass; MFA + time-boxed audited grants; 3 Infisical identities; JWE intake).
- Backend was told to reconcile its migrations with the security reference. Frontend was given the onboarding UI requirements.
- Running: backend, frontend.

- USER (2026-11-24 22:10): "no mocks, real infra; I don't see the sub sessions". Decisions:
  - Real Postgres everywhere: local PG16 dev DB (scripts/dev-db.sh + Supabase auth compat stub), seed data in the DB,
    server queries via the `postgres` driver with withRls() emulating Supabase JWT claims. Prod = Supabase pooler URL. Docker image pulls are blocked.
  - New agents run as VISIBLE remote sessions (create_session, tag beacon-geo). First: "Engines pipeline agent" -> branch claude/engines-pipeline.
  - The backend and frontend in-process agents were redirected (not restarted).

- Visible sessions (tag beacon-geo): Engines pipeline (session_01AWqBEXPhmfmvrcnkUfKwUp → claude/engines-pipeline),
  Questions for you (session_01AWqBEZjxUMnzpYy76Q3AvZ → claude/user-decisions, docs/DECISIONS.md),
  Accounts & logins (session_01AWqBEZWemsMjuvf2amBhJz → claude/access-checklist, docs/ACCESS.md).
  User wants the lead's context kept light: route all questions and login asks through those two sessions.

- USER RULE: never use Explorium company accounts, connectors or branding (Claude excepted). All services go on the user's PERSONAL accounts.

- Session naming rule: short descriptive titles, no project prefix (e.g. "Engines", "Questions", "Access", "QA").

## Next
- Wave 2: QA + security review + integrate. Deploy once VERCEL_TOKEN exists.
