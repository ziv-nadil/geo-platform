/** Video script model, LLM schema, validating parser and lint (pure). 60 to 120 s, human tone, no em dashes. */
export interface ScriptScene { text: string; imagePrompt: string; chartId: string | null; onScreen: string }
export interface VideoScript { hook: string; scenes: ScriptScene[]; outro: string }

export const WORDS_PER_SECOND = 2.5; // ~150 wpm, a calm explainer pace
export const MIN_SECONDS = 60;
export const MAX_SECONDS = 120;

const str = { type: 'string' } as const;
export const SCRIPT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['hook', 'scenes', 'outro'],
  properties: {
    hook: str,
    scenes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'image_prompt', 'chart_id', 'on_screen'],
      properties: { text: str, image_prompt: str, chart_id: str, on_screen: str } } },
    outro: str,
  },
} as const;

const s = (v: unknown, max = 1200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const wordCount = (t: string) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Every spoken line in order: hook, scene texts, outro. */
export function spokenLines(sc: VideoScript): string[] { return [sc.hook, ...sc.scenes.map((x) => x.text), sc.outro].filter(Boolean); }
export const spokenText = (sc: VideoScript) => spokenLines(sc).join(' ');
export const estimateSeconds = (sc: VideoScript) => Math.round(wordCount(spokenText(sc)) / WORDS_PER_SECOND);

/** Clamp a model answer into a VideoScript. null when unusable (no hook or fewer than 3 scenes). */
export function parseScript(data: unknown, chartIds: string[] = []): VideoScript | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const hook = s(d.hook, 400), outro = s(d.outro, 500);
  const scenes = (Array.isArray(d.scenes) ? d.scenes : []).slice(0, 12).map((x): ScriptScene | null => {
    const o = (x ?? {}) as Record<string, unknown>;
    const text = s(o.text, 700);
    if (!text) return null;
    const cid = s(o.chart_id, 80);
    return { text, imagePrompt: s(o.image_prompt, 400), chartId: cid && chartIds.includes(cid) ? cid : null, onScreen: s(o.on_screen, 60) };
  }).filter((x): x is ScriptScene => x !== null);
  if (!hook || scenes.length < 3) return null;
  return { hook, scenes, outro };
}

const DASH = /[–—―−]|(?:\s--\s)/;
const CREDENTIALS = /\b(as an? (?:doctor|lawyer|attorney|cpa|engineer|professor|expert)|(?:\d+|many|several|decades of)\s+years? of experience|i(?:'ve| have) been (?:doing|working|in)|certified|board[- ]certified|ph\.?d\b|my clients|in my career|i(?:'m| am) an? (?:expert|specialist|consultant|doctor|engineer))\b/i;
const FILLER = /\b(in today'?s fast[- ]paced|game[- ]chang|unlock the (?:power|secrets)|delve|dive deep|let'?s dive|in conclusion|revolutionary|cutting[- ]edge)\b/i;

export interface LintIssue { rule: 'dash' | 'credential' | 'filler' | 'too_short' | 'too_long' | 'long_sentence' | 'empty_visual'; message: string }

/** Rules a script must pass before it can be approved. */
export function lintScript(sc: VideoScript): LintIssue[] {
  const out: LintIssue[] = [];
  const all = [...spokenLines(sc), ...sc.scenes.map((x) => x.onScreen)].join('\n');
  if (DASH.test(all)) out.push({ rule: 'dash', message: 'Contains an em dash, en dash or spaced double hyphen. Use a comma, period or "to".' });
  if (CREDENTIALS.test(all)) out.push({ rule: 'credential', message: 'Claims a personal credential or experience. The presenter is a branded persona, so remove it.' });
  if (FILLER.test(all)) out.push({ rule: 'filler', message: 'Uses stock AI phrasing. Say it plainly.' });
  const sec = estimateSeconds(sc);
  if (sec < MIN_SECONDS) out.push({ rule: 'too_short', message: `About ${sec} s spoken; the target is ${MIN_SECONDS} to ${MAX_SECONDS} s.` });
  if (sec > MAX_SECONDS) out.push({ rule: 'too_long', message: `About ${sec} s spoken; the target is ${MIN_SECONDS} to ${MAX_SECONDS} s.` });
  for (const line of spokenLines(sc)) for (const sent of line.split(/(?<=[.!?])\s+/)) if (wordCount(sent) > 28) { out.push({ rule: 'long_sentence', message: `A sentence runs ${wordCount(sent)} words; keep it speakable: "${sent.slice(0, 50)}..."` }); break; }
  if (sc.scenes.some((x) => !x.imagePrompt && !x.chartId)) out.push({ rule: 'empty_visual', message: 'A scene has neither an image prompt nor a chart.' });
  return out;
}

