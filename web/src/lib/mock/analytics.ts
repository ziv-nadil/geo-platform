import { ENGINE_IDS } from "./engines";
import { composeAnswer, getDataset, type OrgDataset } from "./generate";
import { hashString, mulberry32, pick, TODAY } from "./rng";
import type {
  Competitor,
  DiscoverySuggestion,
  DomainStat,
  EngineAnswer,
  EngineId,
  Filters,
  KpiSet,
  Mover,
  PromptRow,
  Run,
  SentimentTheme,
  SourceTag,
  SourceType,
  TrendPoint,
  UrlStat,
} from "./types";

/* ------------------------------------------------------------------ helpers */

const r1 = (n: number) => Math.round(n * 10) / 10;

function windowDates(ds: OrgDataset, range: number, offset = 0): string[] {
  const end = ds.dates.length - offset * range;
  return ds.dates.slice(Math.max(0, end - range), end);
}

function runsFor(ds: OrgDataset, f: Filters, offset = 0, extra?: (r: Run) => boolean): Run[] {
  const out: Run[] = [];
  for (const d of windowDates(ds, f.range, offset)) {
    for (const r of ds.byDate.get(d) ?? []) {
      if (f.engine !== "all" && r.engine !== f.engine) continue;
      if (extra && !extra(r)) continue;
      out.push(r);
    }
  }
  return out;
}

interface Agg {
  answers: number;
  mentions: number;
  visibility: number;
  sov: number;
  citationShare: number;
  avgPosition: number;
  sentiment: number;
}

function aggregate(runs: Run[]): Agg {
  let mentions = 0,
    compMentions = 0,
    posSum = 0,
    posN = 0,
    owned = 0,
    cites = 0,
    pos = 0,
    neg = 0;
  for (const r of runs) {
    if (r.mentioned) {
      mentions++;
      if (r.position) {
        posSum += r.position;
        posN++;
      }
      if (r.sentiment === "positive") pos++;
      else if (r.sentiment === "negative") neg++;
    }
    compMentions += r.competitors.length;
    for (const c of r.citations) {
      cites++;
      if (c.type === "owned") owned++;
    }
  }
  return {
    answers: runs.length,
    mentions,
    visibility: runs.length ? (mentions / runs.length) * 100 : 0,
    sov: mentions + compMentions ? (mentions / (mentions + compMentions)) * 100 : 0,
    citationShare: cites ? (owned / cites) * 100 : 0,
    avgPosition: posN ? posSum / posN : 0,
    sentiment: mentions ? ((pos - neg) / mentions) * 100 : 0,
  };
}

function need(orgId: string): OrgDataset {
  const ds = getDataset(orgId);
  if (!ds) throw new Error(`No demo dataset for ${orgId}`);
  return ds;
}

export function hasDataset(orgId: string) {
  return getDataset(orgId) !== null;
}

/* ------------------------------------------------------------------ overview */

export async function getKpis(orgId: string, f: Filters): Promise<KpiSet> {
  const ds = need(orgId);
  const cur = aggregate(runsFor(ds, f));
  const prev = aggregate(runsFor(ds, f, 1));
  const daily = windowDates(ds, f.range).map((d) => aggregate((ds.byDate.get(d) ?? []).filter((r) => f.engine === "all" || r.engine === f.engine)));
  return {
    visibility: r1(cur.visibility),
    visibilityPrev: r1(prev.visibility),
    shareOfVoice: r1(cur.sov),
    shareOfVoicePrev: r1(prev.sov),
    citationShare: r1(cur.citationShare),
    citationSharePrev: r1(prev.citationShare),
    avgPosition: r1(cur.avgPosition),
    avgPositionPrev: r1(prev.avgPosition),
    sentiment: Math.round(cur.sentiment),
    sentimentPrev: Math.round(prev.sentiment),
    answers: cur.answers,
    mentions: cur.mentions,
    sparkVisibility: daily.map((a) => r1(a.visibility)),
    sparkSov: daily.map((a) => r1(a.sov)),
    sparkCitation: daily.map((a) => r1(a.citationShare)),
    sparkPosition: daily.map((a) => r1(a.avgPosition)),
    sparkSentiment: daily.map((a) => Math.round(a.sentiment)),
  };
}

