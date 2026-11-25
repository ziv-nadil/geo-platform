# Beacon GEO: monthly cost model

As of 2026-11-24. Owner: Finance/Ops agent. Source of truth for budgets and upgrade decisions.

**Verification status.** The official pricing pages (infisical.com, vercel.com, supabase.com, stripe.com, dataforseo.com, docs.perplexity.ai, openai.com, ai.google.dev) did not resolve from this session, so every third-party price below comes from search snippets and third-party teardowns. Each row carries a confidence tag: **V** = consistent across several sources, **S** = single or conflicting secondary source, **A** = assumption. Re-check each **S** row against the official page before committing budget.

---

## 1. Blockers on free tiers (read first)

| Service | Free-tier limit | Blocks us when | Verdict |
|---|---|---|---|
| **Infisical Free** | **5 identities** (human + machine), **unlimited projects**, no audit logs (S) | More than 5 identities. Our fixed design uses 3 machine + 1 human = 4. | **Decision: stay on Free at launch ($0).** Our `secret_access_log` is the audit trail. Upgrade to Pro at the first paying client or >5 identities. Fallback: AWS Secrets Manager (~$0.40/secret/mo, ~$56/mo for 140 secrets, CloudTrail audit). |
| Infisical Pro | Per identity per month. Price conflicts across sources: $18, $20 annual, $23 monthly (most recent teardown, S). Unlimited projects (S). One source caps Pro at 50 identities (S, unverified). | Immediately after the free cap | Plan for $23/identity/mo until confirmed |
| **Vercel Hobby** | Personal, non-commercial use only (V) | Any client billing or commercial use | **Must move to Pro before the first paying client** |
| **Supabase Free** | 2 active projects; projects pause after 1 week of inactivity (S); no SAML/SSO (V) | We need a prod DB that stays up, or SSO for client orgs | Move to Pro before prod |
| Gemini grounding | 5,000 grounded requests/mo free, then $14 per 1,000 (S) | Above 5,000 Gemini grounded calls/mo (the full scenario exceeds this) | Accounted for below |
| Perplexity API | No free API credit; the Pro-subscription API perk ended Feb 2026 (S) | Always, so budget from day one | Accounted for below |

**Identity design (decided by coordinator).** Do not create one identity per client per worker: at 2 workers × 20 clients that is 40 identities, about $920/mo at $23, and it blows the Free cap immediately. Use a small fixed set instead (an app-writer identity plus one identity per worker type), each granted a role on many projects. Per-org scoping is enforced in our fetch-by-reference tool and audit logs. Infisical's docs (S, via search) describe one machine identity added to multiple projects with a separate role per project, so this is supported. The cost model below assumes this fixed set (6 identities at launch, 10 at full scale).

---

## 2. Unit prices used

### 2.1 Engine APIs (per 1M tokens unless noted)

| Engine / API | Model used for costing | Input $/1M | Output $/1M | Extra per call | Conf. |
|---|---|---|---|---|---|
| ChatGPT | OpenAI `gpt-5-mini` + web search tool | $0.25 | $2.00 | Web search tool: **~$0.010/call (A, not verified)** | V tokens / A tool fee |
| Perplexity | `sonar` | $1.00 | $1.00 | Request fee ~$5 per 1K searches (S, third-party figure) | S |
| Gemini | Flash, intro pricing (through 2026-12-31) | $0.75 | $3.75 | Grounding $14 per 1K after 5K free/mo (S). From 2027 Flash is $1.50 / $7.50. | S |
| Claude | `claude-sonnet-5-5` + web search | $2.00 | $10.00 | Web search **~$0.010/call (A, not verified)** | V tokens / A tool fee |
| Claude (cheaper option) | `claude-haiku-5-5` | $0.10 | $0.50 | Same search fee | V (cached claude-api table) |
| DataForSEO AI Mode | Standard queue | n/a | n/a | **$0.0012 per page** (Live $0.004; Priority $0.0024 — sources disagree, S) | S |
| DataForSEO AI Overviews | Google Organic SERP, standard queue | n/a | n/a | **$0.0006 per SERP** (S) | S |

