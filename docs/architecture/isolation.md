# GEO Engine: Per-Client Isolation Design

Status: **proposal, design only** (2026-11-25). Owner requirement: **hard per-client separation**. Each client's agents
(content, social pulse, YouTube, monitoring) may reach only that client's credentials and data, even if an agent is
compromised or prompt-injected.
Builds on [`security.md`](./security.md) §1.2–1.6 and §5, and on [`../ops/costs.md`](../ops/costs.md).
Scale assumed: 2 clients (MVP), 5 (launch), 20 (full), about 7 secrets each (140 at full scale).

Confidence tags follow costs.md: **V** = verified on the vendor's own page in this session, **S** = secondary or
single source, **A** = our assumption.

---

## 0. The answer in one screen

| | Launch (≤ ~10 clients) | Scale (> ~10 clients, or 90-day audit required) |
|---|---|---|
| Design | **A + D**: Infisical **Pro**, one machine identity per client, logging in **only** via GitHub OIDC bound to that client's GitHub **environment**. Credentialed jobs run in GitHub Actions, one environment per client. | **C + D**: AWS Secrets Manager, one IAM role per client, trusted **only** from that client's GitHub environment (STS `AssumeRoleWithWebIdentity`), ABAC tags as defense in depth, CloudTrail. Same per-client GitHub environments. |
| What a compromised agent can reach | One client's secrets and data | One client's secrets and data |
| Isolation-specific monthly cost | ~$130 at 5 clients ($23 × 5 client identities + GitHub Team) | ~$90 at 20 clients (vs ~$560 if we stayed on A + D) |
| Why | Smallest change from today: the same projects, intake and provisioning. Only the *reader* moves. | Infisical's per-identity price grows by $20–23 per client. AWS grows by about $3 per client and audits every read for free. |

**Core idea.** Isolation has to come from **who the platform thinks the job is**, not from our code checking an org id.
A GitHub Actions job that declares `environment: client-acme` receives an OIDC token whose `sub` is
`repo:<owner>/geo-platform:environment:client-acme`. The vault trusts that exact subject for Acme's credentials and
nothing else. A job running for Acme cannot obtain a token with GEO Engine's subject. So even with full code execution
inside that job, a prompt-injected agent cannot read Beta Corp's secrets. Today's single `beacon-worker` identity reads every
client (security.md §1.5). That is the gap this document closes.

---

## 1. Facts that drive the design (checked 2026-11-25)

| Fact | Source | Tag |
|---|---|---|
| Infisical **Free**: 5 identities (humans + machines), unlimited projects, no audit log, no dynamic secrets | infisical.com/pricing | V |
| Infisical **Pro**: **$20/identity/mo annual, $23 monthly**. Identities are unlimited on the pricing table. Audit retention is **30 days**. RBAC/ABAC is included. **No dynamic secrets.** | infisical.com/pricing | V (one teardown says the Pro slider stops at 50 identities, S) |
| Infisical **Advanced**: $40/$46 per identity. Adds 90-day audit, **dynamic secrets**, custom roles and **temporary access** | infisical.com/pricing | V |
| Machine identities are billed like humans (the billing unit is the identity) | pricing page and teardowns | S |
| Infisical access tokens carry their **identity's** permissions. Token Auth, Universal Auth and OIDC set TTL, max TTL and number of uses, but **no token can be scoped below its identity** | Infisical docs (token-auth, universal-auth) | S (the docs describe no down-scoping) |
| Infisical OIDC auth supports GitHub Actions and checks `sub`, `aud` and extra claims. GitHub's `sub` contains `environment:<name>` when the job uses an environment | infisical.com/docs …/oidc-auth/github, docs.github.com OIDC reference | V |
| GitHub repositories created after 2026-07-15 use an **immutable default `sub`** that includes owner and repo ids. Read the real prefix from the repository's OIDC customization endpoint | GitHub docs via search | S |
| AWS Secrets Manager: **$0.40/secret/mo + $0.05 per 10k API calls**. No free tier. | aws.amazon.com/secrets-manager/pricing and 2 secondary sources | S (rates did not render on the AWS page) |
| AWS CloudTrail: 90-day event history is free, the first management-event trail is free, and `GetSecretValue` is a management event | AWS docs (known) | S |
| GitHub-hosted Linux 2-core runner **$0.006/min** (cut on 2026-01-01). Included minutes on Team; reports of a dollar-pool allowance from 2026-10 | docs.github.com billing, dev.to | S |
| Environments in **private** repos need GitHub Team (or Pro/Enterprise). Required-reviewer protection on private repos may need Enterprise. *Deployment branch* restrictions are what we rely on. | GitHub docs (known, not re-fetched) | S |

