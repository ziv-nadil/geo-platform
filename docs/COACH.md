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

## Next
- Wave 2: QA + security review + integrate. Deploy once VERCEL_TOKEN exists.
