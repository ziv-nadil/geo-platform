/** Pure report aggregation: no I/O so it can be unit-tested. SQL lives in server/reports/collect.ts. */

export type Kpi = { value: number | null; previous: number | null; delta: number | null };
export type KpiKey = 'visibility' | 'sov' | 'citationShare' | 'sentiment';
export type RawKpis = { visibility: number | null; sov: number | null; citationShare: number | null; sentiment: number | null; runs: number };
export type EngineRaw = { engine: string; visibility: number | null; sov: number | null; citationShare: number | null; runs: number };
export type EngineTrend = { engine: string; visibility: number | null; previous: number | null; delta: number | null; sov: number | null; citationShare: number | null; runs: number };
export type GapIn = { label: string; score: number; promptCount: number; status?: string; competitors?: { name: string }[] };
export type MoverIn = { id: string; name: string; mentions: number };
export type Mover = { id: string; name: string; mentions: number; previous: number; change: number; sov: number | null; direction: 'up' | 'down' | 'flat' | 'new' };
export type SeriesPoint = { day: string; engine: string; visibility: number | null; sov: number | null; citationShare: number | null };

export type ReportData = {
  period: { from: string; to: string; days: number };
  previous: { from: string; to: string };
  kpis: Record<KpiKey, Kpi> & { runs: number };
  engines: EngineTrend[];
  series: SeriesPoint[];
  gaps: { label: string; score: number; prompts: number; competitors: string }[];
  movers: Mover[];
  generatedAt: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function kpi(value: number | null, previous: number | null): Kpi {
  return { value, previous, delta: value !== null && previous !== null ? r2(value - previous) : null };
}

export function buildKpis(cur: RawKpis, prev: RawKpis): ReportData['kpis'] {
  return {
    visibility: kpi(cur.visibility, prev.visibility),
    sov: kpi(cur.sov, prev.sov),
    citationShare: kpi(cur.citationShare, prev.citationShare),
    sentiment: kpi(cur.sentiment, prev.sentiment),
    runs: cur.runs,
  };
}

/** Per-engine visibility with the change vs. the previous period; biggest movers first. */
export function engineTrends(cur: EngineRaw[], prev: EngineRaw[]): EngineTrend[] {
  const p = new Map(prev.map((e) => [e.engine, e.visibility]));
  return cur
    .map((e) => {
      const before = p.get(e.engine) ?? null;
      return { engine: e.engine, visibility: e.visibility, previous: before, delta: e.visibility !== null && before !== null ? r2(e.visibility - before) : null, sov: e.sov, citationShare: e.citationShare, runs: e.runs };
    })
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || a.engine.localeCompare(b.engine));
}

/** Competitor mention movement: ranks by absolute change; `new` = absent in the previous period. */
export function competitorMovers(cur: MoverIn[], prev: MoverIn[], limit = 5): Mover[] {
  const p = new Map(prev.map((c) => [c.id, c.mentions]));
  const total = cur.reduce((s, c) => s + c.mentions, 0);
  return cur
    .map((c) => {
      const before = p.get(c.id) ?? 0;
      const change = c.mentions - before;
      const direction: Mover['direction'] = before === 0 && c.mentions > 0 ? 'new' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
      return { id: c.id, name: c.name, mentions: c.mentions, previous: before, change, sov: total ? r2((100 * c.mentions) / total) : null, direction };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.mentions - a.mentions || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function topGaps(gaps: GapIn[], limit = 5): ReportData['gaps'] {
  return gaps
    .filter((g) => g.status !== 'dismissed')
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((g) => ({ label: g.label, score: r2(g.score), prompts: g.promptCount, competitors: (g.competitors ?? []).map((c) => c.name).join('; ') }));
}

export type Table = { name: string; columns: string[]; rows: (string | number | null)[][] };

export function reportTables(d: ReportData): Table[] {
  return [
    {
      name: 'kpis',
      columns: ['metric', 'value', 'previous', 'delta'],
      rows: (['visibility', 'sov', 'citationShare', 'sentiment'] as KpiKey[]).map((k) => [k, d.kpis[k].value, d.kpis[k].previous, d.kpis[k].delta]),
    },
    { name: 'engines', columns: ['engine', 'visibility', 'previous', 'delta', 'sov', 'citation_share', 'runs'], rows: d.engines.map((e) => [e.engine, e.visibility, e.previous, e.delta, e.sov, e.citationShare, e.runs]) },
    { name: 'trend', columns: ['day', 'engine', 'visibility', 'sov', 'citation_share'], rows: d.series.map((s) => [s.day, s.engine, s.visibility, s.sov, s.citationShare]) },
    { name: 'gaps', columns: ['gap', 'score', 'prompts', 'competitors'], rows: d.gaps.map((g) => [g.label, g.score, g.prompts, g.competitors]) },
    { name: 'competitor_movers', columns: ['competitor', 'mentions', 'previous', 'change', 'sov', 'direction'], rows: d.movers.map((m) => [m.name, m.mentions, m.previous, m.change, m.sov, m.direction]) },
  ];
}

/** RFC 4180 CSV. Cells starting with = + - @ are prefixed with ' to defuse spreadsheet formula injection. */
export function toCsv(t: Pick<Table, 'columns' | 'rows'>): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns, ...t.rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function validPeriod(from: string, to: string, today = new Date()): { ok: true; days: number } | { ok: false; error: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) return { ok: false, error: 'invalid_date' };
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b) return { ok: false, error: 'invalid_range' };
  if (b > today.getTime() + 86_400_000) return { ok: false, error: 'future_date' };
  const days = Math.round((b - a) / 86_400_000) + 1;
  if (days > 366) return { ok: false, error: 'range_too_long' };
  return { ok: true, days };
}

/** The equal-length window immediately before [from, to]. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const a = Date.parse(`${from}T00:00:00Z`);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - a) / 86_400_000) + 1;
  const d = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: d(a - days * 86_400_000), to: d(a - 86_400_000) };
}