/** Daily visibility per engine (and overall) — the main trend chart. */
export async function getVisibilityTrend(orgId: string, f: Filters): Promise<TrendPoint[]> {
  const ds = need(orgId);
  // Trailing 3-day window per point smooths day-to-day sampling noise (40 prompts per engine per day).
  return windowDates(ds, f.range).map((date) => {
    const idx = ds.dates.indexOf(date);
    const day = ds.dates.slice(Math.max(0, idx - 2), idx + 1).flatMap((d) => ds.byDate.get(d) ?? []);
    const point: TrendPoint = { date };
    for (const e of ENGINE_IDS) {
      if (f.engine !== "all" && e !== f.engine) continue;
      point[e] = r1(aggregate(day.filter((r) => r.engine === e)).visibility);
    }
    point.all = r1(aggregate(day.filter((r) => f.engine === "all" || r.engine === f.engine)).visibility);
    return point;
  });
}

export async function getEngineBreakdown(orgId: string, f: Filters) {
  const ds = need(orgId);
  return ENGINE_IDS.map((engine) => {
    const cur = aggregate(runsFor(ds, { ...f, engine }));
    const prev = aggregate(runsFor(ds, { ...f, engine }, 1));
    return {
      engine,
      visibility: r1(cur.visibility),
      delta: r1(cur.visibility - prev.visibility),
      sov: r1(cur.sov),
      avgPosition: r1(cur.avgPosition),
      sentiment: Math.round(cur.sentiment),
      citationShare: r1(cur.citationShare),
    };
  });
}

export async function getTopMovers(orgId: string, f: Filters, n = 5): Promise<{ up: Mover[]; down: Mover[] }> {
  const ds = need(orgId);
  const cur = runsFor(ds, f);
  const prev = runsFor(ds, f, 1);
  const vis = (runs: Run[]) => {
    const m = new Map<string, [number, number]>();
    for (const r of runs) {
      const v = m.get(r.promptId) ?? [0, 0];
      v[0] += r.mentioned ? 1 : 0;
      v[1]++;
      m.set(r.promptId, v);
    }
    return m;
  };
  const a = vis(cur);
  const b = vis(prev);
  const movers: Mover[] = ds.prompts.map((p) => {
    const [cm, ct] = a.get(p.id) ?? [0, 1];
    const [pm, pt] = b.get(p.id) ?? [0, 1];
    const current = (cm / ct) * 100;
    const previous = (pm / pt) * 100;
    return { promptId: p.id, text: p.text, topic: p.topic, current: r1(current), previous: r1(previous), delta: r1(current - previous) };
  });
  movers.sort((x, y) => y.delta - x.delta);
  return { up: movers.slice(0, n).filter((m) => m.delta > 0), down: movers.slice(-n).reverse().filter((m) => m.delta < 0) };
}

/* ------------------------------------------------------------------ competitors */

export interface SovRow extends Competitor {
  sov: number;
  sovPrev: number;
  mentions: number;
  visibility: number;
  avgPosition: number;
}

export async function getCompetitors(orgId: string): Promise<Competitor[]> {
  const ds = need(orgId);
  return ds.competitors;
}

