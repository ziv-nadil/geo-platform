import { describe, expect, it } from 'vitest';
import {
  betaPosterior,
  citationMetrics,
  detectChange,
  engineVisibility,
  netSentiment,
  observationScore,
  overallVisibility,
  positionScore,
  sentFactor,
  shareOfVoice,
  visibilityCI,
  wilsonInterval,
} from '../scoring';

describe('per-observation score', () => {
  it('position: ranked uses 1/log2(1+rank); prose uses 1 - offset; 0 when absent', () => {
    expect(positionScore(true, 1, 0.5)).toBe(1);
    expect(positionScore(true, 3, null)).toBeCloseTo(0.5, 6);
    expect(positionScore(true, null, 0.25)).toBe(0.75);
    expect(positionScore(false, 1, 0)).toBe(0);
  });

  it('sentiment factor maps -1..1 to 0.5..1', () => {
    expect(sentFactor(-1)).toBe(0.5);
    expect(sentFactor(0)).toBe(0.75);
    expect(sentFactor(1)).toBe(1);
    expect(sentFactor(null)).toBe(0.75);
  });

  it('score_o = m*(0.55+0.25*pos+0.20*c)*sentFactor', () => {
    expect(observationScore({ mentioned: true, pos: 1, ownedCited: true, sentiment: 1 })).toBeCloseTo(1, 10);
    expect(observationScore({ mentioned: true, pos: 0.5, ownedCited: false, sentiment: 0 })).toBeCloseTo((0.55 + 0.125) * 0.75, 10);
    expect(observationScore({ mentioned: false, pos: 1, ownedCited: true, sentiment: 1 })).toBe(0);
  });
});

describe('aggregation', () => {
  it('engine visibility: importance-weighted mean of per-prompt cell means', () => {
    const vs = engineVisibility([
      { promptId: 'a', engine: 'chatgpt', score: 1, mentioned: true, importance: 3 },
      { promptId: 'a', engine: 'chatgpt', score: 0, mentioned: false, importance: 3 },
      { promptId: 'b', engine: 'chatgpt', score: 0.8, mentioned: true, importance: 1 },
    ]);
    expect(vs).toBeCloseTo((100 * (3 * 0.5 + 1 * 0.8)) / 4, 8);
  });

  it('overall visibility renormalizes lambda over engines with data', () => {
    expect(overallVisibility({ chatgpt: 50, claude: 100 })).toBeCloseTo((0.35 * 50 + 0.1 * 100) / 0.45, 8);
  });

  it('share of voice, mention and rank-weighted', () => {
    const sov = shareOfVoice([
      [{ entity: 'us', mentioned: true, rank: 1 }, { entity: 'them', mentioned: true, rank: 3 }],
      [{ entity: 'them', mentioned: true, rank: null }, { entity: 'us', mentioned: false }],
    ]);
    expect(sov.us.mention).toBeCloseTo(1 / 3, 8);
    expect(sov.them.mention).toBeCloseTo(2 / 3, 8);
    expect(sov.us.weighted).toBeCloseTo(1 / (1 + 0.5 + 1), 8);
  });

  it('citation rate (response-level) and share (URL-level, deduped)', () => {
    const m = citationMetrics([
      [
        { domain: 'a.com', urlCanonical: 'https://a.com/1', cited: true },
        { domain: 'a.com', urlCanonical: 'https://a.com/1', cited: true },
        { domain: 'b.com', urlCanonical: 'https://b.com/', cited: true },
        { domain: 'c.com', urlCanonical: 'https://c.com/', cited: false },
      ],
      [{ domain: 'a.com', urlCanonical: 'https://a.com/2', cited: true }],
    ]);
    expect(m['a.com']).toEqual({ rate: 1, share: 2 / 3 });
    expect(m['b.com']).toEqual({ rate: 0.5, share: 1 / 3 });
    expect(m['c.com']).toBeUndefined();
  });

  it('net sentiment', () => {
    expect(netSentiment(['positive', 'positive', 'negative', 'neutral'])).toBe(0.25);
  });
});

describe('intervals', () => {
  it('fixed-panel CI reproduces the methodology worked example (~+-4.8 pp)', () => {
    // M=100, R=3, p(1-p) averaging 0.12: half the prompts at p=1/3 (p(1-p)=0.222), half at 0/1 (0).
    const cells = Array.from({ length: 100 }, (_, i) =>
      i < 54 ? { runs: 3, mentioned: 1 } : { runs: 3, mentioned: i % 2 ? 3 : 0 },
    );
    const ci = visibilityCI(cells);
    expect(ci.se).toBeCloseTo(Math.sqrt((54 * (2 / 9)) / 2) / 100, 8);
    expect((ci.hi - ci.lo) / 2).toBeGreaterThan(0.04);
    expect((ci.hi - ci.lo) / 2).toBeLessThan(0.06);
  });

  it('single-run cells contribute no variance; empty input is zero', () => {
    expect(visibilityCI([{ runs: 1, mentioned: 1 }]).se).toBe(0);
    expect(visibilityCI([])).toEqual({ value: 0, lo: 0, hi: 0, se: 0 });
  });

  it('wilson and beta posterior', () => {
    const w = wilsonInterval(4, 6);
    expect(w.value).toBeCloseTo(0.667, 3);
    expect(w.lo).toBeCloseTo(0.3, 1);
    expect(w.hi).toBeCloseTo(0.903, 2);
    expect(betaPosterior(4, 6).value).toBeCloseTo(5 / 8, 8);
  });

  it('change detection needs CI excluding 0 and >= 3 pp', () => {
    const before = new Map(Array.from({ length: 30 }, (_, i) => [`p${i}`, [0, 0, 0, 1]]));
    const after = new Map(Array.from({ length: 30 }, (_, i) => [`p${i}`, [1, 1, 0, 1]]));
    const up = detectChange(before, after, { seed: 7 });
    expect(up.diff).toBeCloseTo(0.5, 8);
    expect(up.significant).toBe(true);
    const flat = detectChange(before, before, { seed: 7 });
    expect(flat.significant).toBe(false);
  });
});
