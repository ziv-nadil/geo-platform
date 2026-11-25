import "server-only";
import { createHash } from "node:crypto";
import { connection } from "next/server";
import { currentClaims, dbConfigured, runAs, withRls, withService, type JwtClaims, type TxSql } from "@/lib/server/db";
import * as Q from "@/lib/server/queries";
import { ONBOARDING_STEPS } from "@/config/onboarding";
import { BRAND_SERIES, COMPETITOR_SERIES } from "@/lib/ui/chart-colors";
import { engineMeta } from "@/lib/ui/engines";
import type {
  AdminOrg,
  ApiKey,
  Billing,
  BrandKit,
  BrandStyle,
  Citation,
  ContentDraft,
  CrawlerData,
  Creator,
  DomainStat,
  EngineAnswer,
  EngineBreakdown,
  EngineId,
  Filters,
  HeadToHead,
  Integration,
  Invitation,
  IssueSeverity,
  KpiSet,
  Load,
  Member,
  Mover,
  Org,
  OutreachContact,
  PromptDetail,
  PromptRow,
  Report,
  Role,
  SentimentSummary,
  SiteIssue,
  SitePage,
  SiteProperty,
  SourceTag,
  SourceType,
  SovRow,
  TrendPoint,
  UrlStat,
  Viewer,
} from "@/lib/ui/data-types";
import type { StepStatus, WizardState } from "@/lib/ui/onboarding-logic";

/**
 * Data adapter: the only place pages touch the backend query layer (src/lib/server/queries).
 * It unwraps QueryResult into Load<T>, converts backend shapes into page shapes and derives
 * values the queries don't return directly (previous-period numbers, pivots, head-to-head).
 * It never invents numbers: missing data stays null or empty.
 *
 * Local QA auth bypass (documented in docs/design/design-system.md):
 *   DEV_AUTH_USER_ID=<auth.users id>  [DEV_AUTH_AAL=aal1|aal2, default aal2]
 * works ONLY when NODE_ENV !== "production" AND DATABASE_URL points at localhost/127.0.0.1.
 */

/* ------------------------------------------------------------------ identity */

export function devBypassClaims(): JwtClaims | null {
  const id = process.env.DEV_AUTH_USER_ID ?? process.env.DEV_IMPERSONATE_USER_ID;
  const url = process.env.DATABASE_URL;
  if (!id || !url || process.env.NODE_ENV === "production") return null;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) return null;
  return { sub: id, role: "authenticated", aal: process.env.DEV_AUTH_AAL === "aal1" ? "aal1" : "aal2" };
}

/** Run backend queries as the dev-bypass user when active, otherwise as the session user. */
async function as<T>(fn: () => Promise<T>): Promise<T> {
  await connection(); // per-request data: never prerender it into the static shell
  const c = devBypassClaims();
  return c ? runAs(c, fn) : fn();
}

export async function viewerClaims(): Promise<JwtClaims | null> {
  return devBypassClaims() ?? (await currentClaims());
}

/** Run SQL as the current viewer with RLS (for adapter-level reads and server actions). */
export async function withViewerRls<T>(fn: (sql: TxSql, claims: JwtClaims) => Promise<T>): Promise<Load<T>> {
  if (!dbConfigured()) return { ok: false, reason: "not_configured", missing: ["DATABASE_URL"] };
  const claims = await viewerClaims();
  if (!claims) return { ok: false, reason: "unauthenticated" };
  return { ok: true, data: await withRls(claims, (sql) => fn(sql, claims)) };
}

async function unwrap<T, U>(p: Promise<Q.QueryResult<T>>, map: (d: T) => U | Promise<U>): Promise<Load<U>> {
  const r = await p;
  if (!r.ok) return { ok: false, reason: r.reason, missing: "missing" in r ? r.missing : undefined };
  return { ok: true, data: await map(r.data) };
}

export async function getViewer(): Promise<Load<Viewer>> {
  await connection();
  if (!dbConfigured()) return { ok: false, reason: "not_configured", missing: ["DATABASE_URL"] };
  const claims = await viewerClaims();
  if (!claims) return { ok: false, reason: "unauthenticated" };
  const [profile] = await withRls(claims, (sql) => sql`select email::text as email, full_name from public.profiles where id = ${claims.sub}`);
  const [staff] = await withService((sql) => sql`select 1 as ok from public.platform_admins where user_id = ${claims.sub} and disabled_at is null`);
  const email = (profile?.email as string | undefined) ?? (claims.email as string | undefined) ?? "";
  return {
    ok: true,
    data: {
      id: claims.sub,
      email,
      name: (profile?.full_name as string | undefined) ?? (email.split("@")[0] || "User"),
      isPlatformAdmin: Boolean(staff),
      aal: claims.aal === "aal2" ? "aal2" : "aal1",
      devBypass: Boolean(devBypassClaims()),
    },
  };
}

