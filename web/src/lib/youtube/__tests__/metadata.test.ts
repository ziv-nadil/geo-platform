import { describe, expect, it } from 'vitest';
import { aiDisclosure, buildChapters, buildDescription, chapterStamp, cleanTags, cleanTitle, lintMetadata, parseChapters, withUtm, type VideoMetadata } from '../metadata';
import { FULL_PLAN, videoCost, videosAffordable } from '../quota';

describe('chapters', () => {
  it('formats stamps', () => {
    expect(chapterStamp(0)).toBe('0:00'); expect(chapterStamp(65)).toBe('1:05'); expect(chapterStamp(3723)).toBe('1:02:03');
  });
  it('starts at 0:00, needs 3+, keeps each at least 10 s and merges short scenes', () => {
    const bounds = [0, 8, 20, 24, 45, 70].map((s, i, a) => ({ start: s, end: a[i + 1] ?? 95 }));
    const c = buildChapters(bounds, ['Intro', 'Too soon', 'The problem', 'Quick', 'The fix', 'Wrap up'], 95);
    expect(c[0]).toEqual({ start: 0, title: 'Intro' });
    expect(c.map((x) => x.title)).toEqual(['Intro', 'The problem', 'The fix', 'Wrap up']);
    for (let i = 1; i < c.length; i++) expect(c[i].start - c[i - 1].start).toBeGreaterThanOrEqual(10);
  });
  it('returns none when fewer than three chapters are possible', () => {
    expect(buildChapters([{ start: 0, end: 30 }, { start: 30, end: 60 }], ['A', 'B'], 60)).toEqual([]);
  });
  it('folds a trailing chapter shorter than 10 s', () => {
    const c = buildChapters([0, 20, 40, 63].map((s, i, a) => ({ start: s, end: a[i + 1] ?? 70 })), ['A', 'B', 'C', 'D'], 70);
    expect(c.map((x) => x.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('description, title, tags', () => {
  const base = { answer: 'AI engines cite pages with sourced numbers.', blogUrl: 'https://acme.com/blog/geo?ref=x', blogTitle: 'The GEO guide', brandName: 'Acme', personaName: 'Acme Insights Desk',
    chapters: [{ start: 0, title: 'Intro' }, { start: 20, title: 'Why' }, { start: 45, title: 'How' }], takeaways: ['Cite sources'], sources: [{ title: 'Study', url: 'https://example.org/s' }] };
  it('leads with answer and blog link, includes chapters and the AI disclosure', () => {
    const d = buildDescription(base);
    expect(d.split('\n')[0]).toContain('https://acme.com/blog/geo?ref=x&utm_source=youtube&utm_medium=video');
    expect(d.split('\n')[0].length).toBeLessThan(200);
    expect(parseChapters(d)).toEqual(base.chapters);
    expect(d).toContain(aiDisclosure('Acme', 'Acme Insights Desk'));
    expect(d).not.toMatch(/[<>—]/);
  });
  it('stays under 5000 bytes and keeps the link and disclosure', () => {
    const d = buildDescription({ ...base, takeaways: Array(5).fill('x'.repeat(900)), sources: Array(6).fill({ title: 'S'.repeat(80), url: 'https://e.org/' + 'a'.repeat(900) }) });
    expect(Buffer.byteLength(d)).toBeLessThanOrEqual(5000);
    expect(d).toContain('acme.com'); expect(d).toContain('AI voice');
  });
  it('limits titles to 70 chars without angle brackets or em dashes', () => {
    const t = cleanTitle('How <b>AI engines</b> decide which brands to cite — and what you can do about it this quarter');
    expect(t.length).toBeLessThanOrEqual(70); expect(t).not.toMatch(/[<>—]/);
  });
  it('dedupes tags and respects the 500 char budget', () => {
    expect(cleanTags(['GEO', 'geo', '#AI search', 'a,b'])).toEqual(['GEO', 'AI search', 'ab']);
    expect(cleanTags(Array.from({ length: 100 }, (_, i) => `tag number ${i} ${'x'.repeat(30)}`), 100).join(',').length).toBeLessThanOrEqual(500);
  });
  it('adds utm without overriding existing values', () => {
    expect(withUtm('https://a.com/p?utm_source=news')).toBe('https://a.com/p?utm_source=news&utm_medium=video');
    expect(withUtm('not a url')).toBe('not a url');
  });
});

describe('lintMetadata', () => {
  const ok = (): VideoMetadata => {
    const chapters = [{ start: 0, title: 'Intro' }, { start: 20, title: 'Why' }, { start: 45, title: 'How' }];
    return { title: 'How AI engines pick sources', titleVariants: [], tags: ['geo', 'ai search', 'seo'], categoryId: '27', playlist: 'GEO', chapters, thumbnailPrompt: '', thumbnailText: '', language: 'en',
      containsSyntheticMedia: true, blogUrl: 'https://acme.com/blog/geo',
      description: buildDescription({ answer: 'A.', blogUrl: 'https://acme.com/blog/geo', blogTitle: 'G', chapters, takeaways: [], sources: [], brandName: 'Acme', personaName: '' }) };
  };
  it('accepts good metadata', () => expect(lintMetadata(ok())).toEqual([]));
  it('requires blog link, disclosure, synthetic flag, tags and valid chapters', () => {
    const m = ok(); m.description = 'No link.'; m.containsSyntheticMedia = false; m.tags = ['a']; m.chapters = [{ start: 0, title: 'a' }, { start: 5, title: 'b' }, { start: 9, title: 'c' }];
    const f = lintMetadata(m).map((i) => i.field + ':' + i.message.slice(0, 12));
    expect(f.join()).toMatch(/description/); expect(f.join()).toMatch(/synthetic/); expect(f.join()).toMatch(/tags/); expect(f.join()).toMatch(/chapters/);
  });
  it('blocks when the blog has no public URL', () => { const m = ok(); m.blogUrl = ''; expect(lintMetadata(m).some((i) => i.field === 'blogUrl')).toBe(true); });
});

describe('quota math', () => {
  it('current model: 550 units per full video, 18 per day', () => {
    expect(videoCost(FULL_PLAN, 'current')).toBe(550);
    expect(videosAffordable(FULL_PLAN, 'current', 0, 0)).toBe(18);
    expect(videosAffordable(FULL_PLAN, 'current', 9_500, 0)).toBe(0);
    expect(videosAffordable({ ...FULL_PLAN, captions: false }, 'current', 0, 99)).toBe(1);
  });
  it('legacy model: insert 1600 from the main pool, 4 per day', () => {
    expect(videoCost(FULL_PLAN, 'legacy')).toBe(2150);
    expect(videosAffordable(FULL_PLAN, 'legacy', 0, 0)).toBe(4);
  });
});
