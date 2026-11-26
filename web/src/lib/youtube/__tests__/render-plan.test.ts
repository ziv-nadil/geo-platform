import { describe, expect, it } from 'vitest';
import { barGeometry, chartFilter, cleanScenes, finalArgs, imageSceneArgs, kenBurns, subtitleFilter } from '../../../../scripts/youtube/render-plan.mjs';

describe('render plan', () => {
  it('scales bars to the max value inside the plot area', () => {
    const b = barGeometry([{ label: 'a', value: 50 }, { label: 'b', value: 25 }, { label: 'c', value: 0 }]);
    expect(b[0].h).toBe(460); expect(b[1].h).toBe(230); expect(b[2].h).toBe(6);
    for (const x of b) expect(x.y + x.h).toBe(660);
    expect(b[0].x).toBeLessThan(b[1].x);
  });
  it('alternates Ken Burns motion by scene and uses the scene length in frames', () => {
    expect(kenBurns(0, 4)).toContain('d=120');
    expect(kenBurns(0, 4)).not.toBe(kenBurns(1, 4));
    expect(kenBurns(4, 4)).toBe(kenBurns(0, 4));
    expect(imageSceneArgs(0, 'i.png', 4, 'o.mp4')).toEqual(expect.arrayContaining(['-t', '4', 'o.mp4']));
  });
  it('draws text from files with expansion off (no % surprises) and one bar per point', () => {
    const bars = barGeometry([{ label: 'a', value: 1 }, { label: 'b', value: 2 }]);
    const f: string = chartFilter(bars, { title: 't.txt', values: ['v0', 'v1'], labels: ['l0', 'l1'] });
    expect(f.match(/expansion=none/g)?.length).toBe(5);
    expect(f.match(/color=0x38bdf8/g)?.length).toBe(2);
  });
  it('escapes the subtitle path and burns captions with the audio', () => {
    expect(subtitleFilter("/tmp/a b:c'.srt")).toContain("/tmp/a b\\:c\\'.srt");
    const a: string[] = finalArgs('l.txt', 'v.wav', 'c.srt', 'o.mp4');
    expect(a).toContain('v.wav'); expect(a[a.indexOf('-vf') + 1]).toMatch(/^subtitles=/); expect(a.at(-1)).toBe('o.mp4');
  });
});

describe('cleanScenes (member-writable scene_assets never reach ffmpeg untyped)', () => {
  it('drops scenes whose index or numbers could inject filtergraph options', () => {
    const out = cleanScenes([
      { index: 0, kind: 'card', startSec: 0, endSec: 3, onScreen: 'ok' },
      { index: '1:fontfile=/etc/passwd', kind: 'card', startSec: 0, endSec: 3 },
      { index: 2, kind: 'chart', startSec: 3, endSec: 6, chart: { title: 't', unit: '%', points: [{ label: 'a', value: 1 }, { label: 'b', value: '2,movie=/proc/self/environ' }] } },
      { index: 3, kind: 'evil', startSec: 0, endSec: 1 },
      { index: 4, kind: 'image', startSec: '0', endSec: 1 },
    ]);
    expect(out.map((s) => s.index)).toEqual([0, 2]);
    expect(out[1].chart?.points).toEqual([{ label: 'a', value: 1 }]);
    expect(cleanScenes('nope')).toEqual([]);
  });
});
