import type { Metadata } from "next";
import { METRICS } from "@/lib/ui/metrics";

export const metadata: Metadata = {
  title: "Metric definitions",
  description: "What each number in Beacon GEO means and how it is calculated.",
};

export default function MetricsPage() {
  const entries = Object.values(METRICS);
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold tracking-wide text-accent-ink uppercase">Reference</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Metric definitions</h1>
      <p className="mt-3 text-md leading-relaxed text-ink-2">
        Every number in the dashboard has a “?” that shows the same definition and formula listed here.
      </p>
      <dl className="mt-8 divide-y divide-line rounded-md border border-line bg-surface">
        {entries.map((m) => (
          <div key={m.label} className="p-5">
            <dt className="font-semibold text-ink">{m.label}</dt>
            <dd className="mt-2 space-y-2 text-sm leading-relaxed text-ink-3">
              <p>{m.definition}</p>
              <p className="rounded-xs bg-subtle px-2 py-1 font-mono text-2xs text-ink-2">{m.formula}</p>
              {"note" in m && m.note ? <p className="text-xs text-ink-4">{m.note}</p> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
