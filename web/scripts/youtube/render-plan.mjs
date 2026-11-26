// Pure helpers for the render worker: ffmpeg argument construction. No I/O, unit tested from src/lib/youtube/__tests__.
export const W = 1920, H = 1080, FPS = 30;
export const FONT = process.env.YT_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
export const BG = '0x0f172a', ACCENT = '0x38bdf8';

/** Ken Burns: alternate zoom-in, zoom-out and pans so consecutive scenes never look the same. */
export function kenBurns(index, seconds) {
  const frames = Math.max(1, Math.round(seconds * FPS));
  const step = (0.18 / frames).toFixed(6);
  const modes = [
    { z: `min(zoom+${step},1.18)`, x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' },
    { z: `if(eq(on,0),1.18,max(zoom-${step},1.0))`, x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' },
    { z: `min(zoom+${step},1.18)`, x: `(iw-iw/zoom)*on/${frames}`, y: 'ih/2-(ih/zoom/2)' },
    { z: `min(zoom+${step},1.18)`, x: `(iw-iw/zoom)*(1-on/${frames})`, y: 'ih/2-(ih/zoom/2)' },
  ];
  const m = modes[index % modes.length];
  return `scale=2880:1620:force_original_aspect_ratio=increase,crop=2880:1620,zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p`;
}

export function imageSceneArgs(index, img, seconds, out) {
  return ['-y', '-i', img, '-vf', kenBurns(index, seconds), '-t', String(seconds), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-an', out];
}

const text = (file, size, color, x, y, extra = '') => `drawtext=fontfile=${FONT}:textfile=${file}:expansion=none:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}${extra}`;

/** Text-only card used when no image exists. `files.title` is a path to a text file (avoids drawtext escaping). */
export function cardFilter(files) {
  return [`drawbox=x=0:y=${H - 12}:w=${W}:h=12:color=${ACCENT}:t=fill`, text(files.title, 84, 'white', '(w-text_w)/2', '(h-text_h)/2')].join(',');
}

/** Bar chart geometry: bars scale to the max value, within a 1500 x 520 plot area. Pure, tested. */
export function barGeometry(points, plot = { x: 210, y: 200, w: 1500, h: 460 }) {
  const n = Math.max(1, points.length), max = Math.max(...points.map((p) => p.value), 1e-9);
  const slot = plot.w / n, bw = Math.min(180, slot * 0.6);
  return points.map((p, i) => {
    const h = Math.max(6, Math.round((Math.max(0, p.value) / max) * plot.h));
    return { x: Math.round(plot.x + i * slot + (slot - bw) / 2), y: plot.y + plot.h - h, w: Math.round(bw), h, value: p.value, label: p.label, cx: Math.round(plot.x + i * slot + slot / 2) };
  });
}

/** files: { title, bars: [{label, value}] } text file paths per bar. */
export function chartFilter(bars, files) {
  const f = [`drawbox=x=150:y=${200 + 460}:w=1620:h=4:color=white@0.5:t=fill`, text(files.title, 56, 'white', '(w-text_w)/2', '70')];
  bars.forEach((b, i) => {
    f.push(`drawbox=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}:color=${ACCENT}:t=fill`);
    f.push(text(files.values[i], 40, 'white', `${b.cx}-text_w/2`, `${b.y - 56}`));
    f.push(text(files.labels[i], 34, 'white@0.85', `${b.cx}-text_w/2`, `${200 + 460 + 24}`));
  });
  return f.join(',');
}

export function solidArgs(seconds, vf, out) {
  return ['-y', '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${seconds}`, '-vf', `${vf},format=yuv420p`, '-t', String(seconds), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-an', out];
}

export const subtitleFilter = (srt) => `subtitles=${srt.replace(/[\\:']/g, (c) => `\\${c}`)}:force_style='FontName=DejaVu Sans,FontSize=16,Bold=1,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=2,Shadow=0,MarginV=48,Alignment=2'`;

export function finalArgs(concatList, audio, srt, out) {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-i', audio, '-vf', subtitleFilter(srt), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out];
}

export function thumbArgs(src, textFile, out, quality = 3) {
  const vf = ['scale=1280:720:force_original_aspect_ratio=increase', 'crop=1280:720'];
  if (textFile) vf.push(`drawbox=x=0:y=500:w=1280:h=220:color=black@0.55:t=fill`, text(textFile, 100, 'white', '(w-text_w)/2', '560', ':borderw=5:bordercolor=black'));
  return ['-y', '-i', src, '-vf', vf.join(','), '-frames:v', '1', '-q:v', String(quality), out];
}

/**
 * Scene rows come from youtube_videos.scene_assets, which org members can write. Only well-typed scenes reach ffmpeg:
 * `index` goes into file names inside filtergraphs and chart numbers into drawbox geometry, so a string there could
 * inject filter options on the render runner. Text (titles, labels, onScreen) only ever goes through textfile=.
 */
export function cleanScenes(scenes) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v) => (typeof v === 'string' ? v : '');
  const out = [];
  for (const s of Array.isArray(scenes) ? scenes : []) {
    if (!s || !Number.isInteger(s.index) || s.index < 0 || s.index > 999) continue;
    if (!['image', 'chart', 'card'].includes(s.kind)) continue;
    const startSec = num(s.startSec), endSec = num(s.endSec);
    if (startSec === null || endSec === null || startSec < 0 || endSec > 3600) continue;
    const chart = s.kind === 'chart' && s.chart && Array.isArray(s.chart.points)
      ? { title: str(s.chart.title), unit: str(s.chart.unit), points: s.chart.points.filter((p) => p && num(p.value) !== null).slice(0, 8).map((p) => ({ label: str(p.label), value: p.value })) }
      : null;
    out.push({ index: s.index, kind: s.kind, path: typeof s.path === 'string' ? s.path : null, url: typeof s.url === 'string' ? s.url : null, startSec, endSec, onScreen: str(s.onScreen), chart });
  }
  return out;
}
