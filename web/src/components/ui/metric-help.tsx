"use client";

import { METRICS, type MetricId } from "@/lib/ui/metrics";
import { Tooltip } from "./tooltip";

/** The "?" icon next to every metric: definition + formula. */
export function MetricHelp({ id, label }: { id: MetricId; label?: string }) {
  const m = METRICS[id];
  return (
    <Tooltip
      content={
        <div className="flex flex-col gap-1.5">
          <p className="font-semibold text-ink">{label ?? m.label}</p>
          <p>{m.definition}</p>
          <p className="rounded-xs bg-subtle px-2 py-1 font-mono text-2xs text-ink-2">{m.formula}</p>
          {"note" in m && m.note ? <p className="text-xs text-ink-3">{m.note}</p> : null}
        </div>
      }
    >
      <button
        type="button"
        aria-label={`What is ${label ?? m.label}?`}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong text-[10px] font-semibold leading-none text-ink-3 hover:border-accent hover:text-accent"
      >
        ?
      </button>
    </Tooltip>
  );
}