export async function getShareOfVoice(orgId: string, f: Filters): Promise<SovRow[]> {
  const ds = need(orgId);
  const calc = (runs: Run[]) => {
    const m = new Map<string, { mentions: number; pos: number }>();
    let total = 0;
    for (const r of runs) {
      if (r.mentioned) {
        const v = m.get("brand") ?? { mentions: 0, pos: 0 };
        v.mentions++;
        v.pos += r.position ?? 0;
        m.set("brand", v);
        total++;
      }
      for (const c of r.competitors) {
        const v = m.get(c.id) ?? { mentions: 0, pos: 0 };
        v.mentions++;
        v.pos += c.position;
        m.set(c.id, v);
        total++;
      }
    }
    return { m, total, answers: runs.length };
  };
  const cur = calc(runsFor(ds, f));
  const prev = calc(runsFor(ds, f, 1));
  return [ds.brand, ...ds.competitors]
    .map((c) => {
      const v = cur.m.get(c.id) ?? { mentions: 0, pos: 0 };
      const pv = prev.m.get(c.id) ?? { mentions: 0, pos: 0 };
      return {
        ...c,
        mentions: v.mentions,
        sov: r1((v.mentions / Math.max(1, cur.total)) * 100),
        sovPrev: r1((pv.mentions / Math.max(1, prev.total)) * 100),
        visibility: r1((v.mentions / Math.max(1, cur.answers)) * 100),
        avgPosition: v.mentions ? r1(v.pos / v.mentions) : 0,
      };
    })
    .sort((a, b) => b.sov - a.sov);
}

export async function getSovTrend(orgId: string, f: Filters): Promise<TrendPoint[]> {
  const ds = need(orgId);
  return windowDates(ds, f.range).map((date) => {
    const day = (ds.byDate.get(date) ?? []).filter((r) => f.engine === "all" || r.engine === f.engine);
    const counts = new Map<string, number>();
    let total = 0;
    for (const r of day) {
      if (r.mentioned) {
        counts.set("brand", (counts.get("brand") ?? 0) + 1);
        total++;
      }
      for (const c of r.competitors) {
        counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
        total++;
      }
    }
    const point: TrendPoint = { date };
    for (const c of [ds.brand, ...ds.competitors]) point[c.id] = r1(((counts.get(c.id) ?? 0) / Math.max(1, total)) * 100);
    return point;
  });
}

export async function getHeadToHead(orgId: string, competitorId: string, f: Filters) {
  const ds = need(orgId);
  const runs = runsFor(ds, f);
  let both = 0,
    wins = 0,
    brandOnly = 0,
    compOnly = 0,
    neither = 0;
  const byEngine = new Map<EngineId, { both: number; wins: number }>();
  const byTopic = new Map<string, { both: number; wins: number; brand: number; comp: number }>();
  const topicOf = new Map(ds.prompts.map((p) => [p.id, p.topic]));
  for (const r of runs) {
    const c = r.competitors.find((x) => x.id === competitorId);
    const t = topicOf.get(r.promptId)!;
    const tv = byTopic.get(t) ?? { both: 0, wins: 0, brand: 0, comp: 0 };
    if (r.mentioned) tv.brand++;
    if (c) tv.comp++;
    if (r.mentioned && c) {
      both++;
      tv.both++;
      const ev = byEngine.get(r.engine) ?? { both: 0, wins: 0 };
      ev.both++;
      if ((r.position ?? 99) < c.position) {
        wins++;
        tv.wins++;
        ev.wins++;
      }
      byEngine.set(r.engine, ev);
    } else if (r.mentioned) brandOnly++;
    else if (c) compOnly++;
    else neither++;
    byTopic.set(t, tv);
  }
  return {
    answers: runs.length,
    both,
    winRate: both ? r1((wins / both) * 100) : 0,
    brandOnly,
    compOnly,
    neither,
    byEngine: ENGINE_IDS.map((e) => {
      const v = byEngine.get(e) ?? { both: 0, wins: 0 };
      return { engine: e, both: v.both, winRate: v.both ? r1((v.wins / v.both) * 100) : 0 };
    }),
    byTopic: [...byTopic.entries()].map(([topic, v]) => ({
      topic,
      brand: v.brand,
      comp: v.comp,
      winRate: v.both ? r1((v.wins / v.both) * 100) : 0,
    })),
  };
}