/* ------------------------------------------------------------------ orgs */

const ORG_COLORS = ["#1f4fa8", "#3f6b2a", "#8a3b8f", "#9a5b13", "#0f6e6e", "#a8323e"];
function orgColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ORG_COLORS[h % ORG_COLORS.length]!;
}
const domainOf = (website: string | null) => (website ? website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : "");

function toOrg(o: Q.OrgSummary, onboardingPct = 0): Org {
  return { id: o.id, slug: o.slug, name: o.name, domain: domainOf(o.website), plan: o.plan, status: o.status, role: o.role, color: orgColor(o.id), onboardingPct };
}

export async function listOrgs(): Promise<Load<Org[]>> {
  return as(() => unwrap(Q.listMyOrgs(), (rows) => rows.map((o) => toOrg(o))));
}

export async function getOrgBySlug(slug: string): Promise<Load<Org | null>> {
  return as(async () => {
    const list = await Q.listMyOrgs();
    if (!list.ok) return unwrap(Promise.resolve(list), () => null);
    const o = list.data.find((x) => x.slug === slug);
    if (!o) return { ok: true, data: null };
    const prog = await Q.getOnboardingProgress(o.id);
    const pct = prog.ok ? onboardingPctFromServer(prog.data) : 0;
    return { ok: true, data: toOrg(o, pct) };
  });
}

function onboardingPctFromServer(p: Q.OnboardingProgress) {
  const steps = p.steps.filter((s) => s.stepId !== "review");
  const score = steps.reduce((s, x) => s + (x.status === "complete" ? 1 : x.status === "needs_attention" ? 0.5 : 0), 0);
  return steps.length ? Math.round((score / steps.length) * 100) : 0;
}

/** Active staff grant for this org ("view as"). Service read of the caller's own grants only. */
export async function getViewAsGrant(orgId: string): Promise<{ mode: "view" | "act"; expiresAt: string } | null> {
  const claims = await viewerClaims();
  if (!claims || !dbConfigured()) return null;
  const [g] = await withService(
    (sql) => sql`select mode, expires_at from public.platform_access_grants
                 where admin_user_id = ${claims.sub} and org_id = ${orgId} and ended_at is null and expires_at > now()
                 order by expires_at desc limit 1`,
  );
  return g ? { mode: g.mode as "view" | "act", expiresAt: new Date(g.expires_at as string).toISOString() } : null;
}

/* ------------------------------------------------------------------ helpers */

const qf = (f: Filters, days?: number): Q.Filters => ({ days: days ?? f.range, engines: f.engine === "all" ? undefined : [f.engine] });
const r1 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const st = (t: string): SourceType => (["owned", "competitor", "earned", "ugc", "other"].includes(t) ? (t as SourceType) : "other");

function dailyWeighted(series: Q.MetricPoint[], key: keyof Q.MetricPoint): { date: string; value: number | null }[] {
  const m = new Map<string, { s: number; w: number }>();
  for (const p of series) {
    const v = p[key] as number | null;
    const cur = m.get(p.day) ?? { s: 0, w: 0 };
    if (v !== null && p.runs > 0) {
      cur.s += v * p.runs;
      cur.w += p.runs;
    }
    m.set(p.day, cur);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, value: v.w ? v.s / v.w : null }));
}

/* ------------------------------------------------------------------ overview */

export interface OverviewData {
  kpis: KpiSet;
  trend: TrendPoint[];
  engines: EngineBreakdown[];
  topSources: { domain: string; type: SourceType; citations: number }[];
  engineIds: EngineId[];
}

