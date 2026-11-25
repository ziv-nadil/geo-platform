import { describe, expect, it } from 'vitest';
import { buildKpis, competitorMovers, engineTrends, previousPeriod, reportTables, toCsv, topGaps, validPeriod, type ReportData } from '../aggregate';
import { citationKey, detectCrawlerBlocks, newCompetitorCitations, visibilityDrop, visibilitySe } from '../alerts';

describe('report aggregation', () => {
  it('computes KPI deltas and tolerates missing prior data', () => {
    const k = buildKpis({ visibility: 42.5, sov: 30, citationShare: 10, sentiment: null, runs: 9 }, { visibility: 40, sov: null, citationShare: 12, sentiment: 0.2, runs: 8 });
    expect(k.visibility).toEqual({ value: 42.5, previous: 40, delta: 2.5 });
    expect(k.sov.delta).toBeNull();
    expect(k.citationShare.delta).toBe(-2);
    expect(k.sentiment.delta).toBeNull();
  });
  it('orders engines by absolute change', () => {
    const e = engineTrends(
      [{ engine: 'chatgpt', visibility: 50, sov: 1, citationShare: 1, runs: 5 }, { engine: 'gemini', visibility: 20, sov: 1, citationShare: 1, runs: 5 }, { engine: 'new', visibility: 5, sov: 1, citationShare: 1, runs: 1 }],
      [{ engine: 'chatgpt', visibility: 48, sov: 1, citationShare: 1, runs: 5 }, { engine: 'gemini', visibility: 35, sov: 1, citationShare: 1, runs: 5 }],
    );
    expect(e.map((x) => x.engine)).toEqual(['gemini', 'chatgpt', 'new']);
    expect(e[0].delta).toBe(-15);
    expect(e[2].previous).toBeNull();
  });
  it('ranks competitor movers and flags new entrants', () => {
    const m = competitorMovers([{ id: 'a', name: 'A', mentions: 10 }, { id: 'b', name: 'B', mentions: 4 }, { id: 'c', name: 'C', mentions: 6 }], [{ id: 'a', name: 'A', mentions: 9 }, { id: 'b', name: 'B', mentions: 9 }]);
    expect(m.map((x) => [x.name, x.direction, x.change])).toEqual([['C', 'new', 6], ['B', 'down', -5], ['A', 'up', 1]]);
  });
  it('picks top gaps and skips dismissed', () => {
    const g = topGaps([{ label: 'x', score: 1, promptCount: 1 }, { label: 'y', score: 9, promptCount: 2, competitors: [{ name: 'A' }, { name: 'B' }] }, { label: 'z', score: 99, promptCount: 1, status: 'dismissed' }], 2);
    expect(g.map((x) => x.label)).toEqual(['y', 'x']);
    expect(g[0].competitors).toBe('A; B');
  });
  it('previousPeriod and validPeriod', () => {
    expect(previousPeriod('2026-11-08', '2026-11-14')).toEqual({ from: '2026-11-01', to: '2026-11-07' });
    expect(validPeriod('2026-11-14', '2026-11-08').ok).toBe(false);
    expect(validPeriod('nope', '2026-11-08').ok).toBe(false);
    expect(validPeriod('2025-01-01', '2026-11-08')).toEqual({ ok: false, error: 'range_too_long' });
    expect(validPeriod('2026-11-01', '2026-11-07', new Date('2026-11-25'))).toEqual({ ok: true, days: 7 });
  });
  it('CSV escapes quotes/commas and defuses formulas; one table per section', () => {
    expect(toCsv({ columns: ['a', 'b'], rows: [['x,"y"', '=SUM(A1)'], [null, 3]] })).toBe('a,b\r\n"x,""y""",\'=SUM(A1)\r\n,3\r\n');
    const d = { period: { from: 'a', to: 'b', days: 1 }, previous: { from: 'c', to: 'd' }, kpis: buildKpis({ visibility: 1, sov: 1, citationShare: 1, sentiment: 1, runs: 1 }, { visibility: 1, sov: 1, citationShare: 1, sentiment: 1, runs: 1 }), engines: [], series: [], gaps: [], movers: [], generatedAt: '' } as ReportData;
    expect(reportTables(d).map((t) => t.name)).toEqual(['kpis', 'engines', 'trend', 'gaps', 'competitor_movers']);
  });
});

describe('alert thresholds', () => {
  it('suppresses drops inside the noise band and fires beyond it', () => {
    // few runs => wide CI: a 6-pt drop is noise
    expect(visibilityDrop({ visibility: 44, scoredRuns: 10 }, { visibility: 50, scoredRuns: 10 }).fire).toBe(false);
    // many runs => tight CI: a 6-pt drop fires
    const big = visibilityDrop({ visibility: 44, scoredRuns: 2000 }, { visibility: 50, scoredRuns: 2000 });
    expect(big.fire).toBe(true);
    expect(big.drop).toBe(6);
  });
  it('respects the configured floor and ignores increases / missing data', () => {
    expect(visibilityDrop({ visibility: 48, scoredRuns: 5000 }, { visibility: 50, scoredRuns: 5000 }, { minDrop: 5 }).fire).toBe(false);
    expect(visibilityDrop({ visibility: 48, scoredRuns: 5000 }, { visibility: 50, scoredRuns: 5000 }, { minDrop: 1 }).fire).toBe(true);
    expect(visibilityDrop({ visibility: 60, scoredRuns: 5000 }, { visibility: 50, scoredRuns: 5000 }).fire).toBe(false);
    expect(visibilityDrop({ visibility: null, scoredRuns: 0 }, { visibility: 50, scoredRuns: 50 }).fire).toBe(false);
    expect(visibilitySe(50, 1)).toBe(100);
  });
  it('flags only never-before-seen competitor/domain pairs, once each', () => {
    const recent = [
      { competitorId: 'a', competitorName: 'A', domain: 'g2.com', url: 'u1' },
      { competitorId: 'a', competitorName: 'A', domain: 'G2.com', url: 'u2' },
      { competitorId: 'a', competitorName: 'A', domain: 'old.com', url: 'u3' },
    ];
    const r = newCompetitorCitations(recent, new Set([citationKey('a', 'old.com')]));
    expect(r.map((x) => x.url)).toEqual(['u1']);
  });
  it('detects blocked crawlers only with enough volume and denial share', () => {
    const rows = [
      { bot: 'GPTBot', status: 403, hits: 45 }, { bot: 'GPTBot', status: 200, hits: 5 },
      { bot: 'ClaudeBot', status: 403, hits: 5 },
      { bot: 'PerplexityBot', status: 200, hits: 100 }, { bot: 'PerplexityBot', status: 403, hits: 10 },
    ];
    const b = detectCrawlerBlocks(rows);
    expect(b.map((x) => x.bot)).toEqual(['GPTBot']);
    expect(b[0]).toMatchObject({ total: 50, blocked: 45, share: 0.9 });
  });
});