/* ------------------------------------------------------------------ prompts */

export async function getPrompts(orgId: string, f: Filters): Promise<PromptRow[]> {
  const ds = need(orgId);
  const cur = runsFor(ds, f);
  const prev = runsFor(ds, f, 1);
  const group = (runs: Run[]) => {
    const m = new Map<string, Run[]>();
    for (const r of runs) {
      const arr = m.get(r.promptId) ?? [];
      arr.push(r);
      m.set(r.promptId, arr);
    }
    return m;
  };
  const gc = group(cur);
  const gp = group(prev);
  const names = new Map(ds.competitors.map((c) => [c.id, c.name]));
  return ds.prompts.map((p) => {
    const runs = gc.get(p.id) ?? [];
    const a = aggregate(runs);
    const pa = aggregate(gp.get(p.id) ?? []);
    const byEngine = Object.fromEntries(
      ENGINE_IDS.map((e) => [e, r1(aggregate(runs.filter((r) => r.engine === e)).visibility)]),
    ) as Record<EngineId, number>;
    const compCount = new Map<string, number>();
    let citations = 0;
    for (const r of runs) {
      citations += r.citations.length;
      for (const c of r.competitors) compCount.set(c.id, (compCount.get(c.id) ?? 0) + 1);
    }
    const top = [...compCount.entries()].sort((x, y) => y[1] - x[1])[0];
    return {
      ...p,
      visibility: r1(a.visibility),
      visibilityPrev: r1(pa.visibility),
      avgPosition: a.avgPosition ? r1(a.avgPosition) : null,
      sentiment: Math.round(a.sentiment),
      byEngine,
      topCompetitor: top ? names.get(top[0]) ?? null : null,
      citations,
    };
  });
}

export async function getPromptDetail(orgId: string, promptId: string, f: Filters) {
  const ds = need(orgId);
  const prompt = ds.prompts.find((p) => p.id === promptId);
  if (!prompt) return null;
  const rows = await getPrompts(orgId, f);
  const row = rows.find((r) => r.id === promptId)!;
  const latestDate = ds.dates[ds.dates.length - 1]!;
  const latest = (ds.byDate.get(latestDate) ?? []).filter((r) => r.promptId === promptId);
  const answers: EngineAnswer[] = latest.map((run) => {
    const { text, brandsInOrder } = composeAnswer(orgId, run, prompt);
    return {
      engine: run.engine,
      date: run.date,
      text,
      mentioned: run.mentioned,
      position: run.position,
      sentiment: run.sentiment,
      brandsInOrder,
      citations: run.citations,
    };
  });
  const trend: TrendPoint[] = windowDates(ds, f.range).map((date) => {
    const day = (ds.byDate.get(date) ?? []).filter((r) => r.promptId === promptId);
    const point: TrendPoint = { date };
    for (const e of ENGINE_IDS) point[e] = day.find((r) => r.engine === e)?.mentioned ? 1 : 0;
    point.all = r1((day.filter((r) => r.mentioned).length / Math.max(1, day.length)) * 100);
    return point;
  });
  const sources = new Map<string, { c: (typeof latest)[number]["citations"][number]; n: number }>();
  for (const r of runsFor(ds, f, 0, (x) => x.promptId === promptId)) {
    for (const c of r.citations) {
      const v = sources.get(c.url) ?? { c, n: 0 };
      v.n++;
      sources.set(c.url, v);
    }
  }
  return {
    prompt,
    row,
    answers,
    trend,
    brandName: ds.brand.name,
    competitorNames: ds.competitors.map((c) => c.name),
    topSources: [...sources.values()].sort((a, b) => b.n - a.n).slice(0, 8).map((v) => ({ ...v.c, count: v.n })),
  };
}