---

## 2. Designs compared

### A. Infisical Pro, one machine identity per client project

- `beacon-<slug>` projects already exist (security.md §1.1). Add identity `reader-<slug>` to that one project only:
  role **No Access** plus an additional privilege `secrets: describeSecret, readValue` on `prod`, `/**`. Keep the existing
  `-logins` exclusion.
- **Authentication decides how much A is worth.** If `reader-<slug>` logs in with Universal Auth and its client secret sits in
  Vercel, the Vercel function now holds 20 secrets. A compromised function reads all 20 again, so A on its own just
  moves the shared-secret problem. A gives **hard** isolation only when each identity's login is bound to something
  only that client's runtime has. That is design D.
- Cost: Pro is $23 × (N clients + writer + provisioner + ~2 humans), about $552/mo at 20 clients and $207/mo at 5.
- Residual: our control plane (`beacon-provisioner`, `beacon-app-writer`, human admins) still spans all clients. That is
  acceptable because the writer cannot read values and the provisioner removes itself (§1.3). Audit retention is 30 days, so we export nightly.

### B. One project per client plus a broker that mints short-lived, per-client scoped tokens

- **Infisical has no way to mint a token scoped below the identity that requests it.** All three auth methods (Universal,
  Token and OIDC) issue tokens with the identity's own permissions. Short TTLs and use limits are available on every
  plan, but per-request scoping is not.
