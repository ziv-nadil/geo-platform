import { CATALOG, DOMAIN_POOLS } from "./catalog";
import { ENGINE_IDS } from "./engines";
import { between, daysBack, hashString, mulberry32, pick, type Rng } from "./rng";
import type { Citation, Competitor, EngineId, Prompt, Run, Sentiment } from "./types";

/** Days of history generated per org. The UI exposes up to 30, the rest feeds "previous period" deltas. */
export const HISTORY_DAYS = 60;

const ENGINE_FACTOR: Record<EngineId, number> = {
  chatgpt: 1.0,
  perplexity: 1.12,
  gemini: 0.86,
  claude: 0.94,
  google_aio: 0.74,
};

const CITES_PER_ANSWER: Record<EngineId, [number, number]> = {
  chatgpt: [2, 6],
  perplexity: [4, 8],
  gemini: [2, 5],
  claude: [1, 4],
  google_aio: [3, 6],
};

export interface OrgDataset {
  prompts: Prompt[];
  promptStrength: Map<string, number>;
  brand: Competitor;
  competitors: Competitor[];
  runs: Run[];
  byDate: Map<string, Run[]>;
  dates: string[];
}

const cache = new Map<string, OrgDataset>();

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildCitationPool(orgId: string) {
  const cat = CATALOG[orgId]!;
  const pool = DOMAIN_POOLS[orgId] ?? [];
  const thirdParty: { c: Citation; w: number }[] = [];
  for (const d of pool) {
    for (const title of d.titles) {
      thirdParty.push({ c: { url: `https://${d.domain}/${slugify(title)}`, domain: d.domain, type: d.type, title }, w: d.weight / d.titles.length });
    }
  }
  const owned: Citation[] = cat.ownedPaths.map((p) => ({
    url: `https://www.${cat.brand.domain}${p}`,
    domain: cat.brand.domain,
    type: "owned",
    title: p === "/" ? cat.brand.name : `${cat.brand.name} · ${p.split("/").filter(Boolean).pop()!.replace(/-/g, " ")}`,
  }));
  const competitorCites = new Map<string, Citation[]>();
  for (const c of cat.competitors) {
    competitorCites.set(
      c.id,
      ["/", "/pricing", "/blog/guide", "/compare"].map((p) => ({
        url: `https://${c.domain}${p}`,
        domain: c.domain,
        type: "competitor" as const,
        title: p === "/" ? c.name : `${c.name} · ${p.slice(1).replace(/\//g, " ")}`,
      })),
    );
  }
  const totalW = thirdParty.reduce((s, x) => s + x.w, 0);
  return {
    owned,
    competitorCites,
    pickThirdParty(rng: Rng): Citation {
      let r = rng() * totalW;
      for (const x of thirdParty) {
        r -= x.w;
        if (r <= 0) return x.c;
      }
      return thirdParty[thirdParty.length - 1]!.c;
    },
  };
}

function sentimentFor(rng: Rng, engine: EngineId, strength: number): Sentiment {
  const negBias = engine === "google_aio" ? 0.14 : engine === "gemini" ? 0.11 : 0.07;
  const r = rng();
  if (r < negBias * (1.2 - strength * 0.5)) return "negative";
  if (r < 0.36) return "neutral";
  return "positive";
}

export function getDataset(orgId: string): OrgDataset | null {
  const hit = cache.get(orgId);
  if (hit) return hit;
  const cat = CATALOG[orgId];
  if (!cat) return null;

  const rng = mulberry32(hashString(orgId));
  const dates = daysBack(HISTORY_DAYS);
  const prompts: Prompt[] = cat.prompts.map((p, i) => ({
    id: `${orgId.slice(4, 6)}p${String(i + 1).padStart(2, "0")}`,
    text: p.text,
    topic: p.topic,
    persona: p.persona,
    funnel: p.funnel,
    tags: [p.funnel === "decision" ? "BOFU" : p.funnel === "consideration" ? "MOFU" : "TOFU", ...(p.text.includes(cat.brand.name.split(" ")[0]!) ? ["Branded"] : [])],
    volume: Math.round((between(rng, 0.2, 1) * (p.funnel === "awareness" ? 9000 : p.funnel === "consideration" ? 4200 : 1600)) / 10) * 10,
    createdAt: dates[Math.floor(rng() * 6)]!,
    source: i % 7 === 3 ? "discovery" : i % 5 === 1 ? "import" : "manual",
  }));
  const promptStrength = new Map(prompts.map((p, i) => [p.id, cat.prompts[i]!.strength]));
  const pool = buildCitationPool(orgId);
  const runs: Run[] = [];
  const byDate = new Map<string, Run[]>();

  dates.forEach((date, di) => {
    const t = di / (dates.length - 1);
    const dayRuns: Run[] = [];
    // A content launch two weeks ago lifts visibility on ChatGPT and Perplexity.
    const launchLift = di > HISTORY_DAYS - 15 ? 0.08 : 0;
    for (const p of prompts) {
      const base = promptStrength.get(p.id)!;
      // Per-prompt drift: some prompts gain, a few lose ground to competitors over the period.
      const drift = ((hashString(p.id) % 7) - 2) * 0.05 * t;
      for (const engine of ENGINE_IDS) {
        const ef = ENGINE_FACTOR[engine];
        const lift = engine === "chatgpt" || engine === "perplexity" ? launchLift : launchLift / 3;
        const pBrand = Math.min(0.97, Math.max(0.02, base * ef * (0.82 + 0.28 * t) + drift + lift + (rng() - 0.5) * 0.12));
        const mentioned = rng() < pBrand;

        const named: { id: string; score: number }[] = [];
        if (mentioned) named.push({ id: "brand", score: base + rng() * 0.55 });
        for (const c of cat.competitors) {
          const pc = Math.min(0.92, c.strength * ef * (1.05 - 0.12 * t) * (1.15 - base * 0.4));
          if (rng() < pc) named.push({ id: c.id, score: c.strength + rng() * 0.55 });
        }
        named.sort((a, b) => b.score - a.score);
        const position = mentioned ? named.findIndex((n) => n.id === "brand") + 1 : null;

        const [cmin, cmax] = CITES_PER_ANSWER[engine];
        const nCites = Math.round(between(rng, cmin, cmax));
        const citations: Citation[] = [];
        const seen = new Set<string>();
        const push = (c: Citation) => {
          if (!seen.has(c.url)) {
            seen.add(c.url);
            citations.push(c);
          }
        };
        if (rng() < (mentioned ? 0.55 : 0.12) * ef) push(pick(rng, pool.owned));
        for (const n of named) {
          if (n.id !== "brand" && rng() < 0.25) push(pick(rng, pool.competitorCites.get(n.id)!));
        }
        while (citations.length < nCites) push(pool.pickThirdParty(rng));

        const run: Run = {
          date,
          promptId: p.id,
          engine,
          mentioned,
          position,
          sentiment: mentioned ? sentimentFor(rng, engine, base) : null,
          competitors: named.map((n, i) => ({ id: n.id, position: i + 1 })).filter((n) => n.id !== "brand"),
          citations,
        };
        dayRuns.push(run);
        runs.push(run);
      }
    }
    byDate.set(date, dayRuns);
  });

  const ds: OrgDataset = {
    prompts,
    promptStrength,
    brand: cat.brand,
    competitors: cat.competitors.map(({ strength: _s, ...c }) => {
      void _s;
      return c;
    }),
    runs,
    byDate,
    dates,
  };
  cache.set(orgId, ds);
  return ds;
}

