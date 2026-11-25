import { describe, expect, it } from 'vitest';
import { buildCitations, classifySource, toDbSourceType } from '../citations';
import { analyzeResponse } from '../analyze';
import type { JudgeCall, LlmJudge } from '../judge';
import { parseAdjudication, parseDomainCategory, parseEntities, parseSentiment, sentencesAround, toDbSentiment } from '../llm-tasks';
import { canonicalizeUrl, normalizeDomain, registrableDomain } from '../url';
import { parseOpenAIResponse } from '../../engines/adapters/openai';
import { ANSWER_TEXT, BRAND, COMPETITORS, openaiResponse } from '../../engines/__tests__/fixtures';

describe('url + citations', () => {
  it('canonicalizes and finds registrable domains', () => {
    expect(canonicalizeUrl('HTTP://WWW.Example.com/a/?utm_source=openai&b=2&a=1#x')).toBe('https://example.com/a?a=1&b=2');
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com');
    expect(registrableDomain('blog.acme.co.uk')).toBe('acme.co.uk');
    expect(normalizeDomain('https://www.Acme.com/about')).toBe('acme.com');
  });

  it('classifies sources: owned, competitor, rules, institutional, unknown', () => {
    const ctx = { ownedDomains: ['acmecrm.com'], competitorDomains: [{ competitorId: 'c1', domains: ['hubspot.com'] }] };
    const cls = (u: string) => {
      const [c] = buildCitations([{ url: u, cited: true }]);
      return classifySource(c.urlCanonical, c.domain, ctx);
    };
    expect(cls('https://docs.acmecrm.com/x').category).toBe('owned');
    expect(cls('https://blog.hubspot.com/y')).toMatchObject({ category: 'competitor', competitorId: 'c1' });
    expect(cls('https://www.reddit.com/r/crm').category).toBe('ugc_social');
    expect(cls('https://youtu.be/abc').category).toBe('video');
    expect(cls('https://en.wikipedia.org/wiki/CRM').category).toBe('reference');
    expect(cls('https://www.nist.gov/a').category).toBe('institutional');
    expect(cls('https://some-vendor.io/').source).toBe('unknown');
    expect(toDbSourceType('review_aggregator')).toBe('earned');
    expect(toDbSourceType('video')).toBe('ugc');
  });
});

describe('judge output parsers', () => {
  it('clamp and default malformed output', () => {
    expect(parseSentiment({ label: 'ecstatic', score: 7, aspects: [{ name: 'price', polarity: -3 }, { name: 'vibes', polarity: 1 }], confidence: 2 }))
      .toMatchObject({ label: 'neutral', score: 1, aspects: [{ name: 'price', polarity: -1 }], confidence: 1 });
    expect(parseAdjudication(null)).toEqual({ isBrand: false, confidence: 0 });
    expect(parseEntities({ is_list: true, entities: [{ name: 'A', rank: 1, role: 'x' }, { name: 'a', rank: 2, role: 'neutral' }, { name: '', rank: 3 }] }))
      .toEqual({ isList: true, entities: [{ name: 'A', rank: 1, role: 'neutral' }] });
    expect(parseDomainCategory({ category: 'owned', confidence: 0.9 }).category).toBe('other');
    expect(toDbSentiment('mixed')).toBe('neutral');
  });

  it('sentencesAround keeps the mention sentence plus one either side', () => {
    const t = 'One. Two mentions Acme. Three. Four.';
    expect(sentencesAround(t, [{ start: t.indexOf('Acme'), end: t.indexOf('Acme') + 4 }])).toEqual(['One.', 'Two mentions Acme.', 'Three.']);
    const list = 'Intro line:\n1. Alpha is ok.\n2. Acme CRM is great. Really.\n3. Gamma.';
    expect(sentencesAround(list, [{ start: list.indexOf('Acme'), end: list.indexOf('Acme') + 4 }])).toEqual(['1. Alpha is ok.', '2. Acme CRM is great.', 'Really.']);
  });
});