- To give each client its own token, the broker therefore needs **one identity per client anyway** (A's cost), plus an
  org-level permission to create identities, tokens or client secrets. That broker is a **stronger** single point of
  compromise than today's worker: it can mint a reader for any client.
- **Dynamic secrets** (Advanced, $46/identity) issue leases for databases and cloud IAM (AWS/GCP keys we control). They
  don't help with what clients give us: GSC, CMS app passwords, Cloudflare tokens and Slack bot tokens are static third-party
  secrets. *Temporary access* (Advanced) is time-boxed project membership. It is useful for humans and does not
  scope per job.
- Verdict: **rejected.** It costs A's identity bill (or double, on Advanced), adds a broker that can reach every client, and its isolation is only
  as good as the broker code. That code is exactly what we are trying to stop trusting.

### C. AWS Secrets Manager, per-client IAM roles via STS, ABAC session tags, CloudTrail

- Store secrets as `beacon/<org_id>/<integration>` (one JSON secret per integration). Tag each with `org_id=<uuid>` and encrypt
  with a per-client KMS key (optional, $1/key/mo).
- **Per-client role** `beacon-reader-<slug>`, allowed only `secretsmanager:GetSecretValue` on `beacon/<org_id>/*`. Defense
  in depth: `Condition: StringEquals secretsmanager:ResourceTag/org_id = ${aws:PrincipalTag/org_id}`, plus
  `kms:ViaService` and `kms:EncryptionContext` on the client's key.
- **Who can assume it is what matters.**
  - *Vercel OIDC → shared broker role → `AssumeRole` + `TagSession` into a client role or session tag.* This is ABAC
    as AWS markets it, but the broker picks the tag, so a compromised broker picks any client. It is no better than today. **Don't.**
  - *GitHub OIDC → `AssumeRoleWithWebIdentity` directly into `beacon-reader-<slug>`* with trust condition
    `token.actions.githubusercontent.com:sub = repo:<owner>/geo-platform:environment:client-<slug>` (exact, no wildcard) and `aud = sts.amazonaws.com`.
    This is hard isolation: the subject comes from GitHub, not our code.
  - Session tags from web identity come only from the `https://aws.amazon.com/tags` claim, which GitHub tokens don't carry.
    So the **role**, not the tag, carries the org. The ABAC condition still blocks a mis-scoped role.
- Session duration 15 min (the minimum), one session per job. CloudTrail records every `AssumeRoleWithWebIdentity` (with the
  GitHub `sub`) and every `GetSecretValue`, with role session name = `job-<job_id>`.
- Cost at 20 clients: 20 × ~4 integration secrets = 80 secrets × $0.40 = **$32**, or $56 at one secret per field (140). API
  calls are ~$0.50. KMS is $20 for per-client keys. CloudTrail trail and S3 storage are about $1. **About $55–80/mo.** At 5 clients it is about $15–25.
- Residual: one more cloud to operate (an AWS account with SCPs and root MFA). Intake must write to AWS: the app writer
  role needs `CreateSecret`/`PutSecretValue` but no `GetSecretValue`, the same write-only shape as today.

### D. Per-client sandboxed runtime (layered on A or C)

- One **GitHub environment per client**, `client-<slug>`, in the private `geo-platform` repo. Each has:
  - **Deployment branches: `main` only** (protected, with required review). A PR or feature branch cannot run a job in
    `client-*`, so it cannot get a client OIDC subject.
  - Environment **variables** (not inputs): `ORG_ID`, `ORG_SLUG`, `INFISICAL_IDENTITY_ID` or `AWS_ROLE_ARN`. **No secrets
    stored in the environment.** Credentials come only from OIDC.
- One reusable workflow `client-job.yml` (`workflow_dispatch`, input `job_id` only). The job:
  1. Declares `environment: client-${{ inputs.org_slug }}`. GitHub resolves the environment, so the slug input only *selects* it.
  2. Reads `ORG_ID` from the **environment** and fetches the job record. It **aborts unless `job.org_id == vars.ORG_ID`**.
     A dispatcher that lies about the slug gets a job for the wrong org, which then refuses to run.
  3. Gets an OIDC token, logs into the client's vault identity or role, and runs the agent pipeline for that one org.
- **Data plane, not only secrets.** The runner must not hold the Supabase service-role key. That key reads every tenant and
  would undo D. Instead the runner sends its GitHub OIDC token to `POST /api/jobs/session` (Vercel). That endpoint verifies
  the signature, `sub` and `environment` and maps environment → org. It returns a **Supabase JWT** (`role=job_worker`,
  `org_id=<uuid>`, `job_id`, TTL 15 min) signed with the project's asymmetric JWT signing key. RLS for `job_worker` is
  `org_id = (auth.jwt()->>'org_id')::uuid`, insert/update only on job-output tables, with no access to `secret_refs`,
  `organizations` billing columns, or other orgs. Postgres becomes per-client too.
- Interactive paths stay on Vercel and **never read secret values**:
  - *First connection test*: tested **before storing**, using the value the user just submitted in the intake request (it is
    in memory anyway), then written via the write-only identity.
  - *Re-test later*: dispatch `client-job.yml` with `job_type=connection_test`. It takes 20–40 s of runner start-up, and the UI polls.
- Cost: runner minutes. Estimate (A): 20 clients × ~120 jobs/mo × ~3 min = 7,200 min, about **$43/mo** at $0.006 (less
  the plan's included allowance). GitHub Team is $4/user/mo for environments in private repos (S). At 5 clients it is about $11 plus seats.
- Residual: (1) **Whoever can merge to `main` controls code in every client environment.** Branch protection, CODEOWNERS on
  `.github/workflows/**` and 2-person review are mandatory. (2) GitHub-hosted runners have open egress. Exfiltration is
  limited to *this* client's data, and we keep `safeFetch` allowlists. Optional: StepSecurity Harden-Runner egress
  policy (S: check pricing for private repos). (3) Runner start-up latency makes this unsuitable for request-time work.
  (4) GitHub becomes part of the trusted computing base, alongside Vercel and Supabase.
- **Alternatives to GitHub environments** (considered, not chosen): per-client Vercel projects give each a distinct OIDC
  `sub`, but cost 20 projects to deploy and manage. Containers (Fly Machines or ECS tasks with a per-client task role) give
  real network policy and are the right upgrade if we outgrow Actions, but they add infrastructure.

### Comparison

| | A alone | B | C alone | **A + D** | **C + D** |
|---|---|---|---|---|---|
| Compromised agent reaches other clients' **secrets** | Yes, if the auth secrets live in one runtime | Yes, via the broker | Yes, via the broker's AssumeRole | **No** | **No** |
| …other clients' **DB rows** | Yes (service role) | Yes | Yes | **No** (job JWT + RLS) | **No** |
| Vault audit per read | 30 d (Pro) | 30/90 d | CloudTrail 90 d free, unlimited in S3 | 30 d plus nightly export | 90 d free, S3 forever |
| Infisical/AWS cost at 20 clients | ~$552 | ~$552–1,100 | ~$55–80 | ~$552 | ~$55–80 |
| Change from today | Small | Large | Large | **Medium** (new reader runtime) | Large (new vault and runtime) |

---

## 3. Cross-cutting rules (all designs)

### 3.1 Org id only from trusted job context
- A job is created server-side (`jobs.org_id` set by a server route or a scheduler, never from a request body field for
  another org, and never from model output). Under D, the runner trusts **only** `vars.ORG_ID` from its GitHub environment and the
  `org_id` claim in its job JWT. Both must equal `jobs.org_id` or the job aborts.
- `JobContext` (security.md §5.1) is built once at job start from those values and is **immutable**. Tools receive it by
  closure. No tool schema has an `orgId`, `projectId`, `path` or `environment` parameter.
- One job = one org = one runner. There are **no** multi-org jobs. The scheduler fans out per org.

### 3.2 Separate per-client LLM contexts
- One `LlmSession` per job, keyed `(org_id, job_id)`. Every content block appended to a prompt carries a provenance tag `{org_id,
  source}`. The client wrapper **throws** if any block's `org_id` ≠ the session's org. This covers RAG results, memory,
  examples, brand kits and prior outputs.
- No cross-org batching. A provider batch request (Message Batches, OpenAI batch) contains requests from one org only. Few-shot
  examples come from a curated, client-free library, never from another client's outputs.
- **Prompt caching:** cached prefixes are either org-free (system prompt, tool defs) or org-specific. The org's material goes
  after the shared prefix, so a cache hit never depends on another client's text.
- Vector search, conversation memory and "learned preferences" are stored with `org_id` and read through RLS under the job
  JWT. A query missing the filter returns nothing instead of everything.
- Cross-client benchmarks ("industry average visibility") are computed by a **non-LLM** SQL job into an aggregated,
  k-anonymous table (k ≥ 5). Agents may read only that table.

### 3.3 Prompt-injection containment
Assume injection will succeed sometimes. The goal is that it cannot cross clients or take irreversible actions.
1. **Blast radius = one client.** Under D, the worst case for an injected agent is reading or sending *that client's* data and
   credentials. This is the main control, and it does not depend on the model behaving.
2. **Reader/actor split** (security.md §5.2). Agents that read untrusted content (web pages, AI answers, YouTube and TikTok
   text, comments) have no credentialed or side-effect tools. Actors see only schema-validated output.
3. **Job-type tool allowlists**, enforced in the runner. Monitoring, social pulse and YouTube jobs get read tools only. Content
   and publish actions are `act` jobs that need human approval of a concrete diff, and they run in a separate workflow run.
4. **Credential capability, not value.** Secrets are injected into the tool call and never enter the prompt or the agent's env.
   Under D, set `id-token: write` only on the step that logs in, and run the agent step without the vault token in its
   environment. Pass it through an in-process handle, not an env var.
5. **Egress.** `safeFetch` per-integration host allowlists. Credentials are never forwarded across hosts. Optional runner
   egress firewall.
6. **Budgets and kill switch.** Per-job tool-call, token and time caps. A per-org daily cost cap. `client_jobs_paused[org]` is
   checked at each tool call.

### 3.4 Audit
| Layer | Records | Retention |
|---|---|---|
| `secret_access_log` (ours, already exists) | Every broker read with `job_id`, purpose, outcome and now `runner_sub` | 400 d |
| Vault: Infisical Pro audit log (A) or CloudTrail (C) | Identity login (with OIDC `sub`), each secret read | 30 d (nightly export to Supabase/S3) / 90 d free, S3 trail indefinitely |
| GitHub environment deployments | Which commit ran in which client environment, when, triggered by whom | GitHub retention plus nightly export |
| `/api/jobs/session` log | Every job JWT issued: `sub` → org, `job_id` | 400 d |

Nightly reconciliation (now possible on any paid tier): every vault read must match a `secret_access_log` row **and** a
job in the same org. Every runner `sub` must map to the org it read. Any mismatch pages us.

---

## 4. Monthly cost (isolation-relevant lines only)

Prices are monthly billing. Infisical annual billing is about 13% less. Today's baseline is Infisical Free at $0 (costs.md §6).

| Line | Today (Free, shared worker) | **Launch: A + D**, 5 clients | A + D, 20 clients | **Scale: C + D**, 20 clients |
|---|---|---|---|---|
| Infisical | $0 (Free, 4–5 identities) | Pro: 5 readers + writer + provisioner + 2 humans = 9 × $23 = **$207** | 24 × $23 = **$552** | Free tier kept for `beacon-platform` only, or $0 if moved (**$0**) |
| AWS Secrets Manager + KMS + CloudTrail | n/a | n/a | n/a | 80–140 secrets ($32–56) + KMS $20 + ~$2 = **~$55–80** |
| GitHub Team (environments in a private repo) | maybe already paid | 3 seats × $4 = **$12** (S) | $12 | $12 |
| Actions runner minutes | $0 | ~1,800 min ≈ **$11** (less included allowance) | ~7,200 min ≈ **$43** | **$43** |
| **Total** | **$0** | **≈ $230** | **≈ $607** | **≈ $110–135** |

- Compared with costs.md §6, which planned Infisical Pro at $92–230 for a *shared* identity set, launch adds about $0–140/mo. At full scale,
  C + D is **cheaper** than the old plan ($230) and about $470/mo cheaper than staying on A + D.
- Crossover: A + D costs about $23 more per added client, C + D about $3–4. Plan the A→C migration when we sign client 8–10, or
  sooner if a client contract asks for more than 30 days of audit.

---

## 5. Migration plan from today's broker (`web/src/lib/server/secrets/broker.ts`)

Today: Vercel functions call `readSecret(ctx, ref)`. That function authenticates as the single `beacon-worker` (OIDC from Vercel prod),
which has read on every client project, and logs to `secret_access_log`.

**Phase 0: preparation (no behavior change)**
1. Upgrade Infisical Free → Pro. Re-check the identity cap and price on infisical.com/pricing at checkout.
2. Move the repo's org to GitHub Team, if it isn't there already. Protect `main` (required review, CODEOWNERS on `.github/workflows/**`,
   `web/src/lib/server/secrets/**` and `web/src/lib/server/jobs/**`).
3. Read the repo's real OIDC `sub` prefix (`GET /repos/{owner}/{repo}/actions/oidc/customization/sub`). Repos after
   2026-07-15 use the immutable id format.

**Phase 1: per-client identities and environments (A + D plumbing)**
4. Extend `provision_vault` (security.md §1.3) with steps 6a–6c. Create identity `reader-<slug>`. Add it to `beacon-<slug>`
   only, with No Access plus the read privilege. Attach **OIDC auth** with issuer `https://token.actions.githubusercontent.com`,
   audience `infisical`, and the exact subject `<prefix>:environment:client-<slug>`, TTL 600 s. Create the GitHub environment
   `client-<slug>` (deployment branch `main`, vars `ORG_ID`, `ORG_SLUG`, `INFISICAL_IDENTITY_ID`) through the GitHub API. Store
   `organizations.reader_identity_id`.
   The provisioner identity needs org permission to create identities, and it already holds the widest grant. Keep its TTL at
   300 s and alert on each use.
5. Backfill existing clients with the same steps.

**Phase 2: move credentialed jobs to the per-client runner**
6. Add `/.github/workflows/client-job.yml` and `web/src/lib/server/jobs/runner.ts`, the entry point that verifies
   `vars.ORG_ID == job.org_id`, builds the immutable `JobContext` and runs the job type.
7. Add `POST /api/jobs/session` (GitHub OIDC → Supabase job JWT) and the `job_worker` RLS policies. Remove the
   service-role key from anything the runner can read.
8. Split the broker: `readSecret` keeps its interface and logging, but its credential source becomes a `VaultSession`
   created at job start from the runner's OIDC login (`sdk.auth().oidcAuth.login({identityId: vars.INFISICAL_IDENTITY_ID, jwt})`),
   instead of `sdkAs('worker')`. Add a guard that throws if `ctx.orgId !== session.orgId`. It's redundant, since the vault would 403 anyway, but it catches bugs early.
9. Switch job types one at a time: monitoring → social pulse → YouTube → content. The Vercel scheduler now only **dispatches**
   `client-job.yml` per org. Run the two paths side by side for a week and compare outputs and `secret_access_log`.
10. Connection tests: test-before-store at intake. Re-tests are dispatched to the runner.

**Phase 3: remove the shared reader (the point of no return)**
11. Remove `beacon-worker` from every client project, then delete the identity. From then on, **no Vercel runtime can read a
    client secret value.** Delete `sdkAs('worker')` and add a CI check that it does not come back.
12. Turn on nightly reconciliation (§3.4) and the Infisical audit-log export. Update security.md §1.2/§1.5 and costs.md §6.

**Phase 4 (scale): Infisical → AWS Secrets Manager (C + D)**
13. AWS account (in an AWS Organization, SCP denying everything outside the region, root MFA). GitHub OIDC provider in IAM. Per client:
    role `beacon-reader-<slug>` with exact-`sub` trust, KMS key, and secret prefix. Writer role for the Vercel intake (write-only,
    trusted from the Vercel OIDC prod subject). All of it in Terraform, generated per org by `provision_vault`.
14. Copy secrets per client (a one-off job in that client's environment that reads Infisical and writes AWS) and verify
    hashes. Switch `VaultSession` to `AssumeRoleWithWebIdentity` (role session name `job-<job_id>`). The broker interface is unchanged.
15. Run both side by side for 2 weeks, then remove the reader identities from Infisical (the bill falls by $23 per client). Keep
    `beacon-platform` on Infisical Free or move it as well.

---

## 6. Residual risks (after launch design A + D)

| Risk | Why it remains | Mitigation |
|---|---|---|
| Malicious or compromised code merged to `main` | That code runs in every client environment | 2-person review, CODEOWNERS, signed commits, protected workflow files, no `pull_request_target` |
| Control-plane compromise (Vercel prod, Supabase service role, provisioner) | Can dispatch jobs, rewrite job records, create identities | The provisioner can't *read* values (it removes itself). Alert on each provisioner and identity-creation event. Human break-glass with MFA. |
| GitHub as a trust root | GitHub's OIDC issuer and environment resolution are trusted | Exact-subject match. Monitor GitHub's sub-format changes. |
| Exfiltration of the job's own client data | Runner egress is open, and injection can still misuse that client's creds | Reader/actor split, read-only tools, `safeFetch`, budgets, human approval for writes, optional egress firewall |
| Shared LLM provider account | All clients use our API keys | Provenance checks, per-org sessions, zero-data-retention where offered. Keys are never in prompts. |
| Audit gap on Pro (30 d) | Plan limit | Nightly export. C removes this. |
| Vendor facts tagged S | Prices and plan gates not fully confirmed | Re-check at purchase: Infisical identity cap, GitHub environment features on Team, AWS rates |
