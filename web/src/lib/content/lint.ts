/** Human-style post-processing for generated copy (pure): dashes, filler phrases, emoji, sentence rhythm. */

export interface LintChanges { emDash: number; enDash: number; filler: number; emoji: number; variety: number }
export interface LintResult { text: string; changes: LintChanges }

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{200D}\u{FE0F}\u{20E3}]/gu;

/** [pattern, replacement]. Replacement '' deletes the phrase and re-capitalises what follows. */
const FILLER: [RegExp, string][] = [
  [/\bin today['’]s (?:fast[- ]paced|digital|ever[- ]changing|rapidly evolving|modern) (?:world|landscape|era|age|environment)[, ]*/gi, ''],
  [/\bin the (?:ever[- ]evolving|ever[- ]changing|rapidly evolving) (?:world|landscape) of\b/gi, 'in'],
  [/\bit(?:['’]s| is) (?:important|worth|crucial|essential) (?:to note|noting|to mention|to remember|to highlight)(?: that)?[, ]*/gi, ''],
  [/\bit(?:['’]s| is) worth (?:mentioning|pointing out)(?: that)?[, ]*/gi, ''],
  [/\bneedless to say[, ]*/gi, ''],
  [/\bwhen it comes to\b/gi, 'for'],
  [/\bat the end of the day[, ]*/gi, ''],
  [/\bin conclusion[, ]*/gi, ''],
  [/\bin summary[, ]*/gi, ''],
  [/\bin the realm of\b/gi, 'in'],
  [/\bdelves into\b/gi, 'looks at'],
  [/\bdelve into\b/gi, 'look at'],
  [/\bdelving into\b/gi, 'looking at'],
  [/\bdelved into\b/gi, 'looked at'],
  [/\bdelves\b/gi, 'digs'],
  [/\bdelve\b/gi, 'dig'],
  [/\bdelving\b/gi, 'digging'],
  [/\bnavigate the (?:complexities|landscape) of\b/gi, 'handle'],
  [/\bunlock(?:s|ing)? the (?:full )?(?:power|potential) of\b/gi, 'use'],
  [/\bgame[- ]chang(?:er|ing)\b/gi, 'significant'],
  [/\bseamless(?:ly)?\b/gi, 'smooth'],
  [/\bleverag(?:e|es|ing)\b/gi, 'use'],
  [/\brobust\b/gi, 'solid'],
  [/\btapestry\b/gi, 'mix'],
  [/\bembark on a journey\b/gi, 'start'],
  [/\bever[- ]evolving\b/gi, 'changing'],
  [/\bcutting[- ]edge\b/gi, 'modern'],
  [/\bstate[- ]of[- ]the[- ]art\b/gi, 'modern'],
  [/\bcomprehensive guide to\b/gi, 'guide to'],
];

const capitalise = (s: string) => s.replace(/^(\s*)([a-z])/, (_, w: string, c: string) => w + c.toUpperCase());

/** Only prose lines are rewritten; headings, tables, lists, quotes, code and HTML are left alone. */
const isProse = (line: string) => line.trim() !== '' && !/^\s*(#{1,6}\s|\||[-*+]\s|\d+[.)]\s|>|```|<)/.test(line);

export function sentences(p: string): string[] {
  return p.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}
const wc = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

export function sentenceStats(text: string): { count: number; mean: number; stdev: number; cv: number } {
  const lens = text.split('\n').filter(isProse).flatMap(sentences).map(wc).filter((n) => n > 0);
  if (!lens.length) return { count: 0, mean: 0, stdev: 0, cv: 0 };
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const stdev = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  return { count: lens.length, mean, stdev, cv: mean ? stdev / mean : 0 };
}

const SAFE_LOWER = /^(The|It|This|That|These|Those|They|We|You|Our|A|An|There|Here|He|She|Its|Their|Your)\b/;
const SPLIT_AT = /, (but|while|so|and then|which means) /;

/** A paragraph of 4+ sentences with near-identical lengths reads robotic: split the longest, merge the shortest pair. */
function varyParagraph(p: string): { text: string; changed: boolean } {
  const ss = sentences(p);
  if (ss.length < 4) return { text: p, changed: false };
  const lens = ss.map(wc);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const cv = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length) / (mean || 1);
  if (cv >= 0.3) return { text: p, changed: false };
  const out = [...ss];
  let changed = false;
  const i = lens.indexOf(Math.max(...lens));
  const m = out[i].match(SPLIT_AT);
  if (m && m.index !== undefined && lens[i] >= 12) {
    // Split the longest sentence at a conjunction.
    {
      const head = out[i].slice(0, m.index);
      const tail = capitalise(`${m[1] === 'which means' ? 'That means' : m[1]} ${out[i].slice(m.index + m[0].length)}`);
      out.splice(i, 1, `${head}.`, tail);
      changed = true;
    }
  }
  if (!changed) {
    // Short and even: merge the first adjacent pair whose second sentence can be lower-cased safely.
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      if (/[.]$/.test(a) && SAFE_LOWER.test(b)) {
        out.splice(i, 2, `${a.slice(0, -1)}, and ${b.charAt(0).toLowerCase()}${b.slice(1)}`);
        changed = true;
        break;
      }
    }
  }
  return { text: out.join(' '), changed };
}

export function lintText(input: string): LintResult {
  const changes: LintChanges = { emDash: 0, enDash: 0, filler: 0, emoji: 0, variety: 0 };
  let inCode = false;
  const lines = input.split('\n').map((line) => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return line; }
    if (inCode || /^\s*<script/.test(line)) return line;
    let t = line.replace(EMOJI, () => { changes.emoji++; return ''; });
    if (t !== line) t = t.replace(/ +([.,!?;:])/g, '$1');
    // Dashes used as pauses become commas; numeric ranges keep a plain hyphen.
    t = t.replace(/(\d)\s?–\s?(\d)/g, (_, x: string, y: string) => { changes.enDash++; return `${x}-${y}`; });
    t = t.replace(/\s*—\s*|\s+--\s+|\s+–\s+|–/g, (m) => { if (m.includes('—')) changes.emDash++; else changes.enDash++; return ', '; });
    t = t.replace(/,\s*,/g, ',').replace(/,\s*([.!?:;])/g, '$1').replace(/\s+,/g, ',');
    if (isProse(t)) {
      for (const [re, rep] of FILLER) {
        t = t.replace(re, (m, off: number) => {
          changes.filler++;
          if (rep) return /^[A-Z]/.test(m) ? capitalise(rep) : rep;
          return off === 0 || /[.!?]\s*$/.test(t.slice(0, off)) ? '\u0000' : '';
        });
      }
      // A deleted sentence opener leaves a marker: drop it and capitalise the next word.
      t = t.replace(/\u0000\s*([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/\u0000/g, '');
    }
    return t.replace(/(\S) {2,}/g, '$1 ').replace(/ +$/, '');
  });
  const out = lines.map((line) => {
    if (!isProse(line)) return line;
    const r = varyParagraph(line);
    if (r.changed) changes.variety++;
    return r.text;
  });
  return { text: out.join('\n'), changes };
}

export const totalChanges = (c: LintChanges) => c.emDash + c.enDash + c.filler + c.emoji + c.variety;

/** Residual problems after linting (for tests and for gating delivery). */
export function lintIssues(text: string): string[] {
  const issues: string[] = [];
  if (/—/.test(text)) issues.push('em dash');
  if (/ – /.test(text)) issues.push('en dash used as a pause');
  if (EMOJI.test(text)) issues.push('emoji');
  EMOJI.lastIndex = 0;
  for (const [re] of FILLER) { if (re.test(text)) issues.push(`filler: ${re.source.slice(0, 30)}`); re.lastIndex = 0; }
  return issues;
}