### 2.2 Other per-unit prices

| Item | Price | Conf. |
|---|---|---|
| OpenAI web search tool | ~$10 per 1K calls | A (not confirmed) |
| Stripe card, domestic | 2.9% + $0.30 per charge | V |
| Stripe international/FX surcharge | +1.5% / +1% (S) | S |
| Stripe Billing pay-as-you-go | 0.7% of billing volume (S) | S |
| Vercel Pro | $20/mo platform fee incl. 1 deploying seat and $20 usage credit; extra Owner/Member seat $20/mo; viewer seats free (S) | S |
| Supabase Pro | $25/mo base; compute billed on top, $10 compute credit applied (S); SAML included with Pro (V, per PLAN.md) | S |

---

## 3. Per-run assumptions

Each engine call is one prompt run.

| Parameter | Value | Note |
|---|---|---|
| Input tokens, search-enabled engines | 2,000 | Prompt + search results (A) |
| Input tokens, Perplexity | 600 | Search is built in (A) |
| Output tokens | 800 | Answer text (A) |
| Runs per client per engine per month | 100 prompts × 3 runs/wk × 4.33 wk = 1,300 | Full target |
| Engines | 5 (ChatGPT, Perplexity, Gemini, Claude, Google AIO/AI Mode) | Per PLAN.md |

Volume per engine: **full (20 clients) = 26,000/mo**, **launch (5 clients) = 6,500/mo**, **MVP (2 clients, 1 run/wk) = 867/mo**. Total runs at full scale: 130,000/mo.

---

## 4. Engine API cost per month

Costs are per engine per month. The "per call" column is the all-in price for one run.

| Engine | Per run | MVP (867/engine) | Launch (6,500) | Full (26,000) |
|---|---|---|---|---|
| ChatGPT (gpt-5-mini + search) | $0.0121 | $10 | $79 | $315 |
| Perplexity (sonar) | $0.0064 | $6 | $42 | $166 |
| Gemini (Flash + grounding) | $0.0045 tokens + $0.014 grounding over 5K free | $4 | $50 | $411 |
| Claude (Sonnet 5.5 + search) | $0.022 | $19 | $143 | $572 |
| DataForSEO (AI Mode + AIO, standard) | $0.0018 | $2 | $12 | $47 |
| **Engine total** | | **$41** | **$326** | **$1,511** |

Notes:
- Gemini grounding is free up to 5,000 requests/mo, so the MVP pays only for tokens.
- Claude on Haiku 5.5 instead of Sonnet 5.5 cuts the Claude line from $572 to about $275 at full scale. The model choice is a product decision, so flag it rather than decide it here.
- DataForSEO on Live mode (fresher data) costs about $120/mo at full scale, versus $47 on standard.
- Gemini at 2027 Flash pricing adds about $117/mo at full scale.
- Dominant cost: web-search tool fees (ChatGPT, Claude) and grounding. Both are unverified, so re-check before finalising.

---

### 4.1 Engine cost under the 2026-11-25 decisions (supersedes the table above)

Scope: **4 engines** (ChatGPT, Claude, Gemini, Google AI Overviews; Perplexity and AI Mode off by default) x **100 prompts** x **2 runs/week** (Mon + Thu, 1 run per prompt) x **1 location per client**. Runs per engine per client per month = 100 x 2 x 4.33 = **866**; at 20 clients = **17,320 per engine**, 69,280 total.

| Engine | Per run | Launch (5 clients, 4,330/engine) | Full (20 clients, 17,320/engine) |
|---|---|---|---|
| ChatGPT (gpt-5-mini + search) | $0.0121 | $52 | $210 |
| Claude (Sonnet 5.5 + search) | $0.022 | $95 | $381 (Haiku 5.5: about $183) |
| Gemini (Flash tokens $0.0045 + grounding $0.014 over 5K free/mo) | | $19 (under free grounding) | $78 tokens + $172 grounding = $250 |
| Google AI Overviews (DataForSEO standard, async AIO) | $0.0012 | $5 | $21 |
| **Engine total** | | **$171** | **$862** (about $664 with Haiku for Claude) |