/** Mechanical clean-up that is always safe: dashes to commas, trim. Credential and length issues stay for a human. */
export function fixScript(sc: VideoScript): VideoScript {
  const f = (t: string) => t.replace(/\s*[–—―]\s*/g, ', ').replace(/\s--\s/g, ', ').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
  return { hook: f(sc.hook), outro: f(sc.outro), scenes: sc.scenes.map((x) => ({ ...x, text: f(x.text), onScreen: f(x.onScreen) })) };
}

export interface Timed { start: number; end: number; text: string }

/** Lay lines on a timeline. With actualSec (the real audio length) the estimate is scaled to fit it. */
export function timeline(sc: VideoScript, actualSec?: number): { lines: Timed[]; sceneBounds: { start: number; end: number }[]; total: number } {
  const lines = spokenLines(sc);
  const est = lines.map((l) => Math.max(1.5, wordCount(l) / WORDS_PER_SECOND));
  const sum = est.reduce((a, b) => a + b, 0);
  const k = actualSec && actualSec > 0 ? actualSec / sum : 1;
  let t = 0;
  const timed: Timed[] = lines.map((text, i) => { const start = t; t += est[i] * k; return { start, end: t, text }; });
  const offset = sc.hook ? 1 : 0;
  const sceneBounds = sc.scenes.map((_, i) => ({ start: timed[i + offset].start, end: timed[i + offset].end }));
  if (sceneBounds.length) { sceneBounds[0].start = 0; if (sc.outro) sceneBounds[sceneBounds.length - 1].end = t; else sceneBounds[sceneBounds.length - 1].end = t; }
  return { lines: timed, sceneBounds, total: t };
}

/** Timeline from the real per-line audio durations (hook, scenes, outro order, same as spokenLines). */
export function timelineFromDurations(sc: VideoScript, durations: number[]): { lines: Timed[]; sceneBounds: { start: number; end: number }[]; total: number } {
  const lines = spokenLines(sc);
  let t = 0;
  const timed: Timed[] = lines.map((text, i) => { const start = t; t += durations[i] ?? 0; return { start, end: t, text }; });
  const offset = sc.hook ? 1 : 0;
  const sceneBounds = sc.scenes.map((_, i) => ({ start: timed[i + offset].start, end: timed[i + offset].end }));
  if (sceneBounds.length) { sceneBounds[0].start = 0; sceneBounds[sceneBounds.length - 1].end = t; }
  return { lines: timed, sceneBounds, total: t };
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
export function srtTime(sec: number): string {
  const ms = Math.round((sec % 1) * 1000), whole = Math.floor(sec);
  return `${pad(whole / 3600)}:${pad((whole % 3600) / 60)}:${pad(whole % 60)},${pad(ms === 1000 ? 999 : ms, 3)}`;
}

/** SRT with short on-screen cues (about 7 words each) spread across each line's time slot. */
export function buildSrt(lines: Timed[], maxWords = 7): string {
  const cues: { start: number; end: number; text: string }[] = [];
  for (const l of lines) {
    const words = l.text.split(/\s+/).filter(Boolean);
    const n = Math.max(1, Math.ceil(words.length / maxWords));
    const per = Math.ceil(words.length / n);
    for (let i = 0; i < n; i++) {
      const chunk = words.slice(i * per, (i + 1) * per);
      if (!chunk.length) continue;
      const a = l.start + ((l.end - l.start) * (i * per)) / words.length;
      const b = l.start + ((l.end - l.start) * Math.min(words.length, (i + 1) * per)) / words.length;
      cues.push({ start: a, end: b, text: chunk.join(' ') });
    }
  }
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}
