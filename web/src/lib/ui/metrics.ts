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
  visibility: {
    label: "Visibility score",
    definition: "How often AI engines mention your brand when answering the prompts you track.",
    formula: "answers that mention the brand ÷ all answers collected × 100",
    note: "Counted per prompt × engine × run in the selected date range.",
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
    definition: "Where your brand appears among the brands named in an answer. 1 means named first.",
    formula: "mean rank of the brand in answers that mention it (lower is better)",
  },
  sentiment: {
    label: "Net sentiment",
    definition: "Tone of the answers that mention your brand, from −100 (all negative) to +100 (all positive).",
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
    definition: "Estimated monthly searches for the closest keyword equivalent of this prompt.",
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
    definition: "Requests from known AI crawlers and AI user agents, verified by reverse DNS or published IP ranges.",
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
    formula: "plan price × seats, normalised to one month",
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
