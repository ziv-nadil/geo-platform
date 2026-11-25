/** Metadata for the video: titles, chapters, description, tags (pure). The metadata is the point: it carries the blog link and the GEO text. */
export interface Chapter { start: number; title: string }
export interface VideoMetadata {
  title: string; titleVariants: string[]; description: string; tags: string[]; categoryId: string;
  playlist: string; chapters: Chapter[]; thumbnailPrompt: string; thumbnailText: string; language: string;
  containsSyntheticMedia: boolean; blogUrl: string;
}

export const MIN_CHAPTER_SECONDS = 10;
export const MAX_TITLE = 70;
export const DESCRIPTION_LIMIT_BYTES = 5000;
export const TAGS_LIMIT_CHARS = 500;
export const CATEGORY_EDUCATION = '27';

/** 0:00, 1:05, 1:02:03. */
export function chapterStamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

const cleanLabel = (t: string) => t.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * YouTube turns timestamps into chapters only when the list starts at 0:00, has at least 3 entries and each
 * chapter is at least 10 s. Scenes closer than that merge into the previous chapter. Returns [] when the rules cannot be met.
 */
export function buildChapters(sceneBounds: { start: number; end: number }[], labels: string[], total: number): Chapter[] {
  const out: Chapter[] = [];
  sceneBounds.forEach((b, i) => {
    const label = cleanLabel(labels[i] ?? '');
    if (!label) return;
    const start = i === 0 ? 0 : Math.round(b.start);
    const last = out[out.length - 1];
    if (last && start - last.start < MIN_CHAPTER_SECONDS) return;
    if (last && last.title.toLowerCase() === label.toLowerCase()) return;
    if (!last && start !== 0) out.push({ start: 0, title: 'Intro' });
    out.push({ start, title: label });
  });
  // The final chapter must also last 10 s: fold it into the one before when it does not.
  while (out.length > 1 && total - out[out.length - 1].start < MIN_CHAPTER_SECONDS) out.pop();
  return out.length >= 3 ? out : [];
}

export const chapterLines = (c: Chapter[]) => c.map((x) => `${chapterStamp(x.start)} ${x.title}`);

/** Append UTM parameters unless already present. Returns the input when it is not a parseable http(s) URL. */
export function withUtm(url: string, extra: Record<string, string> = {}): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return url;
    const p = { utm_source: 'youtube', utm_medium: 'video', ...extra };
    for (const [k, v] of Object.entries(p)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.toString();
  } catch { return url; }
}

const noAngle = (t: string) => t.replace(/[<>]/g, '');

