/**
 * Text normalization that keeps a map back to original character offsets, so mention spans found
 * in normalized text point at the right place in the stored answer.
 */

export interface NormalizedText {
  /** NFKD, diacritics stripped, casefolded, markdown syntax blanked, whitespace collapsed. */
  norm: string;
  /** map[i] = index in the original string of norm[i]. map[norm.length] = original length. */
  map: number[];
}

const COMBINING = /\p{M}/u;

/** Blank markdown syntax (keeps link text, drops link targets) without changing string length. */
export function blankMarkdown(text: string): string {
  let t = text.replace(/\]\((?:[^()\s]|\([^()]*\))*\)/g, (m) => ' '.repeat(m.length)); // ](url)
  t = t.replace(/[*_`#>[\]|~]/g, ' ');
  return t;
}

export function normalizeWithMap(text: string): NormalizedText {
  const src = blankMarkdown(text);
  let norm = '';
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    // Keep surrogate pairs together.
    const code = src.codePointAt(i)!;
    const full = code > 0xffff ? src.slice(i, i + 2) : ch;
    const decomposed = full.normalize('NFKD').toLowerCase();
    for (const c of decomposed) {
      if (COMBINING.test(c)) continue;
      const isSpace = /\s/.test(c);
      if (isSpace) {
        if (lastWasSpace) continue;
        norm += ' ';
        map.push(i);
        lastWasSpace = true;
      } else {
        norm += c;
        for (let k = 0; k < c.length; k++) map.push(i);
        lastWasSpace = false;
      }
    }
    if (full.length === 2) i++;
  }
  map.push(src.length);
  return { norm, map };
}

/** Normalize a short string (alias) the same way, without the map. */
export function normalizeTerm(s: string): string {
  return normalizeWithMap(s).norm.trim();
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sentence boundaries [start, end) over the original text. Boundaries: newlines, and . ! ? followed
 * by whitespace, except after list numbers ("2.") and single-letter initials ("J.").
 */
export function sentenceRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  const push = (end: number) => {
    if (text.slice(start, end).trim()) out.push([start, end]);
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      push(i + 1);
      continue;
    }
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    let j = i;
    while (j + 1 < text.length && /[.!?)"\u201d]/.test(text[j + 1])) j++;
    if (j + 1 < text.length && !/\s/.test(text[j + 1])) continue;
    const token = text.slice(start, i).trim().split(/\s+/).pop() ?? '';
    if (ch === '.' && (/^\d{1,3}$/.test(token) || /^\p{Lu}$/u.test(token))) continue;
    push(j + 1);
    i = j;
  }
  push(text.length);
  return out;
}