/** Deterministic fake judge: answers per task, records calls. */
function fakeJudge(): LlmJudge & { calls: JudgeCall[] } {
  const calls: JudgeCall[] = [];
  return {
    vendor: 'anthropic',
    model: 'fake',
    calls,
    async json(call) {
      calls.push(call);
      const data =
        call.task === 'extract_entities'
          ? {
              is_list: true,
              entities: [
                { name: 'HubSpot', rank: 1, role: 'recommended' },
                { name: 'Acme CRM', rank: 2, role: 'recommended' },
                { name: 'Salesforce', rank: 3, role: 'neutral' },
                { name: 'Pipedrive', rank: 4, role: 'recommended' },
                { name: 'Reddit', rank: null, role: 'source_only' },
              ],
            }
          : call.task === 'judge_sentiment'
            ? { label: 'positive', score: 0.5, aspects: [{ name: 'support', polarity: 1 }], evidence_quote: 'great support', confidence: 0.9 }
            : call.task === 'classify_domain'
              ? { category: 'earned_media', confidence: 0.7 }
              : { is_brand: true, confidence: 0.9 };
      return { data, costUsd: 0.0001 };
    },
  };
}

describe('analyzeResponse', () => {
  const citations = buildCitations(parseOpenAIResponse(openaiResponse).citations);

  it('end to end with a judge: ranks, candidates, sentiment, owned citation, score', async () => {
    const judge = fakeJudge();
    const out = await analyzeResponse({ engine: 'chatgpt', text: ANSWER_TEXT, citations, brand: BRAND, competitors: COMPETITORS, judge });
    expect(out.brandMentioned).toBe(true);
    const brand = out.mentions.find((m) => m.entityKind === 'brand')!;
    expect(brand.rank).toBe(2);
    expect(brand.role).toBe('recommended');
    expect(brand.sentiment).toMatchObject({ label: 'positive', score: 0.5 });
    expect(out.mentions.find((m) => m.entityId === 'c1')!.rank).toBe(1);
    expect(out.candidates).toEqual([{ name: 'Pipedrive', rank: 4, role: 'recommended' }]);
    expect(out.ownedCited).toBe(true);
    // pos = 1/log2(3); score = (0.55 + 0.25*pos + 0.2) * (0.5 + 0.25*1.5)
    const pos = 1 / Math.log2(3);
    expect(out.position).toBeCloseTo(pos, 4);
    expect(out.score).toBeCloseTo((0.55 + 0.25 * pos + 0.2) * 0.875, 4);
    expect(out.citations.find((c) => c.domain === 'acmecrm.com')!.category).toBe('owned');
    expect(out.citations.find((c) => c.domain === 'g2.com')!.category).toBe('review_aggregator');
    expect(out.judgeCostUsd).toBeGreaterThan(0);
    // sentiment judged only on sentences around the brand
    const sentCall = judge.calls.find((c) => c.task === 'judge_sentiment')!;
    expect(sentCall.user).toContain('Acme CRM');
    expect(sentCall.user).not.toContain('For mid-size teams');
  });

  it('without a judge: rule-only, no rank, prose position from first offset', async () => {
    const out = await analyzeResponse({ engine: 'chatgpt', text: ANSWER_TEXT, citations, brand: BRAND, competitors: COMPETITORS, judge: null });
    const brand = out.mentions.find((m) => m.entityKind === 'brand')!;
    expect(brand.rank).toBeNull();
    expect(brand.sentiment).toBeNull();
    expect(out.position).toBeCloseTo(1 - brand.firstOffset, 4);
    expect(out.candidates).toEqual([]);
    expect(out.judgeCostUsd).toBe(0);
  });

  it('brand absent: score 0, no sentiment call', async () => {
    const judge = fakeJudge();
    const out = await analyzeResponse({ engine: 'claude', text: 'HubSpot is great.', citations: [], brand: BRAND, competitors: COMPETITORS, judge });
    expect(out.brandMentioned).toBe(false);
    expect(out.score).toBe(0);
    expect(judge.calls.some((c) => c.task === 'judge_sentiment')).toBe(false);
  });

  it('empty answer (AI Overview absent) is not mentioned and makes no judge calls', async () => {
    const judge = fakeJudge();
    const out = await analyzeResponse({ engine: 'google_aio', text: '', citations: [], brand: BRAND, competitors: COMPETITORS, judge });
    expect(out).toMatchObject({ brandMentioned: false, score: 0, mentions: [] });
    expect(judge.calls).toHaveLength(0);
  });
});