export async function getTopics(orgId: string) {
  const ds = need(orgId);
  return {
    topics: [...new Set(ds.prompts.map((p) => p.topic))],
    personas: [...new Set(ds.prompts.map((p) => p.persona))],
  };
}

const DISCOVERY: Record<string, [string, string, number][]> = {
  org_northwind: [
    ["Which product analytics tools work without a JavaScript SDK?", "Warehouse-native", 0.61],
    ["Best analytics tool for a Series A SaaS company", "Product analytics", 0.55],
    ["How to measure time to value in onboarding", "Product analytics", 0.32],
    ["Product analytics that supports EU data residency", "Warehouse-native", 0.58],
    ["Cheapest session replay for startups", "Session replay", 0.44],
    ["Lumetric pricing too expensive, what to use instead?", "Pricing & alternatives", 0.72],
    ["How do PMs use AI to analyse user behaviour?", "Product analytics", 0.38],
    ["Experimentation tools that read from Snowflake", "Experimentation", 0.49],
  ],
  org_fernhill: [
    ["Best hiking boots for plantar fasciitis", "Hiking boots", 0.52],
    ["Most durable rain jacket for cycling and hiking", "Rain jackets", 0.47],
    ["Repairable tents with spare parts available", "Tents & shelter", 0.63],
    ["Best walking boots for teenagers", "Hiking boots", 0.35],
    ["Ethical outdoor brands that don't use PFAS", "Sustainability", 0.66],
    ["What to wear for a winter hike in the Peak District", "Rain jackets", 0.41],
    ["Best 3-season tent for Snowdonia", "Tents & shelter", 0.44],
    ["Trailmark boots sizing compared to other brands", "Hiking boots", 0.58],
  ],
};

export async function getDiscoverySuggestions(orgId: string): Promise<DiscoverySuggestion[]> {
  const ds = need(orgId);
  const rng = mulberry32(hashString(`${orgId}-discovery`));
  const personas = [...new Set(ds.prompts.map((p) => p.persona))];
  return (DISCOVERY[orgId] ?? []).map(([text, topic, cv], i) => ({
    id: `${orgId}-d${i}`,
    text,
    topic,
    persona: pick(rng, personas),
    funnel: i % 3 === 0 ? "decision" : i % 3 === 1 ? "consideration" : "awareness",
    volume: Math.round(400 + rng() * 5000),
    competitorVisibility: Math.round(cv * 100),
    reason: pick(rng, [
      "Competitors appear in most answers; you are absent.",
      "Rising query in Google Search Console with AI Overview present.",
      "Asked by your ICP persona in community threads cited by Perplexity.",
      "Close variant of a high-converting tracked prompt.",
    ]),
  }));
}

/* ------------------------------------------------------------------ responses */

export async function getResponses(
  orgId: string,
  f: Filters,
  opts: { mentioned?: "yes" | "no" | "all"; q?: string; limit?: number } = {},
) {
  const ds = need(orgId);
  const promptById = new Map(ds.prompts.map((p) => [p.id, p]));
  const dates = windowDates(ds, f.range).slice(-3).reverse();
  const out: (EngineAnswer & { promptId: string; promptText: string; topic: string })[] = [];
  const q = opts.q?.toLowerCase().trim();
  for (const d of dates) {
    for (const r of ds.byDate.get(d) ?? []) {
      if (f.engine !== "all" && r.engine !== f.engine) continue;
      if (opts.mentioned === "yes" && !r.mentioned) continue;
      if (opts.mentioned === "no" && r.mentioned) continue;
      const p = promptById.get(r.promptId)!;
      if (q && !p.text.toLowerCase().includes(q)) continue;
      const { text, brandsInOrder } = composeAnswer(orgId, r, p);
      out.push({ engine: r.engine, date: r.date, text, mentioned: r.mentioned, position: r.position, sentiment: r.sentiment, brandsInOrder, citations: r.citations, promptId: p.id, promptText: p.text, topic: p.topic });
      if (out.length >= (opts.limit ?? 60)) return { items: out, brandName: ds.brand.name, competitorNames: ds.competitors.map((c) => c.name) };
    }
  }
  return { items: out, brandName: ds.brand.name, competitorNames: ds.competitors.map((c) => c.name) };
}