That is about **$43 per client per month** (about $33 with Haiku), versus $95 in the old B-hybrid plan. The first-month 5-run baseline (about $60 for 5 engines) is now about $48 per client for 4 engines (100 prompts x 5 runs x 3 LLM engines plus 1 AIO run) and is not included above. One location per client means no multiplier; each extra location would multiply cost linearly. No VPN or proxy cost: location is sent through native API parameters (see methodology section 2.8).

---

## 5. Platform costs per month

| Line item | MVP / free | Launch (5 clients) | Full (20 clients) | Notes |
|---|---|---|---|---|
| Vercel | $0 (Hobby, internal only) | $60 (Pro + 2 extra seats) | $80 (Pro + 3 extra seats) | Hobby cannot serve paying clients |
| Supabase | $0 (Free) | $25 (Pro) | $50 (Pro + ~$25 usage, A) | Usage estimate is an assumption |
| Infisical | $0 (Free, 3 machine identities, decided) | $0 until first paying client, then Pro ~$92-138 (4-6 identities × $23) | $230 (10 identities × $23, Pro) | Per-identity price, S. Pro adds audit logs and enables the nightly reconciliation. Fallback AWS Secrets Manager ~$56/mo for 140 secrets. |
| **Platform total** | **$0** | **$223** | **$360** | |

Identity assumptions: launch = 3 humans + 3 machines; full = 5 humans + 5 machines.

---

## 6. Stripe fees (on client revenue)

Revenue is an **assumption** (A). We have no pricing yet. Assumed average $500 MRR per client.

| Scenario | Clients | MRR | Charges | Card fees (2.9% + $0.30) | Billing 0.7% | Stripe total |
|---|---|---|---|---|---|---|
| MVP | 2 (test mode) | $0 | 0 | $0 | $0 | $0 |
| Launch | 5 | $2,500 | 5 | $74 | $18 | **$92** |
| Full | 20 | $10,000 | 20 | $296 | $70 | **$366** |

Stripe is roughly 3.7% of MRR. This line scales with revenue, not usage.

---

## 7. Scenario totals

| Scenario | Clients | Engine APIs | Platform | Stripe (on assumed MRR) | **Total / month** |
|---|---|---|---|---|---|
| **MVP / free** | 2 internal, 1 run/wk | $41 (old estimate) | $0 | $0 | **≈ $41** |
| **Launch** | 5 | $171 | $223 | $92 | **≈ $486** |
| **Full** | 20 | $862 | $360 | $366 | **≈ $1,588** |

Engine APIs are about 68% of full-scale cost. Infisical is the largest platform line and is driven by the identity design choice.

---

## 8. Upgrade triggers

| Trigger | Action | Cost delta |
|---|---|---|
| First paying client, or any commercial use | **Vercel Hobby → Pro** (Hobby is non-commercial) | +$20 base + $20/extra seat |
| First paying client, or more than 5 identities | **Infisical Free → Pro** (not needed at launch) | ~$23/identity/mo |
| Need a prod DB that does not pause, or >2 active projects | **Supabase Free → Pro** | +$25/mo + usage |
| Client org requires SSO (SAML) | Supabase Pro (per PLAN.md; confirm plan) | Included with Pro, MAU-based beyond quota (S) |
| Client org requires SSO for the Supabase dashboard | Supabase Team (S) | $599/mo; not needed for our app login |
| Gemini grounding > 5,000 requests/mo | Pay $14 per 1K over the free tier | About $0.014 per call |
| Infisical identities > Pro cap (if 50 is real) | Infisical Enterprise, custom price | Unknown |
| Monthly engine API spend > $1,000 | Review model choice (e.g. Haiku 5.5 for Claude) and cadence | Saves ~$300/mo at full scale |

