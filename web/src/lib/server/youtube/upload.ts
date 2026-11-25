import 'server-only';
import { allowlistedFetch } from '../../engines/http';
import { QUOTA_COSTS, type QuotaModel, type UploadPlan } from '../../youtube/quota';
import type { VideoMetadata } from '../../youtube/metadata';

const API = 'https://www.googleapis.com';
const CHUNK = 8 * 1024 * 1024; // multiple of 256 KiB, as the resumable protocol requires
const f = (ms = 60_000) => allowlistedFetch('youtube', { timeoutMs: ms });
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

export interface UploadInput { token: string; video: Buffer; meta: VideoMetadata; privacy: 'private' | 'unlisted' | 'public'; thumb?: { bytes: Buffer; mime: string } | null; srt?: string | null; playlistId?: string | null; plan: UploadPlan; model: QuotaModel; extraLinkComment?: string | null }
export interface UploadResult { videoId: string; privacyStatus: string | null; uploadStatus: string | null; quota: number; notes: string[]; lockedPrivate: boolean }

const err = async (r: Response, what: string) => { const t = await r.text().catch(() => ''); const m = t.match(/"reason":\s*"([^"]+)"/)?.[1]; return new Error(`${what} failed (HTTP ${r.status}${m ? `, ${m}` : ''})`); };

export const isQuotaError = (e: unknown) => e instanceof Error && /quotaExceeded|uploadLimitExceeded|rateLimitExceeded/.test(e.message);

/** videos.insert, resumable. Sends the synthetic-media flag and made-for-kids = false. */
export async function insertVideo(token: string, video: Buffer, meta: VideoMetadata, privacy: string): Promise<string> {
  const body = {
    snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId, defaultLanguage: meta.language, defaultAudioLanguage: meta.language },
    status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: meta.containsSyntheticMedia, embeddable: true, publicStatsViewable: true },
  };
  const init = await f()(`${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST', headers: { ...auth(token), 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(video.length) }, body: JSON.stringify(body),
  });
  if (!init.ok) throw await err(init, 'Starting the upload');
  const session = init.headers.get('location');
  if (!session || !session.startsWith('https://www.googleapis.com/')) throw new Error('YouTube returned no upload session');
  let offset = 0, retries = 0;
  for (;;) {
    const end = Math.min(offset + CHUNK, video.length);
    const res = await f(120_000)(session, { method: 'PUT', headers: { 'content-length': String(end - offset), 'content-range': `bytes ${offset}-${end - 1}/${video.length}` }, body: new Uint8Array(video.subarray(offset, end)) });
    if (res.status === 200 || res.status === 201) { const j = (await res.json()) as { id?: string }; if (!j.id) throw new Error('YouTube returned no video id'); return j.id; }
    if (res.status === 308) { const r = res.headers.get('range'); offset = r ? Number(r.split('-')[1]) + 1 : 0; retries = 0; continue; }
    if (res.status >= 500 && retries++ < 4) { // resume: ask where the server is
      await new Promise((r) => setTimeout(r, 1000 * 2 ** retries));
      const q = await f()(session, { method: 'PUT', headers: { 'content-length': '0', 'content-range': `bytes */${video.length}` } });
      if (q.status === 308) { const r = q.headers.get('range'); offset = r ? Number(r.split('-')[1]) + 1 : 0; }
      continue;
    }
    throw await err(res, 'Uploading the video');
  }
}

export async function setThumbnail(token: string, videoId: string, t: { bytes: Buffer; mime: string }) {
  const r = await f(60_000)(`${API}/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, { method: 'POST', headers: { ...auth(token), 'content-type': t.mime }, body: new Uint8Array(t.bytes) });
  if (!r.ok) throw await err(r, 'Setting the thumbnail');
}