/* ------------------------------------------------------------------ citations */

export async function getCitationDomains(orgId: string, f: Filters): Promise<DomainStat[]> {
  const ds = need(orgId);
  const runs = runsFor(ds, f);
  const tags = await getSourceTags(orgId);
  const m = new Map<string, { type: SourceType; citations: number; answers: Set<string>; engines: Set<EngineId> }>();
  let total = 0;
  runs.forEach((r, i) => {
    for (const c of r.citations) {
      total++;
      const v = m.get(c.domain) ?? { type: c.type, citations: 0, answers: new Set(), engines: new Set() };
      v.citations++;
      v.answers.add(String(i));
      v.engines.add(r.engine);
      m.set(c.domain, v);
    }
  });
  const dates = windowDates(ds, f.range);
  const buckets = 10;
  const per = Math.max(1, Math.ceil(dates.length / buckets));
  return [...m.entries()]
    .map(([domain, v]) => {
      const trend: number[] = [];
      for (let b = 0; b < dates.length; b += per) {
        let n = 0;
        for (const d of dates.slice(b, b + per)) for (const r of ds.byDate.get(d) ?? []) if (f.engine === "all" || r.engine === f.engine) for (const c of r.citations) if (c.domain === domain) n++;
        trend.push(n);
      }
      return {
        domain,
        type: v.type,
        citations: v.citations,
        share: r1((v.citations / Math.max(1, total)) * 100),
        answersInfluenced: r1((v.answers.size / Math.max(1, runs.length)) * 100),
        engines: [...v.engines],
        tags: tags.filter((t) => t.domains.includes(domain)).map((t) => t.name),
        trend,
      };
    })
    .sort((a, b) => b.citations - a.citations);
}

export async function getCitationUrls(orgId: string, f: Filters, limit = 25): Promise<UrlStat[]> {
  const ds = need(orgId);
  const m = new Map<string, UrlStat & { promptSet: Set<string> }>();
  for (const r of runsFor(ds, f)) {
    for (const c of r.citations) {
      const v = m.get(c.url) ?? { url: c.url, domain: c.domain, title: c.title, type: c.type, citations: 0, prompts: 0, promptSet: new Set<string>() };
      v.citations++;
      v.promptSet.add(r.promptId);
      m.set(c.url, v);
    }
  }
  return [...m.values()]
    .map(({ promptSet, ...v }) => ({ ...v, prompts: promptSet.size }))
    .sort((a, b) => b.citations - a.citations)
    .slice(0, limit);
}

export async function getSourceTypeSplit(orgId: string, f: Filters) {
  const ds = need(orgId);
  const m = new Map<SourceType, number>();
  let total = 0;
  for (const r of runsFor(ds, f))
    for (const c of r.citations) {
      m.set(c.type, (m.get(c.type) ?? 0) + 1);
      total++;
    }
  const order: SourceType[] = ["owned", "competitor", "editorial", "review", "ugc", "reference", "social"];
  return order.map((type) => ({ type, count: m.get(type) ?? 0, share: r1(((m.get(type) ?? 0) / Math.max(1, total)) * 100) }));
}

const TAGS: Record<string, SourceTag[]> = {
  org_northwind: [
    { id: "t1", name: "Review sites", color: "#2a78d6", domains: ["g2.com", "capterra.com", "trustradius.com"], description: "Pages where buyers compare vendors." },
    { id: "t2", name: "Community", color: "#eb6834", domains: ["reddit.com", "news.ycombinator.com", "stackoverflow.com"], description: "Threads we monitor and join." },
    { id: "t3", name: "PR targets", color: "#6250d6", domains: ["techcrunch.com", "lennysnewsletter.com"] },
  ],
  org_fernhill: [
    { id: "t1", name: "Gear reviews", color: "#2a78d6", domains: ["outdoorgearlab.com", "which.co.uk", "trekkinglife.co.uk"] },
    { id: "t2", name: "Community", color: "#eb6834", domains: ["reddit.com", "ukhillwalking.com"] },
    { id: "t3", name: "Press", color: "#6250d6", domains: ["theguardian.com"] },
  ],
};