export async function getOverview(orgId: string, f: Filters): Promise<Load<OverviewData>> {
  return as(() =>
    unwrap(Q.getOverview(orgId, qf(f)), (o) => {
      const k = o.kpis;
      const kd = (x: Q.KpiDelta, scale = 1) => ({ value: r1(x.value === null ? null : x.value * scale), previous: r1(x.previous === null ? null : x.previous * scale), delta: r1(x.delta === null ? null : x.delta * scale) });
      const spark = (key: keyof Q.MetricPoint, scale = 1) => dailyWeighted(o.series, key).map((p) => (p.value === null ? 0 : Math.round(p.value * scale * 10) / 10));
      const days = [...new Set(o.series.map((s) => s.day))].sort();
      const engineIds = [...new Set(o.series.map((s) => s.engineId))];
      // Trailing 3-day window per engine smooths daily sampling noise.
      const trend: TrendPoint[] = days.map((date, i) => {
        const win = days.slice(Math.max(0, i - 2), i + 1);
        const point: TrendPoint = { date };
        for (const e of engineIds) {
          const pts = o.series.filter((s) => s.engineId === e && win.includes(s.day) && s.visibility !== null);
          const w = pts.reduce((a, p) => a + p.runs, 0);
          point[e] = w ? Math.round((pts.reduce((a, p) => a + (p.visibility ?? 0) * p.runs, 0) / w) * 10) / 10 : null;
        }
        return point;
      });
      return {
        kpis: {
          visibility: kd(k.visibility),
          shareOfVoice: kd(k.shareOfVoice),
          citationShare: kd(k.citationShare),
          avgPosition: kd(k.avgPosition),
          sentiment: kd(k.sentiment, 100),
          answers: k.runs,
          sparkVisibility: spark("visibility"),
          sparkSov: spark("shareOfVoice"),
          sparkCitation: spark("citationShare"),
          sparkPosition: spark("avgPosition"),
          sparkSentiment: spark("sentiment", 100),
        },
        trend,
        engineIds,
        engines: o.byEngine.map((e) => ({ engine: e.engineId, visibility: r1(e.visibility), sov: r1(e.shareOfVoice), citationShare: r1(e.citationShare), runs: e.runs })),
        topSources: o.topSources.map((s) => ({ domain: s.domain, type: st(s.sourceType), citations: s.citations })),
      };
    }),
  );
}

/* ------------------------------------------------------------------ competitors */

export async function getShareOfVoice(orgId: string, f: Filters): Promise<Load<{ rows: SovRow[]; trend: TrendPoint[] }>> {
  return as(async () => {
    const [cur, wide] = await Promise.all([Q.getCompetitorSov(orgId, qf(f)), Q.getCompetitorSov(orgId, qf(f, f.range * 2))]);
    return unwrap(Promise.resolve(cur), (c) => {
      // Previous period = (2× window) − (current window), per entity.
      const prevMentions = new Map<string, number>();
      if (wide.ok) for (const e of wide.data.entities) prevMentions.set(e.entityId, e.mentions - (c.entities.find((x) => x.entityId === e.entityId)?.mentions ?? 0));
      const prevTotal = [...prevMentions.values()].reduce((a, b) => a + Math.max(0, b), 0);
      let slot = 0;
      const colors = new Map<string, string>();
      for (const e of c.entities) colors.set(e.entityId, e.entityType === "brand" ? BRAND_SERIES : e.color ?? COMPETITOR_SERIES[slot++ % COMPETITOR_SERIES.length]!);
      const rows: SovRow[] = c.entities
        .map((e) => ({
          id: e.entityId,
          name: e.name,
          color: colors.get(e.entityId)!,
          isBrand: e.entityType === "brand",
          sov: r1(e.shareOfVoice) ?? 0,
          sovPrev: wide.ok && prevTotal ? r1((Math.max(0, prevMentions.get(e.entityId) ?? 0) / prevTotal) * 100) : null,
          mentions: e.mentions,
          avgPosition: r1(e.avgPosition),
          sentiment: e.sentiment === null ? null : Math.round(e.sentiment * 100),
        }))
        .sort((a, b) => b.sov - a.sov);
      const days = [...new Set(c.series.map((s) => s.day))].sort();
      const trend = days.map((date) => {
        const p: TrendPoint = { date };
        for (const s of c.series.filter((x) => x.day === date)) p[s.entityId] = r1(s.shareOfVoice);
        return p;
      });
      return { rows, trend };
    });
  });
}

export async function getCompetitorList(orgId: string) {
  return as(() => unwrap(Q.listCompetitors(orgId), (rows) => rows.filter((c) => c.active)));
}

/** Head-to-head from the latest answers (sampled: up to 1,000 most recent). */
export async function getHeadToHead(orgId: string, f: Filters, brandName: string): Promise<Load<{ sample: number; rows: HeadToHead[] }>> {
  return as(async () => {
    const [res, comps] = await Promise.all([Q.listResponses(orgId, { ...qf(f), limit: 1000 }), Q.listCompetitors(orgId)]);
    return unwrap(Promise.resolve(res), (page) => {
      const list = comps.ok ? comps.data : [];
      const rows = list.map((c) => {
        let both = 0, wins = 0, brandOnly = 0, compOnly = 0, neither = 0;
        const byEngine = new Map<string, { both: number; wins: number }>();
        for (const r of page.rows) {
          const b = r.mentions.find((m) => m.entityType === "brand");
          const m = r.mentions.find((x) => x.entityType === "competitor" && x.name === c.name);
          if (b && m) {
            both++;
            const ev = byEngine.get(r.engineId) ?? { both: 0, wins: 0 };
            ev.both++;
            if ((b.position ?? 99) < (m.position ?? 99)) {
              wins++;
              ev.wins++;
            }
            byEngine.set(r.engineId, ev);
          } else if (b) brandOnly++;
          else if (m) compOnly++;
          else neither++;
        }
        return {
          competitorId: c.id,
          answers: page.rows.length,
          both,
          winRate: both ? r1((wins / both) * 100)! : 0,
          brandOnly,
          compOnly,
          neither,
          byEngine: [...byEngine.entries()].map(([engine, v]) => ({ engine, both: v.both, winRate: v.both ? r1((v.wins / v.both) * 100)! : 0 })),
        };
      });
      void brandName;
      return { sample: page.rows.length, rows };
    });
  });
}