/** captions.insert: multipart/related with JSON metadata then the SRT. */
export async function insertCaptions(token: string, videoId: string, srt: string, language: string) {
  const boundary = `beacon${Date.now().toString(36)}`;
  const meta = JSON.stringify({ snippet: { videoId, language, name: 'English', isDraft: false } });
  const body = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n${srt}\r\n--${boundary}--`;
  const r = await f()(`${API}/upload/youtube/v3/captions?part=snippet&uploadType=multipart`, { method: 'POST', headers: { ...auth(token), 'content-type': `multipart/related; boundary=${boundary}` }, body });
  if (!r.ok) throw await err(r, 'Uploading captions');
}

export async function addToPlaylist(token: string, playlistId: string, videoId: string) {
  const r = await f()(`${API}/youtube/v3/playlistItems?part=snippet`, { method: 'POST', headers: { ...auth(token), 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }) });
  if (!r.ok) throw await err(r, 'Adding to the playlist');
}

/** Find a playlist by title on the channel, or create it (50 units). */
export async function ensurePlaylist(token: string, title: string): Promise<string> {
  const l = await f()(`${API}/youtube/v3/playlists?part=snippet&mine=true&maxResults=50`, { headers: auth(token) });
  if (l.ok) { const j = (await l.json()) as { items?: { id: string; snippet: { title: string } }[] }; const hit = j.items?.find((p) => p.snippet.title.toLowerCase() === title.toLowerCase()); if (hit) return hit.id; }
  const c = await f()(`${API}/youtube/v3/playlists?part=snippet,status`, { method: 'POST', headers: { ...auth(token), 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { title: title.slice(0, 120), description: 'Educational videos with sources.' }, status: { privacyStatus: 'public' } }) });
  if (!c.ok) throw await err(c, 'Creating the playlist');
  return ((await c.json()) as { id: string }).id;
}

/** videos.update re-sends the flag: videos.insert has been reported to drop it. Part=status only; snippet untouched. */
export async function reassertSynthetic(token: string, videoId: string, privacy: string, flag: boolean) {
  const r = await f()(`${API}/youtube/v3/videos?part=status`, { method: 'PUT', headers: { ...auth(token), 'content-type': 'application/json' }, body: JSON.stringify({ id: videoId, status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: flag } }) });
  if (!r.ok) throw await err(r, 'Re-asserting the synthetic-media flag');
}

export async function postComment(token: string, videoId: string, text: string) {
  const r = await f()(`${API}/youtube/v3/commentThreads?part=snippet`, { method: 'POST', headers: { ...auth(token), 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } }) });
  if (!r.ok) throw await err(r, 'Posting the link comment');
}

export async function videoStatus(token: string, videoId: string): Promise<{ privacyStatus: string | null; uploadStatus: string | null }> {
  const r = await f()(`${API}/youtube/v3/videos?part=status&id=${encodeURIComponent(videoId)}`, { headers: auth(token) });
  if (!r.ok) return { privacyStatus: null, uploadStatus: null };
  const j = (await r.json()) as { items?: { status?: { privacyStatus?: string; uploadStatus?: string } }[] };
  return { privacyStatus: j.items?.[0]?.status?.privacyStatus ?? null, uploadStatus: j.items?.[0]?.status?.uploadStatus ?? null };
}

/**
 * Full upload. The video itself must succeed; every extra (thumbnail, captions, playlist, flag, comment) is best effort and
 * reports into `notes`, so a failed caption never wastes a successful upload. Quota is counted only for calls that were made.
 */
export async function uploadAll(i: UploadInput): Promise<UploadResult> {
  const c = QUOTA_COSTS[i.model], notes: string[] = [];
  const videoId = await insertVideo(i.token, i.video, i.meta, i.privacy);
  let quota = c.insertPool === 'main' ? c.insert : 0;
  const step = async (name: string, cost: number, run: () => Promise<void>) => { try { quota += cost; await run(); } catch (e) { notes.push(`${name}: ${e instanceof Error ? e.message : 'failed'}`); } };
  if (i.plan.thumbnail && i.thumb) await step('Thumbnail', c.thumbnail, () => setThumbnail(i.token, videoId, i.thumb!));
  if (i.plan.captions && i.srt) await step('Captions', c.caption, () => insertCaptions(i.token, videoId, i.srt!, i.meta.language));
  if (i.plan.playlist && i.playlistId) await step('Playlist', c.playlistItem, () => addToPlaylist(i.token, i.playlistId!, videoId));
  if (i.plan.syntheticFollowup) await step('Synthetic flag', c.update, () => reassertSynthetic(i.token, videoId, i.privacy, i.meta.containsSyntheticMedia));
  if (i.plan.linkComment && i.extraLinkComment) await step('Link comment', c.comment, () => postComment(i.token, videoId, i.extraLinkComment!));
  const st = await videoStatus(i.token, videoId);
  const lockedPrivate = i.privacy !== 'private' && st.privacyStatus === 'private';
  if (lockedPrivate) notes.push('YouTube kept this video private even though a wider audience was requested (the API project may need its compliance audit).');
  return { videoId, privacyStatus: st.privacyStatus, uploadStatus: st.uploadStatus, quota, notes, lockedPrivate };
}
