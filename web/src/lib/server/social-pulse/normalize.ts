import type { Platform } from './config';

export interface SocialItem { platform: Platform; id: string; url: string; title: string; text: string; author: string | null; createdAt: string | null; score: number }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
const date = (v: unknown): string | null => { const d = typeof v === 'string' || typeof v === 'number' ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

/** Map one raw Apify dataset item to a common shape. Returns null when it has no usable id/url/text. Defensive: actor outputs change. */
export function normalizeItem(platform: Platform, raw: unknown): SocialItem | null {
  const r = obj(raw);
  let item: SocialItem;
  if (platform === 'reddit') {
    if (str(r.dataType) && str(r.dataType) !== 'post') return null;
    const url = str(r.url) || str(r.link);
    item = { platform, id: str(r.id) || url, url, title: clip(str(r.title), 200), text: clip(str(r.body) || str(r.selftext) || str(r.text), 600), author: str(r.username) || str(r.author) || null, createdAt: date(r.createdAt ?? r.created_utc ?? r.createdUtc), score: num(r.upVotes ?? r.score) + num(r.numberOfComments ?? r.numComments) };
  } else if (platform === 'x') {
    const url = str(r.url) || str(r.twitterUrl);
    const a = obj(r.author);
    item = { platform, id: str(r.id) || url, url, title: '', text: clip(str(r.text) || str(r.fullText), 600), author: str(a.userName) || str(a.screen_name) || null, createdAt: date(r.createdAt), score: num(r.likeCount) + 2 * num(r.retweetCount) + num(r.replyCount) };
  } else {
    const url = str(r.linkedinUrl) || str(r.url);
    const a = obj(r.author); const e = obj(r.engagement); const p = obj(r.postedAt);
    item = { platform, id: str(r.id) || str(r.entityId) || url, url, title: '', text: clip(str(r.content) || str(r.text), 600), author: str(a.name) || null, createdAt: date(p.date ?? r.postedAt), score: num(e.likes) + 2 * num(e.comments) + num(e.shares) };
  }
  if (!item.id || !/^https?:\/\//.test(item.url) || !(item.text || item.title)) return null;
  return item;
}

/** Keep last-24h items only (items with no timestamp are kept: the actor already filtered), drop already-seen ids and in-batch duplicates, cap, best first. */
export function prepareItems(items: SocialItem[], o: { seen: Set<string>; maxItems: number; now?: Date; windowHours?: number }): SocialItem[] {
  const cutoff = (o.now ?? new Date()).getTime() - (o.windowHours ?? 24) * 3600_000;
  const out = new Map<string, SocialItem>();
  for (const it of items) {
    const key = `${it.platform}:${it.id}`;
    if (o.seen.has(key) || out.has(key)) continue;
    if (it.createdAt && new Date(it.createdAt).getTime() < cutoff) continue;
    out.set(key, it);
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, o.maxItems);
}
