import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import type { MetricId } from "@/lib/ui/metrics";
import { MetricHelp } from "./metric-help";
import { Sparkline } from "@/components/charts/sparkline";

/**
 * Stat tile contract (dataviz skill): label · value · delta vs a named period · optional sparkline.
 * Delta color = direction × whether up is good.
 */
export function StatTile({
  label,
  metric,
  value,
  unit,
  delta,
  deltaLabel = "vs prev. period",
  upIsGood = true,
  deltaUnit = "pt",
  trend,
  footer,
  className,
}: {
  label: string;
  metric?: MetricId;
  value: ReactNode;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  upIsGood?: boolean;
  deltaUnit?: string;
  trend?: number[];
  footer?: ReactNode;
  className?: string;
}) {
  const dir = delta === undefined ? 0 : delta > 0.05 ? 1 : delta < -0.05 ? -1 : 0;
  const good = dir === 0 ? null : (dir > 0) === upIsGood;
  const Icon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface p-4", className)}>
      <div className="flex items-center gap-1.5 text-sm font-medium text-ink-3">
        <span className="truncate">{label}</span>
        {metric ? <MetricHelp id={metric} label={label} /> : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink tabular">{value}</span>
          {unit ? <span className="text-md font-medium text-ink-3">{unit}</span> : null}
        </div>
        {trend && trend.length > 1 ? <Sparkline data={trend} invert={!upIsGood} className="mb-1 h-8 w-24" /> : null}
      </div>
      {delta !== undefined ? (
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-xs px-1 py-0.5 font-semibold tabular",
              good === null ? "bg-subtle text-ink-3" : good ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
            )}
          >
            <Icon className="size-3" aria-hidden="true" />
            {delta > 0 ? "+" : delta < 0 ? "−" : "±"}
            {Math.abs(delta).toFixed(1)}
            {deltaUnit === "pt" ? " pt" : deltaUnit}
          </span>
          <span className="text-ink-4">{deltaLabel}</span>
        </div>
      ) : null}
      {footer}
    </div>
  );
}
