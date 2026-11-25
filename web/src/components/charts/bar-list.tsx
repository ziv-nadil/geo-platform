import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Ranked horizontal bars in HTML: label left, value at the bar tip, ≤ 24px bars. */
export function BarList({
  items,
  max,
  unit = "%",
  className,
}: {
  items: { key: string; label: ReactNode; value: number; color?: string; sub?: ReactNode; highlight?: boolean }[];
  max?: number;
  unit?: string;
  className?: string;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[minmax(0,180px)_1fr] items-center gap-3">
          <div className="min-w-0">
            <div className={cn("truncate text-sm", it.highlight ? "font-semibold text-ink" : "text-ink-2")}>{it.label}</div>
            {it.sub ? <div className="truncate text-2xs text-ink-4">{it.sub}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3.5 flex-1 rounded-r-xs bg-subtle">
              <div className="h-full rounded-r-xs" style={{ width: `${(it.value / top) * 100}%`, background: it.color ?? "#4a45e0" }} />
            </div>
            <span className={cn("w-12 shrink-0 text-right text-sm tabular", it.highlight ? "font-semibold text-ink" : "text-ink-2")}>
              {it.value.toLocaleString("en-US", { maximumFractionDigits: 1 })}
              {unit}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One whole split into parts, with a 2px surface gap between segments and a legend below. */
export function SegmentedBar({
  parts,
  className,
  height = 12,
}: {
  parts: { key: string; label: string; value: number; color: string }[];
  className?: string;
  height?: number;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-xs" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${((p.value / total) * 100).toFixed(1)}%`).join(", ")}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${((p.value / total) * 100).toFixed(1)}%`} />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5 text-ink-2">
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: p.color }} aria-hidden="true" />
            {p.label}
            <span className="font-semibold text-ink tabular">{((p.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
