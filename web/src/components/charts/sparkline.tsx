import { cn } from "@/lib/ui/cn";

/** 12–30 point sparkline: de-emphasised line, light area wash, accent end dot. Pure SVG (server-safe). */
export function Sparkline({ data, className, color = "#4a45e0", invert = false }: { data: number[]; className?: string; color?: string; invert?: boolean }) {
  const w = 96;
  const h = 32;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
    const norm = (v - min) / span;
    const y = pad + (invert ? norm : 1 - norm) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)},${h} L${pts[0]![0].toFixed(1)},${h} Z`;
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("overflow-visible", className)} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={color} fillOpacity={0.08} />
      <path d={line} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2.75} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
