import { describe, expect, it } from 'vitest';
import { buildSuggestions, competitorPresence, dedupe, gscEligible, intentScore, scoreSuggestion } from '../engine';

describe('dedupe', () => {
  it('merges near-duplicates and unions sources', () => {
    const s = buildSuggestions([
      { text: 'best crm for small business', source: 'gsc', volume: 900 },
      { text: 'What is the best CRM for small businesses?', source: 'paa' },
      { text: 'how to migrate from salesforce', source: 'llm' },
    ], []);
    expect(s).toHaveLength(2);
    const crm = s.find((x) => x.text.toLowerCase().includes('crm'))!;
    expect(crm.sources.sort()).toEqual(['gsc', 'paa']);
    expect(crm.volume).toBe(900);
  });
  it('drops too-short text', () => expect(dedupe([{ text: 'crm', source: 'llm' }])).toHaveLength(0));
});

describe('scoring', () => {
  it('prefers conversational, high-volume, competitor-bearing prompts', () => {
    expect(intentScore('crm')).toBeLessThan(intentScore('which crm should i pick for a 20 person sales team'));
    expect(competitorPresence('hubspot vs pipedrive pricing', ['HubSpot', 'Pipedrive'])).toBe(0.8);
    expect(competitorPresence('crm pricing', ['HubSpot'])).toBe(0);
    const hi = scoreSuggestion({ volume: 10_000, intent: 0.8, competitorPresence: 0.6 }).score;
    const lo = scoreSuggestion({ volume: 100, intent: 0.8, competitorPresence: 0 }).score;
    expect(hi).toBeGreaterThan(lo);
  });
  it('gives unknown volume a neutral floor and ranks results desc', () => {
    const s = buildSuggestions([{ text: 'which crm is best for a startup team', source: 'llm' }, { text: 'crm pricing comparison hubspot vs zoho', source: 'gsc', volume: 5000 }], ['HubSpot']);
    expect(s[0]!.score).toBeGreaterThanOrEqual(s[1]!.score);
    expect(s.every((x) => x.score > 0)).toBe(true);
  });
  it('filters GSC queries', () => {
    expect(gscEligible('crm')).toBe(false);
    expect(gscEligible('how crm')).toBe(true);
    expect(gscEligible('best crm for real estate agents')).toBe(true);
  });
});