export function cleanTitle(t: string): string {
  const x = noAngle(t).replace(/[–—―]/g, ',').replace(/\s+/g, ' ').trim();
  if (x.length <= MAX_TITLE) return x;
  const cut = x.slice(0, MAX_TITLE - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 30)).replace(/[,:;\s]+$/, '')}…`;
}

/** Unique, cleaned, length-limited tags within the 500 character budget (commas in tags count as quotes). */
export function cleanTags(tags: string[], max = 12): string[] {
  const seen = new Set<string>(), out: string[] = [];
  let total = 0;
  for (const raw of tags) {
    const t = noAngle(raw).replace(/[#,]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    const cost = t.length + (t.includes(' ') ? 2 : 0) + 1;
    if (total + cost > TAGS_LIMIT_CHARS || out.length >= max) break;
    seen.add(k); out.push(t); total += cost;
  }
  return out;
}

export interface DescriptionInput {
  answer: string; blogUrl: string; blogTitle: string; chapters: Chapter[]; takeaways: string[];
  sources: { title: string; url: string }[]; brandName: string; personaName: string; hashtags?: string[];
}

export const aiDisclosure = (brand: string, persona: string) =>
  `Narrated by an AI voice${persona ? ` (${persona})` : ''}. Script and sources by the ${brand} team. Visuals are AI generated or charted from the sourced numbers.`;

/** Description layout: the first ~150 characters (search snippet) hold the answer and the blog link. */
export function buildDescription(i: DescriptionInput): string {
  const blog = withUtm(i.blogUrl);
  const parts: string[] = [];
  parts.push(`${noAngle(i.answer).trim()} Full guide: ${blog}`);
  if (i.chapters.length) parts.push(['Chapters', ...chapterLines(i.chapters)].join('\n'));
  if (i.takeaways.length) parts.push(['Key takeaways', ...i.takeaways.slice(0, 5).map((t) => `- ${noAngle(t).trim()}`)].join('\n'));
  const src = i.sources.filter((x) => /^https?:\/\//.test(x.url)).slice(0, 6);
  parts.push(['Read more', `${noAngle(i.blogTitle)}: ${blog}`, ...src.map((x) => `${noAngle(x.title).slice(0, 80)}: ${x.url}`)].join('\n'));
  parts.push(aiDisclosure(i.brandName, i.personaName));
  const tags = (i.hashtags ?? []).map((h) => '#' + h.replace(/[^\p{L}\p{N}]/gu, '')).filter((h) => h.length > 1).slice(0, 3);
  if (tags.length) parts.push(tags.join(' '));
  let text = parts.join('\n\n');
  // Hard byte limit: drop sources, then takeaways, never the link or the disclosure.
  while (Buffer.byteLength(text, 'utf8') > DESCRIPTION_LIMIT_BYTES && parts.length > 2) { parts.splice(parts.length > 4 ? 2 : 1, 1); text = parts.join('\n\n'); }
  return text;
}

export interface MetadataIssue { field: string; message: string }

export function lintMetadata(m: VideoMetadata): MetadataIssue[] {
  const out: MetadataIssue[] = [];
  if (!m.title) out.push({ field: 'title', message: 'Title is empty.' });
  if (m.title.length > MAX_TITLE) out.push({ field: 'title', message: `Title is ${m.title.length} characters; keep it at ${MAX_TITLE} or fewer.` });
  if (/[<>]/.test(m.title + m.description)) out.push({ field: 'description', message: 'YouTube rejects < and > in titles and descriptions.' });
  if (/[–—―]/.test(m.title + m.description)) out.push({ field: 'description', message: 'Remove em and en dashes.' });
  if (!m.blogUrl || !/^https?:\/\//.test(m.blogUrl)) out.push({ field: 'blogUrl', message: 'The source blog post has no public URL yet. Publish it first so the description can link to it.' });
  else if (!m.description.includes(new URL(m.blogUrl).host)) out.push({ field: 'description', message: 'Description must link to the source blog post.' });
  if (!/AI voice/i.test(m.description)) out.push({ field: 'description', message: 'Description is missing the AI-voice disclosure.' });
  if (Buffer.byteLength(m.description, 'utf8') > DESCRIPTION_LIMIT_BYTES) out.push({ field: 'description', message: 'Description is over 5,000 bytes.' });
  if (!/^0:00 /m.test(m.description) && m.chapters.length) out.push({ field: 'chapters', message: 'Chapters must start with 0:00.' });
  if (m.chapters.length && m.chapters.length < 3) out.push({ field: 'chapters', message: 'YouTube needs at least 3 chapters.' });
  for (let i = 1; i < m.chapters.length; i++) if (m.chapters[i].start - m.chapters[i - 1].start < MIN_CHAPTER_SECONDS) { out.push({ field: 'chapters', message: `Chapter ${i} is shorter than ${MIN_CHAPTER_SECONDS} s.` }); break; }
  if (m.tags.length < 3) out.push({ field: 'tags', message: 'Add at least 3 tags.' });
  if (m.tags.join(',').length > TAGS_LIMIT_CHARS) out.push({ field: 'tags', message: 'Tags exceed 500 characters.' });
  if (!m.containsSyntheticMedia) out.push({ field: 'synthetic', message: 'The synthetic-media flag must stay on (AI voice).' });
  return out;
}

/** Quick read of a chapters block back out of a description (used by tests and the editor preview). */
export function parseChapters(description: string): Chapter[] {
  const out: Chapter[] = [];
  for (const line of description.split('\n')) {
    const m = line.match(/^((?:\d+:)?\d{1,2}:\d{2})\s+(.+)$/);
    if (!m) continue;
    const p = m[1].split(':').map(Number);
    out.push({ start: p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1], title: m[2] });
  }
  return out;
}