/* ------------------------------------------------------------------ prompts */

function toPromptRow(p: Q.PromptRow, prev?: Q.PromptRow, byEngine: Record<string, number | null> = {}): PromptRow {
  let visibilityPrev: number | null = null;
  if (prev && prev.visibility !== null && p.visibility !== null && prev.runs > p.runs) {
    visibilityPrev = (prev.visibility * prev.runs - p.visibility * p.runs) / (prev.runs - p.runs);
  }
  return {
    id: p.id,
    text: p.text,
    topic: p.topicName,
    persona: p.personaName,
    funnel: p.funnelStage,
    tags: p.tags,
    source: p.source,
    runs: p.runs,
    visibility: r1(p.visibility),
    visibilityPrev: r1(visibilityPrev),
    avgPosition: r1(p.avgPosition),
    byEngine,
    lastRunAt: p.lastRunAt,
  };
}

export async function getPrompts(orgId: string, f: Filters): Promise<Load<{ rows: PromptRow[]; engineIds: EngineId[]; topics: { id: string; name: string }[] }>> {
  return as(async () => {
    const engines = await Q.listEngines(orgId);
    const enabled = engines.ok ? engines.data.filter((e) => e.enabled).map((e) => e.id) : [];
    const [cur, wide, topics, ...perEngine] = await Promise.all([
      Q.listPrompts(orgId, qf(f)),
      Q.listPrompts(orgId, qf(f, f.range * 2)),
      Q.listTopics(orgId),
      ...enabled.map((e) => Q.listPrompts(orgId, { days: f.range, engines: [e] })),
    ]);
    return unwrap(Promise.resolve(cur), (rows) => {
      const prevById = new Map(wide.ok ? wide.data.map((r) => [r.id, r]) : []);
      const engMaps = perEngine.map((res) => new Map(res.ok ? res.data.map((r) => [r.id, r.visibility]) : []));
      return {
        engineIds: enabled,
        topics: topics.ok ? topics.data.map((t) => ({ id: t.id, name: t.name })) : [],
        rows: rows.map((p) => toPromptRow(p, prevById.get(p.id), Object.fromEntries(enabled.map((e, i) => [e, r1(engMaps[i]!.get(p.id) ?? null)])))),
      };
    });
  });
}

export async function getTopMovers(orgId: string, f: Filters, n = 5): Promise<Load<{ up: Mover[]; down: Mover[] }>> {
  return as(async () => {
    const [cur, wide] = await Promise.all([Q.listPrompts(orgId, qf(f)), Q.listPrompts(orgId, qf(f, f.range * 2))]);
    return unwrap(Promise.resolve(cur), (rows) => {
      const prevById = new Map(wide.ok ? wide.data.map((r) => [r.id, r]) : []);
      const movers: Mover[] = rows
        .map((p) => toPromptRow(p, prevById.get(p.id)))
        .filter((p) => p.visibility !== null && p.visibilityPrev !== null)
        .map((p) => ({ promptId: p.id, text: p.text, current: p.visibility!, previous: p.visibilityPrev!, delta: r1(p.visibility! - p.visibilityPrev!)! }))
        .sort((a, b) => b.delta - a.delta);
      return { up: movers.slice(0, n).filter((m) => m.delta > 0), down: movers.slice(-n).reverse().filter((m) => m.delta < 0) };
    });
  });
}

function toAnswer(r: Q.ResponseRow): EngineAnswer {
  const brand = r.mentions.find((m) => m.entityType === "brand");
  return {
    id: r.id,
    engine: r.engineId,
    date: r.runAt,
    promptId: r.promptId,
    promptText: r.promptText,
    text: r.text,
    mentioned: r.brandMentioned,
    position: brand?.position ?? null,
    sentiment: brand?.sentiment ?? null,
    brandsInOrder: [...r.mentions].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).map((m) => m.name),
    citations: r.citations.map((c) => ({ url: c.url, domain: c.domain, type: st(c.sourceType), title: c.url.replace(/^https?:\/\/(www\.)?/, "") })),
  };
}

