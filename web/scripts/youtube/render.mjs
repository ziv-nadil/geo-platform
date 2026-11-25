#!/usr/bin/env node
// YouTube render worker. Runs in GitHub Actions (system ffmpeg), never on Vercel.
//   APP_URL, CRON_SECRET required. FFMPEG_PATH optional. Loops until the queue is empty (max YT_MAX_JOBS, default 3).
// It holds no YouTube or Supabase credentials: it receives signed URLs from /api/youtube/worker and uploads the mp4 to a signed URL.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { barGeometry, cardFilter, chartFilter, finalArgs, imageSceneArgs, solidArgs, thumbArgs } from './render-plan.mjs';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const run = (args) => new Promise((resolve, reject) => {
  const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}: ${err.slice(-400)}`))));
});

async function download(url, path) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  await writeFile(path, Buffer.from(await r.arrayBuffer()));
}

/** job: scenes [{index, kind, url, startSec, endSec, onScreen, chart}], srt, audio path in dir. Returns { video, thumb } paths. */
export async function renderJob(job, dir, assets) {
  const parts = [];
  for (const s of job.scenes) {
    const sec = Math.max(1, +(s.endSec - s.startSec).toFixed(2));
    const out = join(dir, `part-${s.index}.mp4`);
    if (s.kind === 'image' && assets.images[s.index]) await run(imageSceneArgs(s.index, assets.images[s.index], sec, out));
    else if (s.kind === 'chart' && s.chart) {
      const bars = barGeometry(s.chart.points);
      const t = async (name, v) => { const p = join(dir, `t-${s.index}-${name}.txt`); await writeFile(p, v); return p; };
      const files = { title: await t('title', `${s.chart.title} (${s.chart.unit})`.slice(0, 80)), values: [], labels: [] };
      for (let i = 0; i < bars.length; i++) { files.values.push(await t(`v${i}`, String(bars[i].value))); files.labels.push(await t(`l${i}`, String(bars[i].label).slice(0, 18))); }
      await run(solidArgs(sec, chartFilter(bars, files), out));
    } else {
      const title = join(dir, `t-${s.index}.txt`); await writeFile(title, s.onScreen || ' ');
      await run(solidArgs(sec, cardFilter({ title }), out));
    }
    parts.push(out);
  }
  const list = join(dir, 'list.txt');
  await writeFile(list, parts.map((p) => `file '${p}'`).join('\n'));
  const video = join(dir, 'video.mp4');
  await run(finalArgs(list, assets.audio, assets.srt, video));
  let thumb = join(dir, 'thumb.jpg');
  const textFile = job.thumbText ? join(dir, 'thumb.txt') : null;
  if (textFile) await writeFile(textFile, job.thumbText);
  const src = assets.thumbSource ?? video;
  const pre = assets.thumbSource ? [] : ['-ss', '3'];
  for (const q of [3, 8, 14]) { await run([...pre, ...thumbArgs(src, textFile, thumb, q)]); if ((await stat(thumb)).size < 1_900_000) break; }
  return { video, thumb };
}

async function put(url, path, type) {
  const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new Blob([await readFile(path)], { type }));
  const r = await fetch(url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd });
  if (!r.ok) throw new Error(`upload failed (${r.status})`);
}

async function main() {
  const app = (process.env.APP_URL || '').replace(/\/+$/, ''), secret = process.env.CRON_SECRET;
  if (!app || !secret) { console.error('APP_URL and CRON_SECRET are required'); process.exit(1); }
  const h = { authorization: `Bearer ${secret}`, 'content-type': 'application/json' };
  const max = Number(process.env.YT_MAX_JOBS || 3);
  for (let n = 0; n < max; n++) {
    const r = await fetch(`${app}/api/youtube/worker`, { headers: h });
    const job = await r.json();
    if (job.status !== 'job') { console.log(`queue: ${job.status}`); return; }
    const dir = await mkdtemp(join(tmpdir(), 'yt-'));
    try {
      const assets = { images: {}, audio: join(dir, 'voice.wav'), srt: join(dir, 'captions.srt'), thumbSource: null };
      await download(job.audioUrl, assets.audio); await writeFile(assets.srt, job.srt);
      for (const s of job.scenes) if (s.kind === 'image' && s.url) { assets.images[s.index] = join(dir, `img-${s.index}`); await download(s.url, assets.images[s.index]); }
      if (job.thumbSourceUrl) { assets.thumbSource = join(dir, 'thumb-src'); await download(job.thumbSourceUrl, assets.thumbSource); }
      const out = await renderJob(job, dir, assets);
      await put(job.videoUploadUrl, out.video, 'video/mp4'); await put(job.thumbUploadUrl, out.thumb, 'image/jpeg');
      const done = await fetch(`${app}/api/youtube/worker`, { method: 'POST', headers: h, body: JSON.stringify({ id: job.id, ok: true, durationSec: job.durationSec, thumb: true }) });
      console.log(`rendered ${job.id}: HTTP ${done.status}`);
    } catch (e) {
      console.error(`render failed ${job.id}: ${e.message}`);
      await fetch(`${app}/api/youtube/worker`, { method: 'POST', headers: h, body: JSON.stringify({ id: job.id, ok: false, error: e.message.slice(0, 250) }) });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
