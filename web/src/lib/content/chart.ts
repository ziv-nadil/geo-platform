/** Server-side SVG bar chart from real numbers (pure, no dependencies). Escapes every text node. */
import type { ChartSpec } from './article';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(Math.round(n * 100) / 100));
const trunc = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function renderBarChartSvg(c: Pick<ChartSpec, 'title' | 'unit' | 'points' | 'sourceTitle'>): string {
  const W = 800, rowH = 44, top = 56, left = 190, right = 90, bottom = 40;
  const H = top + c.points.length * rowH + bottom;
  const max = Math.max(...c.points.map((p) => p.value), 0) || 1;
  const plot = W - left - right;
  const bars = c.points.map((p, i) => {
    const y = top + i * rowH;
    const w = Math.max(2, (Math.max(p.value, 0) / max) * plot);
    return `<text x="${left - 12}" y="${y + 24}" text-anchor="end" font-size="14" fill="#374151">${esc(trunc(p.label, 26))}</text>` +
      `<rect x="${left}" y="${y + 6}" width="${w.toFixed(1)}" height="26" rx="3" fill="#2563eb"/>` +
      `<text x="${(left + w + 8).toFixed(1)}" y="${y + 24}" font-size="14" font-weight="600" fill="#111827">${esc(fmt(p.value))}${c.unit ? ` ${esc(c.unit)}` : ''}</text>`;
  }).join('');
  const label = `${c.title}. ${c.points.map((p) => `${p.label}: ${fmt(p.value)}${c.unit ? ` ${c.unit}` : ''}`).join('; ')}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/><text x="24" y="32" font-size="18" font-weight="700" fill="#111827">${esc(trunc(c.title, 70))}</text>${bars}` +
    `<text x="24" y="${H - 14}" font-size="12" fill="#6b7280">Source: ${esc(trunc(c.sourceTitle, 90))}</text></svg>`;
}

export const chartAlt = (c: Pick<ChartSpec, 'title' | 'unit' | 'points'>) =>
  `Bar chart: ${c.title}. ${c.points.map((p) => `${p.label} ${fmt(p.value)}${c.unit ? ` ${c.unit}` : ''}`).join(', ')}.`;