async function brandAndCompetitorNames(orgId: string) {
  const [kit, comps] = await Promise.all([Q.getBrandKit(orgId), Q.listCompetitors(orgId)]);
  const p = kit.ok ? kit.data.profile : null;
  const brandName = (p?.display_name as string | undefined) ?? (p?.legal_name as string | undefined) ?? "";
  return { brandName, competitorNames: comps.ok ? comps.data.map((c) => c.name) : [] };
}

export async function getPromptDetail(orgId: string, promptId: string, f: Filters): Promise<Load<PromptDetail | null>> {
  return as(async () => {
    const names = await brandAndCompetitorNames(orgId);
    return unwrap(Q.getPromptDetail(orgId, promptId, qf(f)), (d) => {
      if (!d) return null;
      const latest = new Map<string, EngineAnswer>();
      for (const r of d.recentResponses) if (!latest.has(r.engineId)) latest.set(r.engineId, toAnswer(r));
      return {
        prompt: toPromptRow(d.prompt),
        byEngine: d.byEngine.map((e) => ({ engine: e.engineId, runs: e.runs, visibility: r1(e.visibility), avgPosition: r1(e.avgPosition) })),
        answers: [...latest.values()],
        competitorsMentioned: d.competitorsMentioned,
        topSources: d.topCitations.map((c) => ({ url: c.url, domain: c.domain, type: st(c.sourceType), title: c.url.replace(/^https?:\/\/(www\.)?/, ""), count: c.citations })),
        ...names,
      };
    });
  });
}

export async function getResponses(orgId: string, f: Filters, limit = 80): Promise<Load<{ items: EngineAnswer[]; total: number; brandName: string; competitorNames: string[] }>> {
  return as(async () => {
    const names = await brandAndCompetitorNames(orgId);
    return unwrap(Q.listResponses(orgId, { ...qf(f), limit }), (page) => ({ items: page.rows.map(toAnswer), total: page.total, ...names }));
  });
}

/* ------------------------------------------------------------------ citations */

export async function getCitations(orgId: string, f: Filters): Promise<Load<{ domains: DomainStat[]; urls: UrlStat[]; split: { type: SourceType; count: number; share: number }[] }>> {
  return as(() =>
    unwrap(Q.getCitations(orgId, qf(f)), (c) => ({
      split: c.byType.map((t) => ({ type: st(t.sourceType), count: t.citations, share: r1(t.share) ?? 0 })),
      domains: c.domains.map((d) => ({ domain: d.domain, type: st(d.sourceType), citations: d.citations, share: r1(d.share) ?? 0, answersCiting: d.runsCiting, tags: d.tags })),
      urls: c.urls.map((u) => ({ url: u.url, domain: u.domain, title: u.title ?? u.url.replace(/^https?:\/\/(www\.)?/, ""), type: st(u.sourceType), citations: u.citations, lastSeenAt: u.lastSeenAt })),
    })),
  );
}

export async function getSourceTags(orgId: string): Promise<Load<SourceTag[]>> {
  return as(() =>
    unwrap(Q.listSourceTags(orgId), (rows) =>
      rows.map((t) => ({ id: t.id, name: t.name, color: t.color ?? "#5f6874", description: t.description ?? "", domains: t.rules.map((r) => r.pattern), citations: t.citations })),
    ),
  );
}

/* ------------------------------------------------------------------ sentiment */

export async function getSentiment(orgId: string, f: Filters): Promise<Load<SentimentSummary>> {
  return as(() =>
    unwrap(Q.getSentiment(orgId, qf(f)), (s) => {
      const net = (p: number, n: number, u: number) => (p + n + u ? Math.round(((p - n) / (p + n + u)) * 100) : null);
      return {
        totals: { positive: s.totals.positive, neutral: s.totals.neutral, negative: s.totals.negative },
        net: net(s.totals.positive, s.totals.negative, s.totals.neutral),
        trend: s.series.map((d) => {
          const t = d.positive + d.neutral + d.negative;
          return { date: d.day, positive: t ? r1((d.positive / t) * 100) : null, negative: t ? r1((d.negative / t) * 100) : null };
        }),
        byEngine: s.byEngine.map((e) => {
          const t = e.positive + e.neutral + e.negative || 1;
          return { engine: e.engineId, positive: r1((e.positive / t) * 100)!, neutral: r1((e.neutral / t) * 100)!, negative: r1((e.negative / t) * 100)!, net: net(e.positive, e.negative, e.neutral) };
        }),
        samples: s.samples.map((x) => ({ snippet: x.snippet, sentiment: x.sentiment, engine: x.engineId, promptText: x.promptText, date: x.runAt })),
      };
    }),
  );
}