---

## 9. Open items

1. Re-check Infisical Pro price and identity cap on infisical.com/pricing (three different prices in sources).
2. Confirm Supabase SAML plan and the Team-vs-Pro split for dashboard SSO.
3. Confirm the OpenAI and Anthropic web search tool fees (~$10 per 1K assumed).
4. Confirm Perplexity `sonar` request fee and Gemini Flash rates on the official pages.
5. Decide per-client vs per-worker identity model with Security (see section 1).
6. Decide Claude engine model: Sonnet 5.5 ($572/mo full) or Haiku 5.5 (~$275/mo).
7. Set real pricing so Stripe fees and margins can be modelled.


## Addendum 2026-11-25

- Infisical stays on **Free at launch** ($0): 3 machine identities fit the cap. Pro at first paying client or >5 identities. AWS Secrets Manager is the documented fallback (~$0.40/secret/mo, ~$56/mo for 140 secrets).
- Removed from cost scope: Stripe fees (billing handled elsewhere, `BILLING_ENABLED=false`), Perplexity (adapter off by default), Unsplash. Cloudflare is optional.
- Anthropic runs on the existing company Anthropic account.

---

## Social pulse (Apify public-data actors + Haiku)

Added 2026-11-25. Actors (verified in the Apify store; public data only, no login, no cookies): `apify/reddit-scraper`, `apidojo/tweet-scraper`, `harvestapi/linkedin-post-search` (ids live in `web/src/lib/server/social-pulse/config.ts`). All are pay-per-event, so cost scales with items returned. The app never trusts these estimates for billing: each run's real `usageTotalUsd` is read back from Apify, stored in `social_pulse_runs.cost_usd`, and summed for the per-org monthly guard.

**Estimated cost per run (A = assumption; replace with measured values after the first live runs).** Unit estimates used by the guard: actor start $0.002 per run; Reddit $0.004 / post, X $0.0004 / tweet (store lists ~$0.10 to $0.40 per 1K), LinkedIn $0.002 / post.

| Platform | Items per run (default cap) | Est. cost per run | Conf. |
|---|---|---|---|
| Reddit | 30 | ~$0.12 | A |
| X | 30 | ~$0.014 | A |
| LinkedIn | 30 | ~$0.06 | A |
| Haiku clustering (`claude-haiku-5-5`, ~90 posts in, ~2K out; $0.10 / $0.50 per 1M) | 1 call | ~$0.002 | V |
| **One org, one daily pulse (all 3 platforms)** | 90 items | **~$0.20** | A |

Monthly per org: ~$6 at one run per day (30 days), well inside the default $10 monthly budget. At 20 orgs: ~$120/mo. Raise caps per org only with a matching budget.

**Controls** (per org, `social_pulse_settings`): max items per platform (5 to 100, default 30), max Apify runs per day (default 3), monthly USD budget (default $10; a run is refused when the remaining budget is below its estimate, and Apify's `maxTotalChargeUsd` hard-caps each run at the lesser of 2x the estimate and what is left), last-24h window, 14-day dedupe (`social_pulse_seen`). Global kill switch: env `SOCIAL_PULSE_DISABLED=1` stops all runs and Slack posts. Apify auth: env `APIFY_TOKEN` (never logged).

## Addendum 2026-11-25: per-client isolation

The infisical.com/pricing page now resolves (**V**): Pro is $20 per identity per month billed annually or $23 monthly, with unlimited identities and 30-day audit retention. Dynamic secrets require Advanced ($40/$46). Hard per-client isolation (see [`../architecture/isolation.md`](../architecture/isolation.md) §4) costs about **$230/mo at 5 clients** (Infisical Pro + GitHub environments) and about **$110–135/mo at 20 clients** after moving to AWS Secrets Manager. Staying on Infisical at 20 clients would cost about $607/mo.