export async function getSourceTags(orgId: string): Promise<SourceTag[]> {
  return TAGS[orgId] ?? [];
}

/* ------------------------------------------------------------------ sentiment */

const THEMES: Record<string, [string, "positive" | "neutral" | "negative", string][]> = {
  org_northwind: [
    ["Warehouse-native architecture", "positive", "Runs directly on Snowflake, so data never leaves your warehouse."],
    ["Pricing transparency", "positive", "Per-seat pricing that is easy to predict compared with event-based plans."],
    ["Ease of use for PMs", "positive", "Product managers can build funnels without writing SQL."],
    ["Integration catalogue", "negative", "Fewer native integrations than older platforms."],
    ["Setup effort", "negative", "May need a data engineer to model events first."],
    ["Feature breadth", "neutral", "Covers funnels, retention, replay and experiments."],
  ],
  org_fernhill: [
    ["Repair programme", "positive", "Lifetime repairs and resoleable boots make it good value long term."],
    ["Sustainability", "positive", "B Corp certified with PFC-free waterproofing."],
    ["Fit and comfort", "positive", "Comfortable out of the box, with wide sizes available."],
    ["Price", "negative", "More expensive than budget brands."],
    ["Stock availability", "negative", "Popular sizes sell out quickly."],
    ["Range", "neutral", "Smaller tent range than large outdoor retailers."],
  ],
};

export async function getSentimentSummary(orgId: string, f: Filters) {
  const ds = need(orgId);
  const runs = runsFor(ds, f).filter((r) => r.mentioned);
  const dist = { positive: 0, neutral: 0, negative: 0 };
  for (const r of runs) if (r.sentiment) dist[r.sentiment]++;
  const trend: TrendPoint[] = windowDates(ds, f.range).map((date) => {
    const day = (ds.byDate.get(date) ?? []).filter((r) => r.mentioned && (f.engine === "all" || r.engine === f.engine));
    const p = day.filter((r) => r.sentiment === "positive").length;
    const n = day.filter((r) => r.sentiment === "negative").length;
    return {
      date,
      net: Math.round(((p - n) / Math.max(1, day.length)) * 100),
      positive: r1((p / Math.max(1, day.length)) * 100),
      negative: r1((n / Math.max(1, day.length)) * 100),
    };
  });
  const byEngine = ENGINE_IDS.map((e) => {
    const er = runs.filter((r) => r.engine === e);
    const p = er.filter((r) => r.sentiment === "positive").length;
    const n = er.filter((r) => r.sentiment === "negative").length;
    const u = er.length - p - n;
    return {
      engine: e,
      positive: r1((p / Math.max(1, er.length)) * 100),
      neutral: r1((u / Math.max(1, er.length)) * 100),
      negative: r1((n / Math.max(1, er.length)) * 100),
      net: Math.round(((p - n) / Math.max(1, er.length)) * 100),
    };
  });
  const rng = mulberry32(hashString(`${orgId}-themes-${f.range}-${f.engine}`));
  const themes: SentimentTheme[] = (THEMES[orgId] ?? []).map(([theme, sentiment, example]) => ({
    theme,
    sentiment,
    example,
    mentions: Math.round((runs.length / 6) * (0.4 + rng())),
    engines: ENGINE_IDS.filter(() => rng() > 0.35),
  }));
  return { distribution: dist, total: runs.length, trend, byEngine, themes };
}

export function demoToday() {
  return TODAY;
}