/* ------------------------------------------------------------------ site health & crawlers */

const SEVERITIES: IssueSeverity[] = ["critical", "high", "medium", "low", "info"];
const sev = (s: string): IssueSeverity => (SEVERITIES.includes(s as IssueSeverity) ? (s as IssueSeverity) : "info");

export async function getSiteHealth(orgId: string): Promise<Load<{ properties: SiteProperty[]; issues: SiteIssue[]; pages: SitePage[] }>> {
  return as(() =>
    unwrap(Q.getSiteHealth(orgId), (h) => ({
      properties: h.properties.map((p) => {
        const issues = Object.fromEntries(SEVERITIES.map((s) => [s, h.issues.filter((i) => i.propertyId === p.id && sev(i.severity) === s && i.status !== "resolved").length])) as Record<IssueSeverity, number>;
        return { id: p.id, domain: domainOf(p.rootUrl) || p.rootUrl, score: p.score, pagesCrawled: p.pagesCrawled, lastAuditAt: p.lastAuditAt, status: p.auditStatus, issues };
      }),
      issues: h.issues
        .map((i) => ({ id: i.id, title: i.title, code: i.code, severity: sev(i.severity), category: i.category, pages: i.affectedPages, status: (["open", "in_progress", "resolved", "ignored"].includes(i.status) ? i.status : "open") as SiteIssue["status"], howToFix: i.recommendation }))
        .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)),
      pages: h.pages.map((p) => ({ url: p.url, statusCode: p.statusCode, title: p.title, issues: p.issuesCount, words: p.wordCount, hasSchema: p.hasSchema, score: p.score, lastCrawled: p.lastCrawledAt })),
    })),
  );
}

/** Known AI user agents → purpose (public documentation of each operator, not data). */
const BOT_PURPOSE: Record<string, CrawlerData["bots"][number]["purpose"]> = {
  gptbot: "training", "oai-searchbot": "search", "chatgpt-user": "user", perplexitybot: "search", "perplexity-user": "user",
  claudebot: "training", "claude-user": "user", "claude-searchbot": "search", "google-extended": "training", googlebot: "search",
  bingbot: "search", "applebot-extended": "training", applebot: "search", ccbot: "training", bytespider: "training", "meta-externalagent": "training",
};

export async function getCrawlers(orgId: string, f: Filters): Promise<Load<CrawlerData>> {
  return as(() =>
    unwrap(Q.getCrawlerHits(orgId, { days: f.range }), (c) => {
      const opOf = new Map(c.totals.map((t) => [t.bot, t.operator ?? "Other"]));
      const operators = [...new Set(c.totals.map((t) => t.operator ?? "Other"))];
      const days = [...new Set(c.series.map((s) => s.day))].sort();
      return {
        bots: c.totals.map((t) => ({ name: t.bot, operator: t.operator ?? "Other", purpose: BOT_PURPOSE[t.bot.toLowerCase()] ?? "unknown", hits: t.hits, errorHits: t.errorHits, uniquePaths: t.uniquePaths })).sort((a, b) => b.hits - a.hits),
        operators,
        trend: days.map((date) => {
          const p: TrendPoint = { date };
          for (const o of operators) p[o] = 0;
          for (const s of c.series.filter((x) => x.day === date)) {
            const o = opOf.get(s.bot) ?? "Other";
            p[o] = (p[o] as number) + s.hits;
          }
          return p;
        }),
        paths: c.topPaths,
      };
    }),
  );
}

/* ------------------------------------------------------------------ content & action center */

export const DEFAULT_STYLE: BrandStyle = { voice: "", audience: "", perspective: "first_plural", channel: "blog", locale: "en-US", disclosures: "", tone: { formal: 50, playful: 30, technical: 50, confident: 60 }, rules: [] };

export async function getBrandKit(orgId: string): Promise<Load<BrandKit>> {
  return as(async () => {
    // TODO(backend): brand style fields (voice, audience, tone, rules…) have no table; stored in organizations.settings.brand_kit.
    const style = await withViewerRls(async (sql) => {
      const [r] = await sql`select settings -> 'brand_kit' as kit from public.organizations where id = ${orgId}`;
      return (r?.kit ?? null) as Partial<BrandStyle> | null;
    });
    return unwrap(Q.getBrandKit(orgId), (k) => {
      const p = k.profile;
      return {
        style: { ...DEFAULT_STYLE, ...(style.ok && style.data ? style.data : {}), tone: { ...DEFAULT_STYLE.tone, ...(style.ok && style.data?.tone ? style.data.tone : {}) } },
        terminology: k.voiceTerms.filter((t) => t.kind === "use" || t.kind === "avoid").map((t) => (t.kind === "avoid" ? { use: t.replacement ?? "", avoid: t.term } : { use: t.term, avoid: t.replacement ?? "" })),
        profile: p ? { name: String(p.display_name ?? p.legal_name ?? ""), tagline: (p.tagline as string) ?? null, description: (p.description as string) ?? null, industry: (p.industry as string) ?? null } : null,
        messaging: k.messaging.map((m) => ({ kind: m.kind, title: m.title, content: m.content })),
      };
    });
  });
}

