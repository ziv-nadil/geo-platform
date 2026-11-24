# AI Engine Measurement Methodology (Beacon GEO)

Author: Researcher-Engines agent. Date: 2026-11-24. Status: research draft for the lead and Backend.
Scope: how we measure brand visibility in AI engines using **direct vendor APIs + DataForSEO** (no scraping of consumer UIs, per the user's decision in `docs/PLAN.md`).

## 0. Read this first: verification status and headline findings

**Verification limits.** In this cloud session `WebFetch` could not reach the vendor docs hosts (platform.openai.com, developers.openai.com, docs.perplexity.ai, ai.google.dev, docs.anthropic.com, docs.dataforseo.com all failed DNS: they are outside the session's network allowlist). All facts below come from `WebSearch` result summaries (secondary, sometimes conflicting) plus my own knowledge of the API shapes. Each fact is tagged:

- **[V]** seen in this session's search results (vendor page or multiple agreeing sources)
- **[V?]** seen but sources conflict or are third-party only; re-check before coding against it
- **[K]** from my knowledge of the API reference, not re-confirmed today; treat as "verify in the first adapter spike"

Before Backend writes adapters, someone with unrestricted network should spend about 1 hour confirming every **[V?]** and **[K]** item (a checklist is in section 9). Allowing the hosts above in the session network settings would let a follow-up agent do it.

**Headline findings**

1. **Perplexity Sonar chat-completions was retired on 2026-09-27** [V]. New work must use the **Agent API** (`POST /v1/agent`, alias `/v1/responses`) with the `web_search` tool. The Search API (`$5/1k`) is a separate, non-deprecated product that returns ranked results, not answers. The PLAN.md wording "Perplexity Sonar API" is stale.
2. **PLAN.md's "about $50-200/mo" total for AI engine data is too low** by roughly 10-20x if we want statistically usable sampling. Realistic envelope for 20 clients x 100 prompts x 5 engines: **about $1.9k/month recommended (about $95 per client)**, range $1.1k (lean) to $3.5k (rigorous). The cost is dominated by search-tool fees and search-result input tokens on the four LLM engines, not by Google/DataForSEO (about $0.0024 per prompt for AI Overview + AI Mode). See section 5.
3. **LLM answers are non-deterministic**: SparkToro/Gumshoe found the same prompt returns the same brand list less than 1 in 100 times and the same ordered list about 1 in 1,000 [V?]. So we measure **mention frequency (visibility rate)**, never single-run rank, and we always report confidence intervals.
4. **llms.txt has no measurable citation effect** in 300k-domain (SE Ranking) and 13.9k-domain (Search Atlas) studies, and Google says it does not use it [V?]. Treat it as optional hygiene, not a ranking lever.
5. **DataForSEO has a "LLM Scraper" endpoint that scrapes ChatGPT/Gemini consumer UIs** [V]. That conflicts with the "no consumer UI scraping" decision, so it is excluded by default; see Open decisions (section 10). Google AI Overviews / AI Mode via DataForSEO SERP are themselves vendor-run SERP collection, which the user already accepted.

**Skills / plugins check (per PLAN.md rule).** `SearchSkills` and `ListSkills` returned nothing for GEO/SEO/crawler keywords. `SearchPlugins` found installable **community** plugins, none enabled and not installed by me: "AI Search Visibility & Brand Mentions (GEO/AEO)" (skills `ai-citation-data`, `ai-answer-gap`, `llms-txt-crawler-access`), "SEO-AEO-GEO Ultimate" (`ai-visibility-monitor`, `seo-geo`), "SEOcrawl AI Reports" (has an MCP server; crawler-health and AI share-of-voice reports), "SearchFit SEO" (`ai-visibility`), and the first-party **Cloudflare** plugin (MCP server + `workers-*`/`wrangler` skills; useful for the crawler-monitoring work). Community plugins are reference material only; do not take a runtime dependency. Already available in this environment: the built-in `claude-api` skill (use for the Anthropic adapter: model IDs, web search tool, batch, caching) and the **AthenaHQ MCP connector** (`find_more_prompt_discovery`, `source_tags__*`, `get_site_health_*`, `get_youtube_*`) as a live reference for how Athena does prompt discovery and source tagging.

---

## 1. Engine matrix (summary)

| Engine surface | Integration | Model to use | Citations come back as | Approx. cost / query* | Locale control | Biggest gap vs consumer UI |
|---|---|---|---|---|---|---|
| ChatGPT | OpenAI Responses API, `web_search` tool | `gpt-5.4-mini` daily; `gpt-5.4` for a weekly calibration slice | `url_citation` annotations on message text; `web_search_call` items carry fan-out queries and sources | $0.033 mini / $0.064 flagship | `user_location` (country/region/city/timezone) | No memory/personalization, UI model routing and UI-only widgets (shopping, maps) absent |
| Perplexity | **Agent API** `/v1/agent` + `web_search` tool (Sonar retired) | preset `fast`/`low` (maps to Sonar/Sonar-Pro class) | `citations[]` + `search_results[]` (title, url, date, snippet) [V?] | about $0.008-0.015 | country/location param in the web_search tool [K] | Consumer Pro Search/model picker, Spaces, follow-up context |
| Gemini | Gemini API `generateContent` + `google_search` tool | current Flash-class (e.g. `gemini-3.x-flash`; exact ID to confirm) | `groundingMetadata.groundingChunks/groundingSupports/webSearchQueries` | about $0.04 | No documented country param for Search grounding; language via prompt [K] | Gemini app personalization/Workspace context; AI Mode is a different surface |
| Claude | Anthropic Messages API + `web_search` server tool | `claude-haiku-4-5` default; Sonnet-class for a calibration slice | `web_search_result_location` citations on text blocks; `web_search_tool_result` blocks | $0.039 Haiku / $0.058 Sonnet-class | `user_location` approximate | claude.ai uses its own system prompt, memory and bigger models |
| Google AI Overviews | DataForSEO Google Organic SERP, `load_async_ai_overview: true` | n/a (SERP) | `ai_overview` item: text, `ai_overview_element[].references`, `ai_overview.references` | $0.0012 (standard queue) | `location_code` (down to city), `language_code`, `device` | AIO not shown for every query (trigger rate); personalization |
| Google AI Mode | DataForSEO `/serp/google/ai_mode/live/advanced` (or task mode) | n/a | markdown text + typed elements + references with domain | $0.0012 std / $0.0024 priority / $0.004 live | `location_code`, `language_code`, `device` | Multi-turn follow-ups not captured |
| Grok (optional) | xAI API `web_search` / `x_search` tools | `grok-4.x` | citations in response | tool $5/1k calls + tokens [V?] | limited | Low priority engine for most B2B clients |
| Copilot / Meta AI | **No supported answer API** with citations | none | none | n/a | n/a | Skip. Copilot is only reachable via UI scraping (DataForSEO LLM Scraper) which is excluded |

\* Per single run, my assumptions (section 5.1), excluding the analysis/judge call.

---

## 2. Per-engine adapter notes

Common request policy for all LLM engines: send the tracked prompt **verbatim as the user turn**, no system prompt that mentions the brand, and force the search tool to be used (otherwise models answer from memory on some prompts, and the measurement stops reflecting "AI search"). Record the *actual* model string returned, the search queries the model issued (fan-out), `usage` tokens, the tool-call count, latency, and the raw JSON.

### 2.1 ChatGPT: OpenAI Responses API

- **Endpoint** [K]: `POST https://api.openai.com/v1/responses`.
- **Model**: `gpt-5.4-mini` ($0.75 in / $0.075 cached / $4.50 out per 1M tokens) for the daily/weekly panel [V]; `gpt-5.4` ($2.50 / $0.25 / $15) for a small weekly calibration slice; `gpt-5.4-nano` ($0.20 / $1.25) is the cheap analysis/judge model [V]. Model names move fast; keep the model ID in config per engine, not in code.
- **Request** [K]:
  ```json
  {"model":"gpt-5.4-mini","input":"<prompt>","reasoning":{"effort":"low"},
   "tools":[{"type":"web_search","user_location":{"type":"approximate","country":"US","city":"Austin","region":"Texas","timezone":"America/Chicago"}}],
   "tool_choice":"required","include":["web_search_call.action.sources"]}
  ```
  `filters.allowed_domains/blocked_domains` exists (max 100) but do not use it for measurement; it changes what the user would see. One community report found blocked domains leaking into sources, another reason not to rely on it [V?].
- **Citations** [K]: response `output[]` contains `web_search_call` items (with `action.query` = the fan-out query and, when included, `action.sources[]`) and a `message` item whose `content[].annotations[]` have `type:"url_citation"`, `url`, `title`, `start_index`, `end_index`. URLs often carry a `utm_source=openai` parameter; strip tracking params before dedupe. Store **cited** (annotation) and **consulted** (sources list) separately.
- **Cost** [V]: web search tool is `$10 / 1k calls` plus search-content tokens billed at model rates (the legacy `web_search_preview` was $10 reasoning / $25 non-reasoning per 1k with free search tokens; a March 2026 forum thread shows the docs and marketing page disagreed, so reconcile against the first invoice). Reasoning models may issue several searches per answer, so budget 2 calls/answer (observed range 1-4).
- **Rate limits**: tiered by cumulative spend and visible in the dashboard (Settings > Limits). I could not retrieve the RPM/TPM numbers [V?]. Our load is small (a few thousand requests spread over hours), so use a per-engine token bucket (start at 20 rpm) and read `x-ratelimit-*` headers.
- **Batch**: OpenAI Batch gives about 50% off tokens (not the tool-call fee) at 24h latency [K]; good for the weekly panel.
- **Gaps**: API has no account memory or personalization, ChatGPT's consumer default is an auto-routed model with its own system prompt, and shopping/local widgets are not returned. Mitigation: keep prompts natural-language, run a monthly "UI spot check" by a human on 10 prompts per client to estimate API-vs-UI agreement, and publish that agreement rate in reports.

### 2.2 Perplexity: Agent API (Sonar is retired)

- **Status** [V]: Sonar chat-completions retired 2026-09-27; replaced by the **Agent API**, a single `POST /v1/agent` (the `/v1/responses` path remains an alias for OpenAI compatibility). Legacy params (`top_k`, `n`, `seed`, `search_mode`) are ignored. Presets `fast/low/medium/high/xhigh` replace model names; the exact Sonar-to-preset mapping is reported inconsistently across sources, so pick the preset empirically by comparing citation counts on 20 prompts.
- **Search tool pricing** [V?]: `web_search` about `$0.0025` per invocation (`$0.001` with `search_type:"fast"`; older guides show `$0.005`); model tokens billed at the underlying provider's rates with no markup; citation tokens are no longer charged. The separate **Search API** is `$5/1k` and returns ranked results only (useful later for source-level checks, not for answer measurement).
- **Citations** [V?]: response still carries `content`, `citations` (URL list) and `search_results` (title, url, date, snippet); `[n]` markers in the text index into `citations`. Confirm the exact field names on the first spike.
- **Locale** [K]: country/location options exist in the tool/search settings; confirm names.
- **Rate limits**: usage-tier based; confirm in dashboard.
- **Gaps**: consumer Perplexity has Pro Search, model picker, Spaces; API "fast/low" is closer to the default free experience.
- **Fallback**: DataForSEO **LLM Responses** API can proxy Perplexity (and ChatGPT/Claude/Gemini) at $0.0006/task + provider cost [V]. Keep it as a one-switch fallback adapter if the Agent API response shape is painful; do not make it primary (extra margin, less control over tool params).

### 2.3 Gemini: Gemini API + Google Search grounding

- **Endpoint** [K]: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `tools:[{"google_search":{}}]`.
- **Model**: a Flash-class model. Third-party trackers disagree on what is current (3 Flash preview $0.50/$3.00; 3.5 Flash $1.50/$9.00; 3.8 Flash $0.75/$3.75 intro) [V?]; budget at $1.50 / $9.00 per 1M, pin the exact ID after reading the official model list.
- **Grounding price** [V]: 5,000 grounded requests/month free (shared across Gemini 3.x), then **$14 per 1,000**; sources disagree on whether the unit is "grounded prompt" or "each Grounding Query" (a prompt can fan out to several queries) [V?]. Budget by query to be safe. Requires a billed project (no free-tier grounding for newer models) and grounding has its own, lower rate limits; forum reports show 429s on Tier 1 even with dashboard headroom [V?]. Plan on **Tier 2+ or Vertex AI** for stable throughput.
- **Citations** [K]: `candidates[0].groundingMetadata` has `webSearchQueries[]` (fan-out), `groundingChunks[].web.{uri,title}`, `groundingSupports[].{segment{startIndex,endIndex,text}, groundingChunkIndices[]}` (maps answer spans to sources) and `searchEntryPoint`. `uri` is a `vertexaisearch.cloud.google.com/grounding-api-redirect/...` link; `title` is usually the bare domain. **Resolve redirects** (follow `Location` with a HEAD/GET, cache by URI) to get the real URL for URL-level citation share; if resolution fails keep domain from `title`.
- **Locale**: no documented country parameter for Search grounding [K]; localize by prompt wording and language. This is a real gap vs AI Mode via DataForSEO (which has `location_code`). Use AI Mode for geo-sensitive clients.
- **Gaps**: Gemini app adds personalization and Workspace context; the Gemini API with grounding is a proxy for "Gemini with search", while Google's own AI answer surfaces are covered by AIO/AI Mode.

### 2.4 Claude: Anthropic Messages API + web search tool

- **Endpoint** [K]: `POST https://api.anthropic.com/v1/messages`.
- **Tool** [V?]: server tool `web_search` with versioned type; `web_search_20250305` is the long-standing one, newer versions with dynamic filtering are reported (`web_search_20260209`, even `..._20260318`). Read the live docs (or the `claude-api` skill) for the current string. Params: `max_uses` (set 2-3), `user_location` (approximate city/region/country/timezone), `allowed_domains`/`blocked_domains` (do not use for measurement).
- **Models** [V?]: Haiku 4.5 at $1 / $5 per 1M is the daily model; Sonnet-class is $3/$15 (Sonnet 5 reported at $2/$10 standard) for the calibration slice. Verify on the pricing page.
- **Cost** [V]: **$10 per 1,000 searches** plus token charges; each search counts as one use regardless of results returned; failed searches are not billed. Search results count as **input tokens**, including on continuation turns, so a 2-search answer is often 10-20k input tokens.
- **Citations** [K]: response `content[]` includes `server_tool_use` (the issued query), `web_search_tool_result` (array of `web_search_result` with `url`, `title`, `page_age`, `encrypted_content`) and `text` blocks with `citations[]` of `type:"web_search_result_location"` (`url`, `title`, `cited_text`, `encrypted_index`). `cited_text` gives per-claim evidence for free. Consulted = tool results; cited = text-block citations.
- **Rate limits** [V]: RPM, input TPM and output TPM per model class by tier; Anthropic's docs say there is no automatic tier advancement beyond the early tiers (increase through a rep) and that 60 RPM may be enforced as 1 req/s. Use a 1 req/s per-model bucket and honour `retry-after`.
- **Batch**: Message Batches is 50% off tokens; web search inside batches is believed supported [K], verify.
- **Gaps**: claude.ai uses its own system prompt, memory and stronger default models; consumer search behaviour differs.

### 2.5 Google AI Overviews: DataForSEO Organic SERP

- **Endpoints** [V]: `POST /v3/serp/google/organic/live/advanced` (live) or `task_post` + `tasks_ready/task_get` (Standard queue, about 45 min target; Priority and Live cost more). Set `load_async_ai_overview: true`, otherwise `ai_overview` is `null` for queries where Google serves the overview asynchronously.
- **Price** [V]: organic SERP **$0.0006** per page (Standard); `load_async_ai_overview` doubles it to **$0.0012** (the async surcharge is refunded if no overview exists, per the 2024 announcement, re-check). Priority and Live tiers are higher (I could not confirm exact figures; assume 2x and about 3-4x).
- **Response** [V]: `items[]` contains an `ai_overview` item (text, `ai_overview_element[]` each with `references[]` = sources for that passage, plus `ai_overview.references` = "More sources" block); references carry `source`/`title`/`url`/`domain`. Also `people_also_ask` items (use for prompt discovery, section 3.7).
- **Locale** [V]: `location_code` (country to city level), `language_code`, `device` (desktop/mobile). Always set all three per client market.
- **Gaps**: not every query triggers an AIO (log `aio_present` and report **trigger rate** separately from **visibility when shown**); results vary by personalization/time.
- **Run count**: SERP data is far less noisy than LLM sampling; 1 run/day is plenty.

### 2.6 Google AI Mode: DataForSEO

- **Endpoint** [V]: `POST /v3/serp/google/ai_mode/live/advanced` (also task mode). Params: keyword, `location_code`, `language_code`, `device`.
- **Price** [V]: **$0.0012** Standard (about 5 min), **$0.0024** Priority (about 1 min), **$0.004** Live (about 6 s) per results page. Use Standard via task queue for scheduled runs; Live only for the "run now" button.
- **Response** [V]: markdown answer, typed elements (`ai_overview_element`, `ai_overview_table_element`) and references with domain.
- **Gaps**: no follow-up conversation; structure of items may change, so keep `raw` JSON.

### 2.7 Optional / excluded engines

- **Grok** [V?]: xAI API with server-side `web_search` and `x_search` tools at $5/1k calls (X Search billing reportedly changed 2026-09-21 to per-post/per-profile; verify). Add only on client request (X-heavy audiences).
- **Copilot, Meta AI, Apple Intelligence**: no supported public answer API with citations. Do not promise them. Bing visibility is better handled through the Bing Webmaster step (onboarding step 7) and AI-crawler data (section 7).
- **DataForSEO LLM Mentions API** [V?]: a cross-platform mention database (Google AIO + ChatGPT); price listed as `$0.10/request + $0.001/row` on the product page vs `$0.02 + $0.00003/row` in a help article; `$100` minimum monthly commitment. Not a core measurement source (we want per-prompt control) but useful for **competitor benchmarking and prompt/topic discovery** at market level. Optional add-on, off by default.
- **DataForSEO LLM Responses** [V]: $0.0006/task live (up to 120 s), cap of 30 concurrent live requests per platform per account, plus provider charges. Fallback adapter only.
- **DataForSEO LLM Scraper** [V]: $0.0012 Standard / $0.0024 Priority / $0.004 Live per page; scrapes consumer ChatGPT/Gemini UIs. **Excluded** (see section 10).

---

## 3. Metrics methodology

### 3.1 Definitions

Let a *tracked prompt* `p` belong to a client, an *engine* `e`, a *run* `r`. One **observation** `o = (p, e, r, t, locale)` yields one stored response with extracted structure:

- `m_o` in {0,1}: brand mentioned
- `rank_o`: position among recommended entities (null if not mentioned)
- `c_o` in {0,1}: at least one **owned-domain** URL is cited
- `sent_o` in [-1,1]: sentiment of the brand's mention(s)
- `E_o`: ordered list of all entities (brands/organizations) the answer mentions
- `K_o`: set of citations (consulted vs cited)

### 3.2 Mention detection (brand + aliases, fuzzy)

Brand entity config: `canonical`, `aliases[]` (including product names, former names, common misspellings, abbreviations), `owned_domains[]`, `negative_aliases[]` (disambiguation, e.g. "Apple" the fruit, "Mercury" the planet), `competitors[]` (same shape).

```
detectMentions(text, brand):
  T = normalize(text)   # NFKC, casefold, strip diacritics, collapse whitespace, unwrap markdown **bold**/[link](url)
  spans = []
  # 1. exact alias match with word boundaries (unicode-aware)
  for a in brand.aliases ∪ {brand.canonical}:
      for m in regex(r"(?<!\w)" + escape(normalize(a)) + r"(?!\w)", T): spans.append({a, m.start, m.end, 'exact', 1.0})
  # 2. domain / URL match: any link or bare URL whose registrable domain ∈ brand.owned_domains
  # 3. fuzzy (only if no exact hit for that token window, alias length >= 6, token starts uppercase in original text):
  #      score = max(JaroWinkler(tok, alias), 1 - Levenshtein(tok, alias)/len(alias)); accept if >= 0.92
  #      require window to also pass "not in negative_aliases" and not in a common-English-word stoplist
  # 4. disambiguation: if alias ∈ ambiguous_aliases, require a context cue within ±80 chars
  #      (category words, owned domain, product term) else mark 'ambiguous' and send to LLM adjudication
  # 5. ambiguous/fuzzy spans -> LLM adjudicator (cheap model, JSON: {is_brand: bool, confidence})
  return dedupeOverlaps(spans)
```

- `m_o = 1` if any exact or accepted span exists. Keep `match_type` and `confidence` so QA can audit.
- Run the same detector for every competitor so SoV is symmetric.
- **Unknown-entity extraction:** one cheap structured LLM call per response (nano/Haiku, temperature 0) returns `entities:[{name, rank, role:"recommended"|"neutral"|"negative"|"source_only", span}]`. Names not in the competitor list are stored as `candidate_competitors` and surfaced in the UI as "emerging competitors" for the agency to confirm. This also supplies `rank_o`.

### 3.3 Position / rank in the answer

Two complementary signals (LLM answers are often unordered prose, so no single signal is enough):

- **List rank** `rank_o`: index of the brand's entity in the extractor's ordered entity list (1 = first recommended). Only populated when the answer is a list/ranking-like response; otherwise null.
- **First-mention offset** `off_o = first_span.start / len(text)` in [0,1].

Position score used in the visibility formula:

```
pos_o = 1 / log2(1 + rank_o)           if rank_o not null     # 1.00, 0.63, 0.50, 0.43, 0.39 ...
      = 1 - off_o                       otherwise (prose answers)
pos_o = 0                               if not mentioned
```

Because ordered lists almost never repeat (about 1 in 1,000), **report average position only as a secondary, per-prompt-pooled number with its CI; never as the headline**.

### 3.4 Share of voice vs competitors

For each response, each entity `b` in `{brand} ∪ competitors` gets a weight `w_o(b) = 1/log2(1 + rank_o(b))` (or `1` if unranked but mentioned; this is the "mention share" variant).

```
SoV_mention(b) = Σ_o 1[b mentioned in o]            / Σ_o Σ_b' 1[b' mentioned in o]
SoV_weighted(b)= Σ_o w_o(b)                         / Σ_o Σ_b' w_o(b')
```

Sums run over observations in the window for the chosen engine set and prompt set (prompts optionally weighted by importance `ω_p`). Denominator includes confirmed unknown entities, so `SoV` is share of *all* brands the engines said, not just tracked ones. Default headline = `SoV_weighted`; expose both.

### 3.5 Citation share (domain-level and URL-level)

Normalize every URL: lowercase host, strip `www.`, strip tracking params (`utm_*`, `ref`, `gclid`, OpenAI's `utm_source=openai`), drop fragments, resolve Gemini redirects, canonicalize trailing slash; registrable domain via the Public Suffix List.

```
# response-level dedupe so a source cited 5 times in one answer counts once
cited_resp(d) = #responses in window with ≥1 cited URL on domain d
CitationRate(d)  = cited_resp(d) / #responses                       # "how often is d a source"
CitationShare(d) = Σ_o |cited URLs of d in o (deduped)| / Σ_o |cited URLs in o (deduped)|
OwnedCitationRate = Σ_{d ∈ owned} ... CitationRate (response-level, any owned domain)
URL-level:        same formulas with url_canonical instead of domain; surface top-N URLs and which prompts they win
```

Always keep two flags per citation: `cited` (inline annotation/citation block) and `consulted` (in the search results the model read). Primary metric uses `cited`; `consulted` powers "retrieved but not cited" opportunity analysis. Perplexity and AI Mode only expose a source list, so treat all of their sources as `cited` and note that in the UI tooltip.

### 3.6 Sentiment (LLM-judge with rubric)

Judge only the **sentences containing the brand** (± one sentence context) to avoid dilution by the rest of the answer. Model: cheap judge (`gpt-5.4-nano` or Haiku 4.5), temperature 0, JSON-schema output, a **different vendor than the engine being judged where practical** to avoid self-preference.

Rubric (include in the prompt verbatim; versioned as `rubric_version`):

```
Score the brand's portrayal, not the writing tone.
+1.0 clear recommendation / "best", "top choice", strong endorsement
+0.5 favorable, lists real advantages, no notable negatives
 0.0 neutral/factual mention, or balanced pros and cons of equal weight
-0.5 unfavorable: notable drawbacks, "may not be ideal", recommends alternatives instead
-1.0 explicit warning, accusation (fraud, safety, legal), "avoid"
Return: label(positive|neutral|negative|mixed), score(-1..1), aspects[{name: price|quality|support|trust|features|ux, polarity}], evidence_quote (≤200 chars), confidence(0..1)
If the brand is only listed as a source/citation and not described, label "neutral" with score 0 and aspects [].
```

Calibration: hand-label 200 sentences across engines (stratified); require Cohen's kappa >= 0.7 and mean absolute error <= 0.2 against the human score before shipping; re-run on every judge-model or rubric change and store both versions so history is comparable. Aggregates: `Sentiment = mean(sent_o | m_o=1)`, `NetSentiment = (#pos − #neg)/#mentions`, plus aspect breakdown.

### 3.7 Visibility score formula (0-100)

Per-observation score, then weighted aggregation. All weights are config (defaults below), stored with the metric version so history can be recomputed.

```
sentFactor(s) = 0.5 + 0.25 * (s + 1)                    # s=-1 → 0.5 ; 0 → 0.75 ; +1 → 1.0
score_o = m_o * (0.55 + 0.25*pos_o + 0.20*c_o) * sentFactor(sent_o)       # in [0,1]

# per prompt-engine cell: mean over runs in window
cell(p,e) = mean_r score_o

# engine score: importance-weighted mean over prompts
VS_e = 100 * Σ_p ω_p * cell(p,e) / Σ_p ω_p                         # ω_p: funnel/importance weight, default 1

# overall: engine weights λ_e (configurable per client; must sum to 1)
VS = Σ_e λ_e * VS_e
```

Default `λ` (placeholders; do not present as market-share facts; tune per client from GA4 AI referrals): ChatGPT 0.35, Google AIO 0.15, Google AI Mode 0.15, Gemini 0.15, Perplexity 0.10, Claude 0.10. Headline **non-branded** prompts only (branded prompts inflate the score); show branded separately.

Companion plain metrics shown next to the score (each with a CI): **Visibility rate** `V = mean(m_o)`, **Avg position** (secondary), **SoV**, **Owned citation rate**, **Net sentiment**.

### 3.8 Sampling, variance and confidence

Facts: same-prompt answers vary a lot and list order almost never repeats [V?]; one test found only about 5 brands per category appear 80%+ of the time in ChatGPT [V?]; some tools run each prompt 5x minimum; Conductor found intent type predicts consistency more than industry [V?].

Design rules:

1. **Unit of reporting = visibility frequency**, estimated over many runs and many prompts.
2. **Fixed-panel estimator.** Our prompt set is the population of interest (not a sample of prompts), so uncertainty comes from run-to-run noise only. With `M` prompts, `R_i` runs of prompt `i` in the window, `p̂_i` the mention rate:
   ```
   V̂ = (1/M) Σ_i p̂_i
   Var(V̂) = (1/M²) Σ_i p̂_i (1 − p̂_i) / (R_i − 1)            (R_i ≥ 2)
   95% CI = V̂ ± 1.96 * sqrt(Var)
   ```
   Worked example: M=100, R=3, average `p̂(1−p̂)≈0.12` (many prompts are near 0 or 1) gives SE about 2.4 pp, CI about ±4.8 pp. With R=1 per week, pool a **rolling 4-week window** (R≈4) for the headline.
3. **Per-prompt-engine cells** use a Beta posterior (prior Beta(1,1)) and are shown as "mentioned in 4 of 6 runs" with a credible interval; never as a single number. Exact binomial/Wilson for display.
4. **Change detection.** Flag a week-over-week or month-over-month movement only if the 95% CI of the difference excludes 0 (bootstrap by resampling runs within prompts) **and** the absolute change is >= 3 pp. Otherwise show "no significant change".
5. **Stratified runs** (cost control): "core" prompts (top 25: BOFU + high business value) get 3 runs/week; the long tail gets 1/week, pooled over 4 weeks. Core prompts are the ones the client sees movement on.
6. **Hold conditions constant:** same time-of-day window, same locale, same adapter parameters, no conversation history, fresh request each run (no `previous_response_id`).
7. **Series breaks:** record `model` returned by each API. When the model version string changes for an engine, mark a series break annotation in charts (model upgrades move visibility without any client change).
8. **Sentiment/position** are less stable than presence; require `n >= 10` mentions in the window before showing an average and grey it out otherwise.

### 3.9 Prompt discovery

Goal: a tracked set of about 100 prompts/client that look like how people ask AI engines (longer, conversational, intent-rich), not like keywords.

| Source | How | Notes |
|---|---|---|
| **GSC queries** | Search Analytics API, last 90 days, `query` x `page`; keep informational/commercial queries with >=4 words or question words; cluster by embedding; rewrite into natural-language prompts | Already have GSC (onboarding step 6); best signal of real demand |
| **Keyword Planner / DataForSEO Labs** | Keyword ideas + volume for ICP topics; take top clusters, rewrite to prompts | Volume is a proxy only; no prompt volume exists |
| **People Also Ask** | DataForSEO SERP `people_also_ask` items for seed queries; expand 2 levels | Questions are already prompt-shaped; cheap ($0.0006/SERP) |
| **LLM generation** | Persona x funnel stage x intent templates seeded with ICP, product catalogue, competitors, geography | Use the matrix below; ask for 10 variants, dedupe |
| **Query fan-out mining** | Persist the sub-queries engines issue (`web_search_call.action.query`, Gemini `webSearchQueries`, Claude `server_tool_use` input) from our own runs | Free by-product; shows what engines actually search for; feed back as new prompt candidates |
| **Competitor gap** | Prompts where competitors are cited and brand is not; DataForSEO LLM Mentions (optional); AthenaHQ `find_more_prompt_discovery` as reference | |

Generation matrix: funnel stage `TOFU` (problem/education, 30%), `MOFU` (category/comparison, "best X for Y", 40%), `BOFU` (brand/vs/pricing/alternatives/reviews, 30%) x persona (3-5 ICP roles) x modifiers (industry, company size, geography, constraint like budget/integration). Tag each prompt `{stage, persona, topic, branded: bool, intent}` and a language/locale. Dedupe with embedding cosine >= 0.9; require human approval of the final list in the Prompts tab; allow weekly "suggested prompts" refresh capped at 10 new per client per month so time series stay comparable (never silently change the panel).

### 3.10 Source categorisation

Classify every cited domain/URL once, cache by domain (re-evaluate URL patterns first):

| Category | Rule |
|---|---|
| `owned` | registrable domain in client `owned_domains` (incl. subdomains, blog, docs) |
| `competitor` | domain in any competitor's `owned_domains` |
| `ugc_social` | reddit.com, quora.com, x.com, linkedin.com (posts), facebook.com, stackexchange.com, medium.com (UGC-style), substack (free blogs) |
| `video` | youtube.com, vimeo.com, tiktok.com |
| `review_aggregator` | g2.com, capterra.com, trustpilot.com, gartner peer insights, softwareadvice, yelp, tripadvisor, app stores |
| `earned_media` | news/trade publications, magazines, analyst sites (publisher classification list) |
| `reference` | wikipedia.org, wikidata, britannica, official standards bodies |
| `institutional` | .gov, .edu, .org research bodies |
| `marketplace_ecom` | amazon.*, ebay, shopify store pages, retailer sites |
| `other` | everything else |

Implementation: static rules table (domain suffixes and URL patterns such as `reddit.com/r/`, `youtube.com/watch`) first; unknown domains go to a cheap LLM classifier (input: domain + title + 200-char snippet; output: category + confidence) and are cached in `source_domains` with `category_source = 'rule'|'llm'|'manual'`. Agencies can override per client (this is Athena's "source tags" idea; see `source_tags__*` in the AthenaHQ MCP). Roll-ups: citation share by category, "where does the AI get its answers about my topic" (Reddit/YouTube/review-site dependence), and the **earned/UGC gap list** (domains cited for competitors but never for the brand) that drives the Outreach and Creators tabs.

---

## 4. Pipeline design

### 4.1 Flow

```
Vercel Cron (daily 02:00 UTC)  →  POST /api/cron/enqueue  (auth: CRON_SECRET)
   for each active client: schedule = f(plan, cadence config)  →  insert run_batches + prompt_runs(status='queued')
Worker (Supabase Edge Function invoked by pg_cron every minute, later Inngest):
   claim N rows:  UPDATE prompt_runs SET status='running' WHERE id IN (SELECT id ... WHERE status='queued' AND engine=$e
                  ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT $n) RETURNING *
   per engine token bucket (Postgres counter or Upstash) → adapter.run(prompt, locale)
   → insert responses (raw JSON to Storage if > 100 KB) → analysis job queued
Analysis stage (same worker, separate queue):
   normalize citations → detect mentions → entity+rank extraction (LLM) → sentiment (LLM) → classify new domains
   → write mentions, citations, fanout_queries → rollup job
Rollups: daily/weekly tables per (client, engine, prompt/topic) incl. CI inputs  →  dashboard reads rollups only
DataForSEO: Standard-queue task_post + pingback to /api/webhooks/dataforseo (fallback: poll tasks_ready every 5 min)
```

Operational rules: idempotency key `(client_id, prompt_id, engine, run_date, run_index)`; retries with exponential backoff + jitter on 429/5xx, max 3, then `failed` with the error stored; **per-client monthly budget guard** (sum `cost_usd`; pause LLM engines at 100% and alert at 80%); per-engine kill switch; store `adapter_version`, `rubric_version`, `detector_version`; engine API keys are **platform-level** secrets (one org-wide key per vendor in Infisical, cost allocated by `cost_usd`), client-owned integration secrets stay in per-client Infisical projects as in PLAN.md; use Batch APIs (OpenAI/Anthropic/Gemini) for the weekly sweep where available, synchronous calls for "run now" and onboarding baselines; for new clients run a **baseline**: 100 prompts x 5 runs x all engines once (about $60) so day-1 dashboards have intervals.

### 4.2 Cadence recommendation

| Surface | Cadence | Runs | Why |
|---|---|---|---|
| Google AI Overviews + AI Mode (DataForSEO Standard) | **daily** | 1 | Cheap ($0.0024/prompt/day); low noise; catches Google changes fast |
| ChatGPT, Perplexity, Gemini, Claude | **weekly** (stagger across the week by client) | core 25 prompts x 3 runs, other 75 x 1 run (4-week pooled) | Cost vs variance trade-off (section 3.8) |
| Calibration slice (flagship models / Sonnet-class) | monthly | 10 prompts x 3 runs | Measures drift between cheap panel model and consumer-grade model |
| Human UI spot check | monthly | 10 prompts/client | Publishes API-vs-UI agreement rate |
| Prompt refresh | monthly | n/a | Capped suggestions |
| Crawler analytics (Cloudflare) | hourly or daily poll | n/a | section 7 |

"Run now" button: single synchronous run per engine, flagged `trigger='manual'`, excluded from trend series.

---

## 5. Cost envelope

### 5.1 Unit-cost assumptions (single run, USD)

Token assumptions per answer: search-augmented input 12k tokens for OpenAI, 15k for Claude, 3k for Gemini, 4k for the Perplexity agent model; output 0.8-1k tokens; 2 search calls per answer on average. Calculation script reproduces these; all inputs are the **[V]/[V?]** prices above.

| Engine | Configuration | Search fee | Token cost | **Per run** |
|---|---|---|---|---|
| ChatGPT | gpt-5.4-mini, effort low | 2 x $0.010 | 12k x $0.75 + 0.9k x $4.50 per M = $0.013 | **$0.033** |
| ChatGPT (calibration) | gpt-5.4 | $0.020 | $0.044 | $0.064 |
| Perplexity | Agent API fast/low | 2 x $0.0025 | about $0.003 | **$0.008** (range $0.008-0.015) |
| Gemini | Flash-class @ $1.5/$9 | 2 x $0.014 | $0.0135 | **$0.042** (less within the 5,000 free grounded requests/month) |
| Claude | Haiku 4.5 | 2 x $0.010 | 15k x $1 + 0.8k x $5 per M = $0.019 | **$0.039** |
| Claude (calibration) | Sonnet-class @ $2/$10 | $0.020 | $0.038 | $0.058 |
| Google AIO | DataForSEO Standard + async | n/a | n/a | **$0.0012** |
| Google AI Mode | DataForSEO Standard | n/a | n/a | **$0.0012** |
| Analysis | nano/Haiku judge + entity extraction | n/a | about 1.2k in, 0.3k out | **about $0.001 per response** |

So one "all five engines" prompt-run costs **$0.121 (4 LLM engines) + $0.0024 (Google) + about $0.006 (analysis) = about $0.13**.

### 5.2 Scenarios per client (100 prompts) and for 20 clients

| Scenario | LLM engines | Google | Per client / month | 20 clients / month |
|---|---|---|---|---|
| A Lean | weekly, 1 run (4.3 runs/mo) | weekly | **$56** | $1,122 |
| **B-hybrid (recommended)** | weekly, core 25 x 3 + 75 x 1 (about 4.3-13 runs/mo) | **daily** | **$95** | **$1,890** |
| B Uniform | weekly, 2 runs for all 100 | daily | $122 | $2,432 |
| C Rigorous | weekly, 3 runs for all 100 | daily | $176 | $3,518 |
| D Daily single run | daily, 1 run | daily | $389 | $7,773 |
| E Daily x3 | daily, 3 runs | daily | $1,140 | $22,791 |

Scaling of scenario B (uniform): 50 prompts = $61/client ($1,216 for 20); 100 = $122 ($2,432); 200 = $243 ($4,863). Cost is linear in prompts x runs.

**Per-client monthly cost table (recommended B-hybrid, by prompt count)**

| Prompts | LLM engines | Google daily | Analysis | **Total / client / month** |
|---|---|---|---|---|
| 50 | $39 | $3.6 | $4 | **$47** |
| 100 | $79 | $7.2 | $8.5 | **$95** (first month +$60 for the 5-run baseline) |
| 150 | $118 | $10.8 | $13 | **$142** |
| 200 | $158 | $14.4 | $17 | **$189** |

Fleet-level extras not in the per-client rows: monthly calibration slice (flagship/Sonnet-class, 10 prompts x 3 runs per client) about $3 per client, about $60 per month for 20 clients.

Fixed/other costs: DataForSEO needs a $50 minimum top-up (credits do not expire) and the LLM Mentions option needs $100/month commitment [V?]; Perplexity/xAI optional; no per-seat fees. For comparison, AthenaHQ-class tools typically list at several hundred dollars per client per month, so a $79-$119 COGS/client is workable if we charge accordingly; flag this to the lead because PLAN.md assumed $50-200 for the whole fleet.

### 5.3 Cost levers (in order of impact)

1. **Cap tool calls** (`max_uses` 2 for Claude, instruct low search effort for OpenAI, `search_type:"fast"` for Perplexity): search fees plus search-result input tokens are 60-80% of cost.
2. **Core vs tail stratification** (already in B-hybrid): saves about 40% vs uniform 3 runs.
3. **Batch APIs** for the weekly sweep: about 50% off token portion (about 20-25% total since tool fees are not discounted) [K].
4. **Gemini free grounding** (5,000/month) covers about 25-40% of Gemini volume at our scale if one billing project is shared.
5. **Prompt caching** is of little use (prompts are short and unique).
6. **Reduce engines per plan**: e.g. "Starter" = Google + ChatGPT + Perplexity ($0.043/run vs $0.121).
7. **Skip unchanged**: none; LLM sampling is stochastic, so do not cache answers across weeks.

---

## 6. Storage schema (Postgres/Supabase; RLS on `client_id` like every table)

```sql
create type engine_id as enum ('chatgpt','perplexity','gemini','claude','google_aio','google_ai_mode','grok');
create type run_status as enum ('queued','running','succeeded','failed','skipped');

create table prompts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  text text not null,
  topic text, funnel_stage text check (funnel_stage in ('tofu','mofu','bofu')),
  persona text, branded boolean not null default false, importance numeric not null default 1,
  tier text not null default 'tail' check (tier in ('core','tail')),
  locale jsonb not null,                 -- {country:'US', language:'en', location_code:2840, region, city, device}
  source text,                           -- gsc|kwp|paa|llm|fanout|manual
  status text not null default 'active', created_at timestamptz default now()
);

create table prompt_runs (               -- one scheduled execution = one engine call
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, prompt_id uuid not null references prompts(id),
  engine engine_id not null, run_index int not null, run_date date not null,
  trigger text not null default 'schedule',          -- schedule|manual|baseline|calibration
  scheduled_at timestamptz not null, started_at timestamptz, finished_at timestamptz,
  status run_status not null default 'queued', attempts int not null default 0, error text,
  adapter_version text, cost_usd numeric(10,5),
  unique (prompt_id, engine, run_date, run_index, trigger)
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references prompt_runs(id), org_id uuid not null,
  model text not null, text text, raw_ref text,       -- raw JSON in Storage if large
  input_tokens int, output_tokens int, search_calls int, latency_ms int,
  aio_present boolean,                                  -- google_aio only
  analysis_version text, analyzed_at timestamptz
);

create table brand_entities (            -- client brand + competitors + discovered
  id uuid primary key default gen_random_uuid(), org_id uuid not null,
  name text not null, kind text not null check (kind in ('brand','competitor','candidate')),
  aliases text[] not null default '{}', negative_aliases text[] not null default '{}',
  domains text[] not null default '{}', status text default 'active'
);

create table mentions (                  -- one row per (response, entity)
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade, org_id uuid not null,
  entity_id uuid references brand_entities(id), entity_name text not null,
  rank int, first_offset real, mention_count int not null default 1,
  match_type text, confidence real, role text,          -- recommended|neutral|negative|source_only
  sentiment real, sentiment_label text, aspects jsonb, evidence text, rubric_version text
);

create table source_domains (            -- global cache, org overrides via org_source_tags
  domain text primary key, category text not null, category_source text not null, updated_at timestamptz default now()
);

create table citations (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade, org_id uuid not null,
  url_raw text, url_canonical text not null, domain text not null,
  title text, position int, cited boolean not null,     -- true=inline citation, false=consulted only
  cited_text text, category text, is_owned boolean, is_competitor boolean
);

create table fanout_queries (            -- sub-queries issued by the engine (prompt discovery + analysis)
  id bigserial primary key, response_id uuid not null references responses(id) on delete cascade, org_id uuid not null,
  query text not null, ordinal int
);

create table visibility_daily (          -- rollup, one row per org/engine/prompt/day
  org_id uuid, day date, engine engine_id, prompt_id uuid,
  runs int, mentioned_runs int, sum_score numeric, sum_rank_weight numeric,
  owned_cited_runs int, sentiment_sum numeric, sentiment_n int,
  primary key (org_id, day, engine, prompt_id)
);

create table crawler_hits_hourly (       -- Cloudflare poll, section 7
  org_id uuid, zone_id text, hour timestamptz, bot text, bot_purpose text, path text,
  status int, requests bigint, bytes bigint, primary key (org_id, zone_id, hour, bot, path, status)
);

create table engine_usage (org_id uuid, month date, engine engine_id, runs int, cost_usd numeric, primary key (org_id, month, engine));
```

Indexes: `prompt_runs(status, engine, scheduled_at)`, `citations(org_id, domain)`, `mentions(org_id, entity_id)`, GIN on `brand_entities.aliases`. Retain raw JSON 90 days (Storage lifecycle), structured rows indefinitely. Dashboards read `visibility_daily` plus `citations`/`mentions` aggregates; CI calculations use `runs`, `mentioned_runs` per prompt from `visibility_daily`.

---

## 7. AI crawler monitoring

### 7.1 Bots to identify

| Bot (UA token) | Operator | Purpose | Notes |
|---|---|---|---|
| `GPTBot` | OpenAI | training | robots.txt controls training use only |
| `OAI-SearchBot` | OpenAI | search index for ChatGPT search | **must stay allowed** to be cited in ChatGPT search |
| `ChatGPT-User` | OpenAI | user-triggered fetch | proxy for "a real person's ChatGPT session read this page"; may not honor robots.txt like a crawler |
| `ClaudeBot` | Anthropic | training | |
| `Claude-SearchBot` | Anthropic | search index | allow to be cited in Claude search |
| `Claude-User` | Anthropic | user-triggered fetch | |
| `PerplexityBot` | Perplexity | search index | |
| `Perplexity-User` | Perplexity | user-triggered | reportedly ignores robots.txt [V?] |
| `Google-Extended` | Google | **robots.txt token only, no own UA** | governs use of Googlebot-fetched content for Gemini training/grounding; does not affect Search ranking; cannot be seen in logs. AIO/AI Mode visibility depends on **Googlebot** indexing |
| `Googlebot`, `Bingbot` | Google/Microsoft | classic search index feeding AIO/AI Mode and (for Bing) Copilot and some ChatGPT retrieval | monitor crawl health, not just AI bots |
| `Applebot-Extended`, `Meta-ExternalAgent`, `CCBot`, `Bytespider`, `Amazonbot` | Apple/Meta/Common Crawl/ByteDance/Amazon | training / data | log for completeness |

UA strings and version suffixes vary by source (e.g. `OAI-SearchBot/1.0` vs `OAISearchBot/1.0`), so **match on token substrings case-insensitively** and confirm against vendor docs. **UA is spoofable:** verify with Cloudflare's verified-bot signal / detection IDs, or against the vendor-published IP lists (OpenAI and Perplexity publish JSON IP lists; reverse-DNS for Googlebot/Bingbot) and tag `verified boolean`.

### 7.2 Cloudflare data access

- **AI Crawl Control (formerly AI Audit)** dashboard shows crawlers by operator/category, requests, referrals, robots.txt compliance, and lets the client block/allow/charge (pay-per-crawl) per crawler [V].
- **GraphQL Analytics API** exposes the same data [V]: `POST https://api.cloudflare.com/client/v4/graphql` with a **zone-scoped API token (Analytics:Read)**, dataset `httpRequestsAdaptiveGroups`, filter by `userAgent` (all plans) or by **detection IDs** (advanced AI crawler detection requires Enterprise + Bot Management) [V]. Documented limits: a maximum analytics window per query (24 h cited for all plans, configurable on Enterprise) [V?], so **poll hourly/daily and store ourselves** in `crawler_hits_hourly`.

Example query (field names per the documented "data transfer by crawler" example; confirm in the GraphQL explorer):

```graphql
query AiCrawlers($zone: String!, $since: Time!, $until: Time!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptiveGroups(
      limit: 10000, orderBy: [count_DESC],
      filter: { datetime_geq: $since, datetime_lt: $until,
                OR: [ { userAgent_like: "%GPTBot%" }, { userAgent_like: "%OAI-SearchBot%" },
                      { userAgent_like: "%ChatGPT-User%" }, { userAgent_like: "%ClaudeBot%" },
                      { userAgent_like: "%Claude-SearchBot%" }, { userAgent_like: "%Claude-User%" },
                      { userAgent_like: "%PerplexityBot%" }, { userAgent_like: "%Perplexity-User%" },
                      { userAgent_like: "%bingbot%" }, { userAgent_like: "%Googlebot%" } ] }) {
      count
      sum { edgeResponseBytes }
      dimensions { datetimeHour userAgent clientRequestPath edgeResponseStatus }
    } } }
}
```

Classify each `userAgent` into `bot` + `bot_purpose` (`training|search|user_fetch|classic_search`) using the table above in the worker, not in the query.

Fallbacks when Cloudflare is not in front: CloudFront standard logs to S3 + Athena (onboarding step 12), or Vercel log drains; same classifier. Cloudflare Logpush (Enterprise) to R2/S3 gives raw UA/IP for verification.

### 7.3 Metrics and alerts

- Requests, unique pages and bytes per bot per day; share by purpose.
- **User-fetch hits per page** (`ChatGPT-User`, `Claude-User`, `Perplexity-User`) = pages AIs actually read to answer real users; join to citations to see "cited and fetched".
- **Search-bot coverage:** % of sitemap URLs crawled by `OAI-SearchBot`/`PerplexityBot`/`Claude-SearchBot` in 30 days; last-crawled per URL.
- **Errors:** 4xx/5xx and 403/429 rates to AI bots (WAF or rate limiting accidentally blocking them) with alerts.
- **robots.txt audit:** fetch `/robots.txt` and evaluate per bot (allow/disallow); alert if `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Googlebot` or `Bingbot` is disallowed or if Cloudflare's managed robots/AI-bot block rule is on.
- **AI referral traffic** (GA4 onboarding step 8): sessions with source/referrer `chatgpt.com`, `perplexity.ai`, `gemini.google.com`, `claude.ai`, `copilot.microsoft.com`, plus `utm_source=chatgpt.com`; correlate with visibility score.

### 7.4 llms.txt practice

- Format: Markdown at `/llms.txt` (H1 name, blockquote summary, H2 sections of annotated links) and optional `/llms-full.txt`.
- Evidence [V?]: SE Ranking (about 300k domains) found no relationship with citation frequency; Search Atlas (13.9k domains, six platforms) likewise; one analysis of 500M+ AI bot visits found only 408 direct `llms.txt` requests; Google has said it does not support it and its May 2026 AI optimization guidance lists it as not needed for AIO/AI Mode. Adoption is about 6-10% of sites.
- Platform stance: include a **low-priority "hygiene" check** (exists, valid, links resolve), generate one on request (cheap), **never present it as a visibility lever**, and log hits to `/llms.txt` in the crawler data so we can measure for ourselves. Higher-impact GEO checks: bots allowed (7.3), server-rendered content, Bing indexation + IndexNow, schema/entity clarity, content that earns third-party citations (section 3.10).

---

## 8. TypeScript interface sketch

```ts
// packages/engines/src/types.ts  (sketch; adapters live in web/src/lib/server/engines/*)

export type EngineId =
  | 'chatgpt' | 'perplexity' | 'gemini' | 'claude'
  | 'google_aio' | 'google_ai_mode' | 'grok';

export interface Locale {
  country: string;            // ISO 3166-1 alpha-2, e.g. 'US'
  language: string;           // BCP-47, e.g. 'en', 'pt-BR'
  region?: string;
  city?: string;
  timezone?: string;          // IANA
  locationCode?: number;      // DataForSEO location_code (required for google_* adapters)
  device?: 'desktop' | 'mobile';
}

export interface RunOptions {
  model?: string;             // override config default (calibration runs)
  maxSearches?: number;       // cap tool calls (cost control), default per adapter
  timeoutMs?: number;         // default 120_000
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface Citation {
  url: string;                // as returned by the engine (after redirect resolution if possible)
  urlCanonical: string;       // normalized (tracking params stripped, host lowercased)
  domain: string;             // registrable domain
  title?: string;
  snippet?: string;           // Claude cited_text / Perplexity snippet / AIO passage
  position: number;           // 1-based order of first appearance
  cited: boolean;             // true = inline citation/annotation; false = consulted only
  spans?: Array<{ start: number; end: number }>; // character ranges in `text` it supports (OpenAI annotations, Gemini groundingSupports)
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  searchCalls?: number;
  costUsd: number;            // computed by the adapter from its price table; `priceVersion` recorded
  priceVersion: string;
}

export interface EngineResult {
  engine: EngineId;
  text: string;               // final answer as markdown/plain text
  citations: Citation[];
  fanOutQueries: string[];    // sub-queries the engine issued (empty if not exposed)
  model: string;              // model string actually reported by the API (or 'google-ai-mode' etc.)
  locale: Locale;
  usage: Usage;
  latencyMs: number;
  aioPresent?: boolean;       // google_aio: whether an AI Overview was returned
  raw: unknown;               // full vendor JSON (stored in Storage if large)
  adapterVersion: string;
}

export class EngineError extends Error {
  constructor(
    message: string,
    public kind: 'rate_limited' | 'transient' | 'auth' | 'invalid_request' | 'content_blocked' | 'no_answer' | 'timeout',
    public retryAfterMs?: number,
    public cause?: unknown,
  ) { super(message); }
}

export interface EngineAdapter {
  readonly id: EngineId;
  readonly version: string;
  /** Static config: default model, concurrency, rps, whether the engine supports batch/async. */
  readonly capabilities: {
    supportsLocale: Array<keyof Locale>;     // which locale fields are honored
    exposesFanOut: boolean;
    batch?: 'vendor_batch' | 'dataforseo_task' | null;
    maxConcurrency: number;
    rateLimit: { requestsPerMinute: number };
  };
  /** Synchronous run. Must not throw non-EngineError. Must force the search tool on. */
  run(prompt: string, locale: Locale, opts?: RunOptions): Promise<EngineResult>;
  /** Optional async path for the weekly sweep and DataForSEO Standard queue. */
  submit?(prompt: string, locale: Locale, opts?: RunOptions): Promise<{ jobId: string }>;
  collect?(jobId: string): Promise<EngineResult | { pending: true }>;
  /** Cheap credential/permission check used by onboarding "Test connection". */
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

export interface EngineRegistry {
  get(id: EngineId): EngineAdapter;
  enabledFor(orgId: string): EngineId[];     // plan + client config
}

// ---- analysis side ----

export interface BrandEntity { id: string; name: string; kind: 'brand' | 'competitor' | 'candidate';
  aliases: string[]; negativeAliases: string[]; domains: string[]; }

export interface MentionSpan { entityId?: string; entityName: string; start: number; end: number;
  matchType: 'exact' | 'domain' | 'fuzzy' | 'llm'; confidence: number; }

export interface ExtractedEntity { name: string; rank?: number; role: 'recommended' | 'neutral' | 'negative' | 'source_only'; }

export interface SentimentResult { label: 'positive' | 'neutral' | 'negative' | 'mixed'; score: number;
  aspects: Array<{ name: string; polarity: -1 | 0 | 1 }>; evidenceQuote: string; confidence: number; rubricVersion: string; }

export interface Analyzer {
  detectMentions(text: string, brand: BrandEntity, competitors: BrandEntity[]): MentionSpan[];
  extractEntities(text: string): Promise<ExtractedEntity[]>;      // LLM, structured output
  judgeSentiment(sentences: string[], brand: BrandEntity): Promise<SentimentResult>;
  classifyDomain(domain: string, title?: string): Promise<{ category: string; confidence: number }>;
}
```

Pseudo-code for the worker's per-run function and the rollup:

```ts
async function executeRun(run: PromptRun) {
  const adapter = registry.get(run.engine);
  await bucket(run.engine).take();                       // per-engine token bucket
  const prompt = await getPrompt(run.promptId);
  const res = await retry(() => adapter.run(prompt.text, prompt.locale), { max: 3, on: isRetryable });
  const responseId = await saveResponse(run, res);        // + raw to Storage
  const cites = res.citations.map(c => ({ ...c, category: categorize(c.domain, org) }));
  await saveCitations(responseId, cites); await saveFanout(responseId, res.fanOutQueries);

  const brand = await getBrand(run.orgId), comps = await getCompetitors(run.orgId);
  const spans = analyzer.detectMentions(res.text, brand, comps);
  const ents = await analyzer.extractEntities(res.text);          // rank + unknown entities
  const sent = spans.some(s => s.entityId === brand.id)
      ? await analyzer.judgeSentiment(sentencesAround(res.text, spans, brand), brand) : null;
  await saveMentions(responseId, merge(spans, ents, sent));
  await upsertDaily(run, score(res, spans, ents, sent, cites));   // visibility_daily
}

function observationScore(m: boolean, pos: number, ownedCited: boolean, sent: number) {
  if (!m) return 0;
  const sentFactor = 0.5 + 0.25 * (sent + 1);
  return (0.55 + 0.25 * pos + 0.20 * (ownedCited ? 1 : 0)) * sentFactor;
}

// CI for the fixed-panel visibility rate over a window
function visibilityCI(cells: Array<{ runs: number; mentioned: number }>) {
  const M = cells.length;
  const pHat = cells.map(c => c.mentioned / c.runs);
  const V = pHat.reduce((a, b) => a + b, 0) / M;
  let varSum = 0;
  cells.forEach((c, i) => { if (c.runs >= 2) varSum += pHat[i] * (1 - pHat[i]) / (c.runs - 1); });
  const se = Math.sqrt(varSum) / M;
  return { V, lo: Math.max(0, V - 1.96 * se), hi: Math.min(1, V + 1.96 * se) };
}
```

---

## 9. Verification checklist for the first adapter spike (items tagged [V?]/[K])

1. OpenAI: current model IDs and prices (gpt-5.4 family), `web_search` tool GA vs preview pricing, `url_citation` fields, `include` sources, rate limits by tier; confirm Batch API supports `/v1/responses` with the `web_search` tool and what is discounted.
2. Perplexity Agent API: request body (preset vs model), `web_search` tool params (country/user location, `search_type`), exact response fields for citations/search_results, price per preset, rate limits.
3. Gemini: exact current Flash model ID and price, grounding billing unit (prompt vs query), whether any country parameter exists for Search grounding, grounding rate limits per tier, redirect resolution behavior.
4. Anthropic: current `web_search_*` tool version string, current model IDs/prices (Haiku 4.5, Sonnet-class), web search inside Message Batches, rate-limit table.
5. DataForSEO: Standard/Priority/Live prices for Organic SERP with `load_async_ai_overview`, AI Mode response schema (`ai_overview_element`, `references` field names), pingback support, concurrency caps, LLM Mentions price conflict, minimum top-up.
6. Cloudflare: exact GraphQL field names for AI crawler analytics, retention and query-window limits per plan, detection-ID availability by plan.
7. Crawler UA strings and IP-list URLs from each vendor's docs.
8. Reproduce the section 5 cost table with real token usage from 20 prompts per engine; replace assumptions with measured `usage` and invoice totals.

## 10. Open decisions for the lead / user

1. **Budget reality check:** accept about $1.9k/month fleet COGS (B-hybrid, 20 clients x 100 prompts) versus PLAN.md's $50-200? Cheaper alternatives: Lean scenario A at about $1.1k, or fewer engines on lower plans.
2. **DataForSEO LLM Scraper** (consumer-UI fidelity for ChatGPT/Gemini at about $0.0012-0.004/page) is excluded by the "no scraping of consumer UIs" decision. It would raise fidelity versus the API proxies and is cheap; user should explicitly confirm or reject it.
3. **Perplexity naming:** update PLAN.md ("Perplexity Sonar" to "Perplexity Agent API").
4. **Engine weights `λ`** and the visibility score constants (0.55/0.25/0.20, sentiment factor) are defaults for the product owner to tune; metric version is stored so history can be recomputed.
5. **Platform-level vs per-client vendor keys:** recommended platform-level keys with per-client cost allocation (section 4.1); per-client keys only if a client demands cost pass-through.

## Sources consulted (via WebSearch, 2026-11-24)

- DataForSEO pricing and docs: https://dataforseo.com/pricing/serp/google-ai-mode-serp-api, https://docs.dataforseo.com/v3/serp/google/ai_mode/overview/, https://docs.dataforseo.com/v3/serp/google/organic/overview/, https://dataforseo.com/update/ai-overview-in-google-serp-api, https://dataforseo.com/pricing/ai-optimization/llm-responses, https://dataforseo.com/pricing/ai-optimization/llm-scraper, https://dataforseo.com/pricing/ai-optimization/llm-mentions, https://dataforseo.com/help-center/llm-mentions-api-subscription-explained
- OpenAI: https://developers.openai.com/api/docs/pricing, https://developers.openai.com/api/docs/guides/tools-web-search, https://openai.com/index/introducing-gpt-5-4-mini-and-nano/, https://community.openai.com/t/web-search-pricing-for-reasoning-models/1377274
- Perplexity: https://docs.perplexity.ai/docs/getting-started/pricing.md, https://docs.perplexity.ai/docs/resources/changelog, https://llmgateway.io/blog/perplexity-sonar-api-retirement, https://www.truefoundry.com/docs/change-announcements/perplexity-agent-api-migration
- Gemini: https://ai.google.dev/gemini-api/docs/pricing, https://docs.cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-search, https://firebase.google.com/docs/ai-logic/grounding-google-search
- Anthropic: https://platform.claude.com/docs/en/about-claude/pricing, https://claude.com/blog/web-search-api, https://platform.claude.com/docs/en/api/rate-limits.md
- xAI: https://docs.x.ai/developers/pricing
- Cloudflare: https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api, https://developers.cloudflare.com/ai-crawl-control/reference/bots, https://developers.cloudflare.com/ai-crawl-control/features/analyze-ai-traffic
- Crawlers: https://www.searchenginejournal.com/ai-crawler-user-agents-list/, https://help.otterly.ai/ai-crawlers
- Variance: https://www.searchenginejournal.com/ai-recommendations-change-with-nearly-every-query-sparktoro/566242, https://searchengineland.com/repeated-chatgpt-runs-brand-visibility-468552, https://www.conductor.com/academy/ai-recommendation-consistency-analysis/
- llms.txt: https://www.searchenginejournal.com/llms-txt-shows-no-clear-effect-on-ai-citations-based-on-300k-domains/561542/, https://searchatlas.com/blog/limits-of-llms-txt-for-ai-search-citation-study/
