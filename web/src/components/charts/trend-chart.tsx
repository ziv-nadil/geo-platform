"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_INK } from "@/lib/ui/chart-colors";
import { fmtDay } from "@/lib/ui/format";

export interface Series {
  key: string;
  name: string;
  color: string;
  emphasis?: boolean;
}

/** Multi-series line chart: 2px lines, recessive grid, crosshair tooltip, legend above. */
export function TrendChart({
  data,
  series,
  unit = "%",
  height = 260,
  yDomain,
  showLegend = true,
}: {
  data: Record<string, number | string | null>[];
  series: Series[];
  unit?: string;
  height?: number;
  yDomain?: [number | "auto", number | "auto"];
  showLegend?: boolean;
}) {
  const fmt = (v: number) => `${v}${unit}`;
  return (
    <div className="flex flex-col gap-3">
      {showLegend && series.length > 1 ? <Legend series={series} /> : null}
      <div style={{ height }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={{ stroke: CHART_INK.grid }} minTickGap={28} tickMargin={8} />
            <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={48} domain={yDomain ?? [0, "auto"]} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: CHART_INK.muted, strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-sm border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                    <p className="mb-1 font-semibold text-ink">{fmtDay(String(label))}</p>
                    <ul className="flex flex-col gap-0.5">
                      {[...payload]
                        .sort((a, b) => Number(b.value) - Number(a.value))
                        .map((p) => (
                          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-ink-2">
                              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: p.color }} />
                              {p.name}
                            </span>
                            <span className="font-semibold text-ink tabular">{fmt(Number(p.value))}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={s.emphasis ? 2.5 : 2}
                dot={false}
                activeDot={{ r: 4, stroke: CHART_INK.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Legend({ series }: { series: { name: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
          {s.name}
        </li>
      ))}
    </ul>
  );
}
