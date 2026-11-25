import 'server-only';
import type { ArticleDoc } from '../../content/article';
import { chartAlt, renderBarChartSvg } from '../../content/chart';
import { allowlistedFetch } from '../../engines/http';
import { safeFetch } from '../net/safe-fetch';
import { createSupabaseAdminClient } from '../supabase/admin';

/**
 * Bria image generation: POST https://engine.prod.bria-api.com/v2/image/generate, header `api_token`,
 * body { prompt, aspect_ratio, sync: true }. Without sync the API answers with { request_id, status_url }
 * which we poll. Response carries result.image_url (a short-lived download URL we copy into Storage).
 */
const BRIA = 'https://engine.prod.bria-api.com/v2';
const STYLE = ' Clean modern editorial illustration, soft gradients, uncluttered, no text, no letters, no logos, no watermarks.';

export interface StoredImage { id: string; kind: 'hero' | 'illustration' | 'chart'; path: string; alt: string; mime: string }

export async function briaImage(prompt: string, aspect: '16:9' | '4:3' | '1:1' = '16:9'): Promise<{ status: 'ok'; bytes: Buffer; mime: string } | { status: 'not_configured'; missing: string[] } | { status: 'error'; message: string }> {
  const key = process.env.BRIA_API_KEY?.trim();
  if (!key) return { status: 'not_configured', missing: ['BRIA_API_KEY'] };
  try {
    const f = allowlistedFetch('bria', { timeoutMs: 90_000 });
    const res = await f(`${BRIA}/image/generate`, { method: 'POST', headers: { api_token: key, 'content-type': 'application/json' }, body: JSON.stringify({ prompt: (prompt + STYLE).slice(0, 1500), aspect_ratio: aspect, sync: true }) });
    if (!res.ok) return { status: 'error', message: `Bria returned HTTP ${res.status}` };
    let j = (await res.json()) as { result?: { image_url?: string }; image_url?: string; status_url?: string };
    for (let i = 0; i < 20 && !(j.result?.image_url ?? j.image_url) && j.status_url; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const p = await f(j.status_url, { headers: { api_token: key } });
      if (!p.ok) return { status: 'error', message: `Bria status HTTP ${p.status}` };
      const next = (await p.json()) as { status?: string; result?: { image_url?: string } };
      if (next.status === 'ERROR' || next.status === 'FAILED') return { status: 'error', message: 'Bria could not generate this image' };
      j = { ...j, ...next };
    }
    const url = j.result?.image_url ?? j.image_url;
    if (!url) return { status: 'error', message: 'Bria returned no image' };
    const img = await safeFetch(url, { integration: 'scrape', timeoutMs: 30_000, maxBytes: 9_000_000 });
    if (!img.ok) return { status: 'error', message: `Image download HTTP ${img.status}` };
    const mime = (img.headers.get('content-type') ?? 'image/png').split(';')[0].trim();
    if (!/^image\/(png|jpeg|webp)$/.test(mime)) return { status: 'error', message: 'Unexpected image type' };
    return { status: 'ok', bytes: Buffer.from(await img.arrayBuffer()), mime };
  } catch (e) { return { status: 'error', message: e instanceof Error ? e.message.slice(0, 120) : 'Bria failed' }; }
}

const ext = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : mime === 'image/svg+xml' ? 'svg' : mime.split('/')[1]);

/** Generate hero + up to 2 illustrations (Bria) and render every chart from the article's sourced numbers (SVG). Stores all in the private content-images bucket. */
export async function buildImages(orgId: string, itemId: string, doc: ArticleDoc): Promise<{ images: StoredImage[]; notes: string[] }> {
  const admin = createSupabaseAdminClient();
  const notes: string[] = [];
  if (!admin) return { images: [], notes: ['Storage not configured (Supabase service role)'] };
  const images: StoredImage[] = [];
  const put = async (id: string, kind: StoredImage['kind'], bytes: Buffer, mime: string, alt: string) => {
    const path = `${orgId}/${itemId}/${id}.${ext(mime)}`;
    const { error } = await admin.storage.from('content-images').upload(path, bytes, { contentType: mime, upsert: true });
    if (error) notes.push(`Upload failed for ${id}: ${error.message}`); else images.push({ id, kind, path, alt, mime });
  };
  for (const c of doc.charts) await put(`chart-${c.id}`, 'chart', Buffer.from(renderBarChartSvg(c)), 'image/svg+xml', chartAlt(c));
  const jobs: { id: string; kind: 'hero' | 'illustration'; prompt: string; alt: string; aspect: '16:9' | '4:3' }[] = [];
  if (doc.heroPrompt) jobs.push({ id: 'hero', kind: 'hero', prompt: doc.heroPrompt, alt: doc.heroAlt, aspect: '16:9' });
  doc.sections.forEach((s, i) => { if (s.imagePrompt && jobs.length < 3) jobs.push({ id: `illustration-${i}`, kind: 'illustration', prompt: s.imagePrompt, alt: `Illustration for ${s.heading}`, aspect: '4:3' }); });
  for (const j of jobs) {
    const r = await briaImage(j.prompt, j.aspect);
    if (r.status === 'ok') await put(j.id, j.kind, r.bytes, r.mime, j.alt);
    else { notes.push(r.status === 'not_configured' ? `Images skipped: set ${r.missing.join(', ')}` : `${j.id}: ${r.message}`); if (r.status === 'not_configured') break; }
  }
  return { images, notes: [...new Set(notes)] };
}

export async function downloadImage(path: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.storage.from('content-images').download(path);
  return data ? { bytes: Buffer.from(await data.arrayBuffer()), mime: data.type || 'application/octet-stream' } : null;
}
