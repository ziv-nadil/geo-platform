import { describe, expect, it } from 'vitest';
import { buildGaps, competitorPresence, domainAuthority, isGapPrompt, scorePrompt, sourceAuthority, type PromptSignal } from '../scoring';

const base = (o: Partial<PromptSignal> = {}): PromptSignal => ({
  promptId: 'p1', text: 'best crm for startups', topicId: 't1', topicName: 'CRM', personaId: null, personaName: null, funnel: 'consideration',
  importance: 1, runs: 4, brandRuns: 0, competitorRuns: 2,
  competitors: [{ id: 'c1', name: 'Rival', mentions: 3, citations: 1 }], domains: [], ...o,
});

describe('gap detection', () => {
  it('needs competitor presence and zero brand presence', () => {
    expect(isGapPrompt(base())).toBe(true);
    expect(isGapPrompt(base({ brandRuns: 1 }))).toBe(false);
    expect(isGapPrompt(base({ competitorRuns: 0 }))).toBe(false);
    expect(isGapPrompt(base({ runs: 0 }))).toBe(false);
  });
});

describe('scoring', () => {
  it('presence = share of runs + 0.1 per extra competitor (capped)', () => {
    expect(competitorPresence(base())).toBeCloseTo(0.5);
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, mentions: 1, citations: 0 }));
    expect(competitorPresence(base({ competitorRuns: 4, competitors: many }))).toBeCloseTo(1.5);
    expect(competitorPresence(base({ competitorRuns: 0 }))).toBe(0);
  });
  it('authority is citation weighted; neutral default without citations', () => {
    expect(sourceAuthority([])).toBe(0.4);
    const a = sourceAuthority([{ domain: 'a.gov', category: 'institutional', citations: 1 }, { domain: 'r.com', category: 'ugc_social', citations: 3 }]);
    expect(a).toBeCloseTo((1 * 1 + 0.4 * 3) / 4);
    expect(domainAuthority('nonsense')).toBe(domainAuthority('other'));
  });
  it('score multiplies importance × presence × authority', () => {
    const s = scorePrompt(base({ importance: 3, domains: [{ domain: 'x.org', category: 'reference', citations: 2 }] }));
    expect(s.score).toBeCloseTo(3 * 0.5 * 0.9);
  });
  it('non-positive importance falls back to 1', () => {
    expect(scorePrompt(base({ importance: 0 })).importance).toBe(1);
  });
});

describe('buildGaps', () => {
  it('groups by topic/persona/funnel, drops covered prompts and ranks by score', () => {
    const gaps = buildGaps([
      base({ promptId: 'a', importance: 1 }),
      base({ promptId: 'b', importance: 2, domains: [{ domain: 'g2.com', category: 'review_aggregator', citations: 3 }] }),
      base({ promptId: 'c', topicId: 't2', topicName: 'Billing', importance: 1, competitorRuns: 1 }),
      base({ promptId: 'd', topicId: 't3', brandRuns: 2 }),
    ]);
    expect(gaps.map((g) => g.topicId)).toEqual(['t1', 't2']);
    expect(gaps[0].promptIds).toEqual(['b', 'a']);
    expect(gaps[0].score).toBeGreaterThan(gaps[1].score);
    expect(gaps[0].label).toBe('CRM · consideration');
    expect(gaps[0].topDomains[0]).toMatchObject({ domain: 'g2.com', authority: 0.8 });
    expect(gaps[0].competitors[0]).toMatchObject({ id: 'c1', mentions: 6, citations: 2 });
  });
});