export async function getContentDrafts(orgId: string): Promise<Load<ContentDraft[]>> {
  return as(() => unwrap(Q.listContentItems(orgId), (rows) => rows.map((c) => ({ id: c.id, title: c.title, type: c.contentType, targetPrompt: c.promptText, status: c.status, updatedAt: c.updatedAt, url: c.publishedUrl ?? c.targetUrl }))));
}

export async function getCreators(orgId: string): Promise<Load<Creator[]>> {
  return as(() =>
    unwrap(Q.listCreators(orgId), (rows) =>
      rows.map((c) => ({ id: c.id, platform: c.platform, name: c.displayName ?? c.handle, handle: c.handle, url: c.url, followers: c.followers, avgViews: c.avgViews, relevance: c.relevanceScore === null ? null : Math.round(c.relevanceScore <= 1 ? c.relevanceScore * 100 : c.relevanceScore), topics: c.topics, citedCount: c.citedCount, status: c.status })),
    ),
  );
}

export async function getOutreach(orgId: string): Promise<Load<OutreachContact[]>> {
  return as(() =>
    unwrap(Q.listOutreach(orgId), (rows) =>
      rows.map((c) => ({ id: c.id, name: c.name ?? c.email ?? "Unknown", role: c.roleTitle, publication: c.publication, domain: c.domain, email: c.email, stage: c.status as OutreachContact["stage"], citations: c.citationCount, lastTouch: c.lastContactedAt })),
    ),
  );
}

export async function getReports(orgId: string): Promise<Load<Report[]>> {
  return as(() => unwrap(Q.listReports(orgId), (rows) => rows.map((r) => ({ id: r.id, title: r.title, type: r.reportType, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, schedule: r.schedule, createdAt: r.createdAt }))));
}

/* ------------------------------------------------------------------ settings */

export async function getMembers(orgId: string): Promise<Load<Member[]>> {
  return as(() => unwrap(Q.listMembers(orgId), (rows) => rows.map((m) => ({ userId: m.userId, name: m.fullName ?? m.email ?? "Member", email: m.email ?? "", role: m.role as Role, joinedAt: m.joinedAt }))));
}

export async function getInvitations(orgId: string): Promise<Load<Invitation[]>> {
  return as(() => unwrap(Q.listInvitations(orgId), (rows) => rows.map((i) => ({ id: i.id, email: i.email, role: i.role as Role, status: i.status, expiresAt: i.expiresAt, createdAt: i.createdAt }))));
}

export async function getApiKeys(orgId: string): Promise<Load<ApiKey[]>> {
  return as(() => unwrap(Q.listApiKeys(orgId), (rows) => rows.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, expiresAt: k.expiresAt, revokedAt: k.revokedAt }))));
}

export async function getBilling(orgId: string): Promise<Load<Billing>> {
  return as(() =>
    unwrap(Q.getBilling(orgId), (b) => ({
      planName: b.plan?.name ?? null,
      monthlyPrice: b.plan ? b.plan.monthlyPriceCents / 100 : null,
      seatLimit: b.plan?.seatLimit ?? null,
      promptLimit: b.plan?.promptLimit ?? null,
      subscriptionStatus: b.subscription?.status ?? null,
      seats: b.subscription?.seats ?? null,
      renewsAt: b.subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: b.subscription?.cancelAtPeriodEnd ?? false,
      usage: b.usage.map((u) => ({ metric: u.metric, value: u.value })),
      plans: b.plans.map((p) => ({ id: p.id, name: p.name, monthlyPrice: p.monthlyPriceCents / 100 })),
    })),
  );
}

const STEP_STATUS: Record<Q.OnboardingStatus, StepStatus> = { not_started: "idle", in_progress: "pending", needs_attention: "partial", complete: "pass" };

