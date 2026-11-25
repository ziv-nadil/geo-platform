import { describe, expect, it } from 'vitest';
import { BRAND, COMPETITORS, ANSWER_TEXT } from '../../engines/__tests__/fixtures';
import { applyAdjudication, detectMentions, jaroWinkler, levenshtein, summarizeMentions, type TrackedEntity } from '../mentions';
import { normalizeWithMap } from '../text';

const entities: TrackedEntity[] = [BRAND, ...COMPETITORS];

describe('normalizeWithMap', () => {
  it('casefolds, strips diacritics and markdown, keeps offsets into the original', () => {
    const t = 'Try **Café Örbit** now';
    const { norm, map } = normalizeWithMap(t);
    expect(norm).toBe('try cafe orbit now');
    const i = norm.indexOf('orbit');
    expect(t.slice(map[i], map[i + 4] + 1)).toBe('Örbit');
  });
});

describe('detectMentions', () => {
  it('finds brand (longest alias), competitors and positions in a list answer', () => {
    const spans = detectMentions(ANSWER_TEXT, entities);
    const sum = summarizeMentions(ANSWER_TEXT, spans);
    expect(sum.map((s) => s.entityName)).toEqual(['HubSpot', 'Acme CRM', 'Salesforce']);
    const acme = sum.find((s) => s.entityId === 'b1')!;
    expect(acme.surface).toBe('Acme CRM');
    expect(acme.mentionCount).toBe(3); // 2 names + acmecrm.com domain
    expect(ANSWER_TEXT.slice(acme.firstStart, acme.firstStart + 8)).toBe('Acme CRM');
    expect(acme.firstOffset).toBeGreaterThan(0);
    expect(acme.firstOffset).toBeLessThan(1);
  });

  it('matches across diacritics/case and respects word boundaries', () => {
    const e: TrackedEntity = { id: 'x', kind: 'brand', name: 'Zoë Labs', aliases: [], domains: [] };
    expect(detectMentions('We like ZOE LABS a lot', [e])).toHaveLength(1);
    expect(detectMentions('zoelabsx is different', [e])).toHaveLength(0);
  });

  it('owned-domain match counts as a mention', () => {
    const s = detectMentions('Docs live at https://docs.acmecrm.com/start.', [BRAND]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ matchType: 'domain', surface: 'docs.acmecrm.com' });
  });

  it('negative aliases suppress look-alikes', () => {
    const apple: TrackedEntity = { id: 'a', kind: 'brand', name: 'Apple', aliases: [], domains: ['apple.com'], negativeAliases: ['apple pie'] };
    expect(detectMentions('Grandma bakes Apple pie on Sundays.', [apple])).toHaveLength(0);
  });

  it('ambiguous common-word alias needs a context cue, else goes to adjudication', () => {
    const notion: TrackedEntity = { id: 'n', kind: 'competitor', name: 'Notion', aliases: [], domains: ['notion.so'], contextTerms: ['workspace', 'notes app'] };
    const noCue = detectMentions('notion of quality matters here.', [notion]);
    expect(noCue[0]).toMatchObject({ matchType: 'ambiguous', needsAdjudication: true });
    const cue = detectMentions('notion is a popular workspace for teams.', [notion]);
    expect(cue[0]).toMatchObject({ matchType: 'exact', needsAdjudication: false });
    const proper = detectMentions('Teams often pick Notion for docs.', [notion]);
    expect(proper[0].matchType).toBe('exact');
  });

  it('fuzzy catches misspellings of long names and flags them for adjudication', () => {
    const s = detectMentions('Many teams use Salesforse for pipelines.', entities);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ entityId: 'c2', matchType: 'fuzzy', needsAdjudication: true });
    expect(s[0].confidence).toBeGreaterThanOrEqual(0.92);
  });

  it('overlapping entities: the longer span wins', () => {
    const cloud: TrackedEntity = { id: 'c9', kind: 'competitor', name: 'Acme Cloud', aliases: [], domains: [] };
    const s = detectMentions('We moved to Acme Cloud last year.', [BRAND, cloud]);
    expect(s).toHaveLength(1);
    expect(s[0].entityId).toBe('c9');
  });
});

describe('applyAdjudication', () => {
  it('uses LLM decisions, else accepts only strong fuzzy matches', () => {
    const spans = detectMentions('Salesforse and notion of value', [
      COMPETITORS[1],
      { id: 'n', kind: 'competitor', name: 'Notion', aliases: [], domains: [] },
    ]);
    expect(spans.every((s) => s.needsAdjudication)).toBe(true);
    const withLlm = applyAdjudication(spans, new Map([[0, { isBrand: true, confidence: 0.8 }], [1, { isBrand: false, confidence: 0.9 }]]));
    expect(withLlm).toHaveLength(1);
    expect(withLlm[0]).toMatchObject({ entityId: 'c2', matchType: 'llm', confidence: 0.8 });
    const noLlm = applyAdjudication(spans);
    expect(noLlm.find((s) => s.entityId === 'n')).toBeUndefined();
  });
});

describe('string similarity', () => {
  it('levenshtein and jaro-winkler basics', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 3);
    expect(jaroWinkler('abc', 'abc')).toBe(1);
  });
});
