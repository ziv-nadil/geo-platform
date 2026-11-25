/**
 * Metric glossary. Every number in the dashboard links to one of these through
 * <MetricHelp id="..." />, which renders the "?" tooltip with a definition and formula.
 */
export interface MetricDef {
  label: string;
  definition: string;
  formula: string;
  note?: string;
}

export const METRICS = {
  gapScore: {
    label: "Gap score",
    definition: "How much a content gap is worth closing: prompts where competitors appear in AI answers and you don't, weighted by how much the prompt matters and how authoritative the cited sources are.",
    formula: "Σ over gap prompts of importance × competitor presence × source authority",
    note: "Higher is better to fix first. Recomputed from the last 30 days of runs whenever you detect gaps.",
  },
  gapImportance: {
    label: "Prompt importance",
    definition: "The importance you set on the prompts in this group, from 1 (default) upward. Prompts you mark as business-critical count for more in the gap score.",
    formula: "mean prompts.importance across the group's gap prompts",
  },
  gapPresence: {
    label: "Competitor presence",
    definition: "How consistently competitors win these prompts: the share of runs where a competitor is mentioned or cited, plus 0.1 for each extra competitor (up to +0.5).",
    formula: "runs with a competitor ÷ runs + 0.1 × (distinct competitors − 1), max 1.5",
  },
  gapAuthority: {
    label: "Source authority",
    definition: "How authoritative the domains AI engines cite for these prompts are, by source type (institutional and reference highest, social lowest). Neutral 0.4 when nothing is cited.",
    formula: "citation-weighted mean of domain authority (0–1)",
  },
  visibility: {
    label: "Visibility score",
    definition: "How prominently AI engines feature your brand across the answers to your tracked prompts. Each answer is scored on whether your brand is mentioned, how early it appears, and whether a page of yours is cited.",
    formula: "mean of each answer's visibility score (0–1; mention, position and citation of your brand) × 100",
    note: "Only analyzed answers are scored. \"Mentioned in\" shows the simpler share of answers that name the brand.",
  },
  shareOfVoice: {
    label: "Share of voice",
    definition: "Your share of all brand mentions, yours plus tracked competitors, across AI answers.",
    formula: "your mentions ÷ (your mentions + competitor mentions) × 100",
  },
  citationShare: {
    label: "Citation share",
    definition: "How often AI engines cite a page on your domains as a source.",
    formula: "citations to your domains ÷ all citations in answers × 100",
  },
  avgPosition: {
    label: "Average position",
    definition: "The position your brand takes in the list of brands named in an answer. 1 means your brand is named first; 2 means second, and so on.",
    formula: "mean rank of the brand in answers that mention it (lower is better)",
  },
  sentiment: {
    label: "Net sentiment",
    definition: "The tone of answers that mention your brand, from −100 (every mention negative) to +100 (every mention positive). 0 means positive and negative mentions balance out.",
    formula: "% positive mentions − % negative mentions",
    note: "Each mention is classified positive, neutral or negative by an LLM judge.",
  },
  mentions: {
    label: "Mentions",
    definition: "Number of AI answers that name your brand.",
    formula: "count of answers with ≥ 1 brand mention",
  },
  answers: {
    label: "Answers collected",
    definition: "AI answers gathered for your tracked prompts in the selected range.",
    formula: "prompts × engines × runs",
  },
  promptVisibility: {
    label: "Prompt visibility",
    definition: "Share of engines and runs where this prompt's answer mentions your brand.",
    formula: "answers for this prompt that mention the brand ÷ answers for this prompt × 100",
  },
  promptVolume: {
    label: "Est. volume",
    definition: "Estimated average monthly Google searches for the closest keyword to this prompt. A rough demand signal, not a count of AI prompts.",
    formula: "keyword volume from Google Ads Keyword Planner / DataForSEO, rounded",
  },
  movers: {
    label: "Top movers",
    definition: "Prompts whose visibility changed most versus the previous period of equal length.",
    formula: "visibility (this period) − visibility (previous period), in points",
  },
  headToHead: {
    label: "Head-to-head win rate",
    definition: "Of the answers that mention both brands, how often you are named before the competitor.",
    formula: "answers where you rank above competitor ÷ answers mentioning both × 100",
  },
  sourceType: {
    label: "Source type",
    definition: "What kind of site a cited page is: your own, a competitor's, editorial, UGC/forum, reference, review or social.",
    formula: "classified by domain rules plus your source tags",
  },
  domainCitations: {
    label: "Citations",
    definition: "How many AI answers cited a page on this domain.",
    formula: "count of answers listing ≥ 1 URL on the domain",
  },
  domainInfluence: {
    label: "Answers influenced",
    definition: "Share of all answers in range that cite this domain.",
    formula: "answers citing the domain ÷ all answers × 100",
  },
  healthScore: {
    label: "Site health score",
    definition: "How crawlable and AI-readable your site is, weighted by issue severity.",
    formula: "100 − (critical × 5 + warning × 2 + notice × 0.5) per 100 pages, floored at 0",
  },
  crawlerHits: {
    label: "AI crawler hits",
    definition: "Requests to your site from known AI crawlers (such as GPTBot or ClaudeBot), counted only when the caller is verified by reverse DNS or a published IP range.",
    formula: "count of verified requests from the edge logs (Cloudflare / CDN)",
  },
  llmsTxt: {
    label: "llms.txt",
    definition: "A markdown file at /llms.txt that lists your most important pages for language models.",
    formula: "checked daily: reachable (200), valid markdown, links resolve",
  },
  onboarding: {
    label: "Onboarding progress",
    definition: "Share of onboarding steps that are complete and pass their live tests.",
    formula: "(steps passed + 0.5 × steps partial) ÷ required steps × 100",
  },
  mrr: {
    label: "MRR",
    definition: "Monthly recurring revenue from the account's active subscription.",
    formula: "plan price × seats, normalized to one month",
  },
  creatorReach: {
    label: "Reach",
    definition: "Subscribers or followers on the creator's channel.",
    formula: "latest public count from the platform API",
  },
  creatorRelevance: {
    label: "Relevance",
    definition: "How closely the creator's recent videos match your tracked topics.",
    formula: "semantic similarity of recent titles and transcripts to your topics, 0–100",
  },
} satisfies Record<string, MetricDef>;

export type MetricId = keyof typeof METRICS;