export async function getIntegrations(orgId: string): Promise<Load<Integration[]>> {
  return as(() =>
    unwrap(Q.getOnboardingProgress(orgId), (p) =>
      ONBOARDING_STEPS.filter((s) => s.group === "stack" || s.group === "access")
        .filter((s) => s.id !== "review")
        .map((def) => {
          const s = p.steps.find((x) => x.stepId === def.id);
          const t = p.latestTests.find((x) => x.stepId === def.id);
          const status: Integration["status"] = t ? (t.status === "not_configured" ? "idle" : t.status) : s?.status === "complete" ? "pass" : s?.status === "needs_attention" ? "partial" : "idle";
          const detail = t ? (t.missing.length ? `Missing: ${t.missing.join(", ")}` : t.checks.map((c) => c.label).slice(0, 2).join(" · ") || "Tested") : s?.status === "complete" ? "Marked complete" : s?.notes ?? "Not set up";
          return { stepId: def.id, name: def.title, status, detail, lastCheckedAt: t?.createdAt ?? (s?.updatedAt || null) };
        }),
    ),
  );
}

/* ------------------------------------------------------------------ onboarding */

export async function getOnboardingState(orgId: string): Promise<Load<WizardState>> {
  return as(() =>
    unwrap(Q.getOnboardingProgress(orgId), (p) => {
      const state: WizardState = { values: {}, tests: {}, skipped: {}, serverStatus: {} };
      for (const s of p.steps) {
        const data = { ...(s.data ?? {}) } as Record<string, unknown>;
        if (s.notes === "skipped") state.skipped[s.stepId] = true;
        state.values[s.stepId] = data as WizardState["values"][string];
        state.serverStatus![s.stepId] = STEP_STATUS[s.status];
        if (s.stepId === "review" && (s.status === "complete" || s.notes === "submitted")) state.submittedAt = s.completedAt ?? s.updatedAt;
      }
      for (const sec of p.secrets) {
        state.values[sec.stepId] = { ...(state.values[sec.stepId] ?? {}), [sec.fieldId]: { kind: "secret", stored: true, storedAt: sec.updatedAt } };
      }
      for (const t of p.latestTests) {
        const def = ONBOARDING_STEPS.find((d) => d.id === t.stepId);
        if (!def || t.status === "not_configured") continue;
        const results: Record<string, import("@/lib/ui/api-client").TestResult> = {};
        for (const td of def.tests) {
          const c = t.checks.find((x) => x.id === td.id);
          results[td.id] = {
            testId: td.id,
            status: c ? (c.ok ? "pass" : "fail") : t.status,
            summary: c?.detail ?? (t.status === "pass" ? "Passed on the last run." : t.status === "partial" ? "Partly working." : "Failed on the last run."),
            missing: t.missing,
            checks: t.checks.map((x) => ({ label: x.label, status: x.ok ? "pass" : "fail", detail: x.detail })),
            ranAt: t.createdAt,
          };
        }
        state.tests[t.stepId] = results;
      }
      return state;
    }),
  );
}

/** Values substituted into onboarding instructions. Unset values stay as visible {{PLACEHOLDERS}}. */
export async function getOnboardingPlaceholders(orgId: string): Promise<Record<string, string>> {
  const env = process.env;
  const out: Record<string, string> = {};
  const put = (k: string, v: string | undefined) => {
    if (v) out[k] = v;
  };
  put("AGENCY_EMAIL", env.AGENCY_EMAIL);
  put("AGENCY_GITHUB_USER", env.AGENCY_GITHUB_USER);
  put("ADS_MANAGER_ID", env.ADS_MANAGER_ID);
  put("AWS_PRINCIPAL_ARN", env.AWS_PRINCIPAL_ARN);
  out.DNS_TXT_NAME = "_beacon-verify";
  if (env.ONBOARDING_TOKEN_SALT) {
    const h = (k: string) => createHash("sha256").update(`${k}:${orgId}:${env.ONBOARDING_TOKEN_SALT}`).digest("hex");
    out.DNS_TXT_VALUE = `beacon-site-verification=${h("dns").slice(0, 32)}`;
    out.AWS_EXTERNAL_ID = `bgeo-${h("aws").slice(0, 20)}`;
  }
  // TODO(backend): SERVICE_ACCOUNT_EMAIL is created per client in step 9 and should come from the DB.
  return out;
}

/* ------------------------------------------------------------------ admin */

export async function adminListOrgs(): Promise<Load<AdminOrg[]>> {
  const total = ONBOARDING_STEPS.length;
  return as(() =>
    unwrap(Q.adminListOrgs(), (rows) =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        plan: r.plan,
        status: r.status,
        createdAt: r.createdAt,
        members: r.members,
        onboardingPct: Math.min(100, Math.round(((r.onboardingComplete + 0.5 * r.onboardingNeedsAttention) / total) * 100)),
        onboardingNeedsAttention: r.onboardingNeedsAttention,
        subscriptionStatus: r.subscriptionStatus,
        vaultProvisioned: r.vaultProvisioned,
        runs30d: r.runs30d,
        lastRunAt: r.lastRunAt,
      })),
    ),
  );
}

export function engineName(id: EngineId) {
  return engineMeta(id).name;
}

export type { Citation };
