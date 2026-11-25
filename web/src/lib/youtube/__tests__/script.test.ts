import { describe, expect, it } from 'vitest';
import { buildSrt, estimateSeconds, fixScript, lintScript, parseScript, srtTime, timeline, type VideoScript } from '../script';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 7}`).join(' ') + '.';
const good = (): VideoScript => ({
  hook: 'Most teams guess which pages AI engines cite. Here is how to check.',
  scenes: Array.from({ length: 5 }, (_, i) => ({ text: words(15) + ' ' + words(15), imagePrompt: `scene ${i}`, chartId: null, onScreen: `Step ${i + 1}` })),
  outro: 'Read the full guide linked below.',
});

describe('lintScript', () => {
  it('passes a clean 60 to 120 s script', () => {
    const s = good();
    expect(estimateSeconds(s)).toBeGreaterThanOrEqual(60);
    expect(lintScript(s)).toEqual([]);
  });
  it('flags em dashes, en dashes and spaced double hyphens', () => {
    for (const d of ['—', '–', ' -- ']) {
      const s = good(); s.scenes[0].text = `Cite sources${d}always. ${words(25)}`;
      expect(lintScript(s).map((i) => i.rule)).toContain('dash');
    }
  });
  it('flags invented credentials', () => {
    for (const t of ['As a doctor I say this.', 'With 20 years of experience we know.', 'I am an expert in this.', 'We are certified.']) {
      const s = good(); s.scenes[1].text = `${t} ${words(25)}`;
      expect(lintScript(s).map((i) => i.rule), t).toContain('credential');
    }
  });
  it('flags length out of range', () => {
    const short = good(); short.scenes = short.scenes.slice(0, 3).map((x) => ({ ...x, text: words(10) }));
    expect(lintScript(short).map((i) => i.rule)).toContain('too_short');
    const long = good(); long.scenes = Array.from({ length: 8 }, (_, i) => ({ text: words(45), imagePrompt: 'x', chartId: null, onScreen: `S${i}` }));
    expect(lintScript(long).map((i) => i.rule)).toContain('too_long');
  });
  it('flags very long sentences and stock phrases', () => {
    const s = good(); s.scenes[0].text = words(40).replace('.', '') + '. Let\'s dive in.';
    const r = lintScript(s).map((i) => i.rule);
    expect(r).toContain('long_sentence'); expect(r).toContain('filler');
  });
  it('fixScript removes dashes mechanically', () => {
    const s = good(); s.scenes[0].text = 'One — two – three';
    expect(fixScript(s).scenes[0].text).toBe('One, two, three');
  });
});

describe('parseScript', () => {
  it('rejects scripts with fewer than 3 scenes and drops unknown charts', () => {
    expect(parseScript({ hook: 'h', outro: 'o', scenes: [{ text: 'a', image_prompt: '', chart_id: '', on_screen: '' }] })).toBeNull();
    const p = parseScript({ hook: 'h', outro: 'o', scenes: [1, 2, 3].map((n) => ({ text: `t${n}`, image_prompt: 'p', chart_id: 'nope', on_screen: '' })) }, ['real']);
    expect(p?.scenes.every((x) => x.chartId === null)).toBe(true);
  });
});

describe('timeline and srt', () => {
  it('scales to the real audio length and covers it fully', () => {
    const t = timeline(good(), 90);
    expect(t.total).toBeCloseTo(90, 5);
    expect(t.lines[0].start).toBe(0);
    expect(t.sceneBounds[0].start).toBe(0);
    expect(t.sceneBounds.at(-1)!.end).toBeCloseTo(90, 5);
    for (let i = 1; i < t.lines.length; i++) expect(t.lines[i].start).toBeCloseTo(t.lines[i - 1].end, 6);
  });
  it('formats srt timestamps and numbered cues', () => {
    expect(srtTime(3661.5)).toBe('01:01:01,500');
    const srt = buildSrt([{ start: 0, end: 4, text: 'one two three four five six seven eight nine ten' }], 5);
    expect(srt.startsWith('1\n00:00:00,000 --> 00:00:02,000\none two three four five')).toBe(true);
    expect(srt).toContain('2\n00:00:02,000 --> 00:00:04,000\nsix seven eight nine ten');
  });
});