const BRAND_BLURBS: Record<string, Record<Sentiment, string[]>> = {
  org_northwind: {
    positive: [
      "is praised for running directly on your warehouse, so data never leaves Snowflake or BigQuery",
      "stands out for transparent per-seat pricing and fast setup for B2B SaaS teams",
      "gets strong reviews for funnel and retention analysis that product managers can use without SQL",
    ],
    neutral: [
      "offers funnels, retention, session replay and experimentation in one product",
      "is a warehouse-native product analytics platform aimed at mid-market SaaS",
    ],
    negative: [
      "is newer than some alternatives, and a few reviewers mention a smaller integration catalogue",
      "can require a data engineer to model events before non-technical users get value",
    ],
  },
  org_fernhill: {
    positive: [
      "is known for resoleable boots and a lifetime repair programme",
      "is a B Corp certified brand praised for PFC-free waterproofing that holds up in UK weather",
      "gets excellent reviews for comfortable fits, including wide sizes",
    ],
    neutral: [
      "sells boots, tents and waterproofs online with free returns in the UK",
      "is a British outdoor brand focused on durable, repairable gear",
    ],
    negative: [
      "is more expensive than budget options, and some sizes sell out quickly",
      "has a smaller tent range than the bigger outdoor retailers",
    ],
  },
};

const COMPETITOR_BLURBS = [
  "is a popular choice with a large community and many integrations",
  "is often recommended for its free tier",
  "is a solid option, especially for larger teams",
  "is frequently mentioned in comparisons and reviews",
  "is a well-known alternative with good documentation",
];

/** Compose a realistic answer for display. Deterministic for the same run. */
export function composeAnswer(orgId: string, run: Run, prompt: Prompt): { text: string; brandsInOrder: string[] } {
  const ds = getDataset(orgId)!;
  const rng = mulberry32(hashString(`${run.date}|${run.promptId}|${run.engine}`));
  const names = new Map<string, string>([["brand", ds.brand.name], ...ds.competitors.map((c) => [c.id, c.name] as [string, string])]);
  const ordered: { id: string; position: number }[] = [...run.competitors];
  if (run.mentioned && run.position) ordered.push({ id: "brand", position: run.position });
  ordered.sort((a, b) => a.position - b.position);
  const brandsInOrder = ordered.map((o) => names.get(o.id)!);

  const intro = pick(rng, [
    `Here are the options most often recommended for "${prompt.text.replace(/\?$/, "")}":`,
    `It depends on your needs, but these are the strongest choices right now:`,
    `Based on recent reviews and comparisons, consider the following:`,
  ]);
  const lines = ordered.map((o, i) => {
    const cite = run.citations.length ? ` [${(i % run.citations.length) + 1}]` : "";
    if (o.id === "brand") {
      const blurb = pick(rng, BRAND_BLURBS[orgId]?.[run.sentiment ?? "neutral"] ?? ["is a good option"]);
      return `${i + 1}. ${ds.brand.name} ${blurb}.${cite}`;
    }
    return `${i + 1}. ${names.get(o.id)} ${pick(rng, COMPETITOR_BLURBS)}.${cite}`;
  });
  const outro = ordered.length
    ? pick(rng, [
        "If you share your budget and team size, I can narrow this down further.",
        "Try two of these side by side before you commit.",
        "Check recent reviews, because features and pricing change often.",
      ])
    : "There is no single best answer. Look for well-reviewed specialist providers and compare their pricing and support.";
  return { text: [intro, "", ...lines, "", outro].join("\n"), brandsInOrder };
}
