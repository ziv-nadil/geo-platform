"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/ui/format";

export type GeoCheck = { id: string; label: string; category: string; score: number; status: "pass" | "warn" | "fail" | "info"; detail: string };
export type GeoFix = { id: string; title: string; priority: "critical" | "high" | "medium" | "low"; why: string; steps: string[]; platform: string };
export type GeoAuditData = { id?: string; url: string; platform: string | null; score: number; checks: GeoCheck[]; fixes: GeoFix[]; createdAt?: string };

const TONE = { pass: "good", warn: "warn", fail: "bad", info: "neutral" } as const;
const PRI = { critical: "bad", high: "bad", medium: "warn", low: "neutral" } as const;

/** Loads the latest audit and re-runs it on demand. `compact` shows only the score and top fixes. */
export function useGeoAudit(orgId: string, initial: GeoAuditData | null) {
  const [audit, setAudit] = useState<GeoAuditData | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initial) return;
    fetch(`/api/geo-audit/${orgId}`).then((r) => (r.ok ? r.json() : null)).then((j) => j?.audit && setAudit(j.audit)).catch(() => {});
  }, [orgId, initial]);
  const rerun = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/geo-audit/${orgId}`, { method: "POST", headers: { "content-type": "application/json", "x-beacon-intake": "1" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) setError(j.error === "rate_limited" ? "Too many runs. Wait a minute." : (j.error ?? "Audit failed."));
      else setAudit(j.audit);
    } catch {
      setError("Audit failed. Try again.");
    }
    setBusy(false);
  }, [orgId]);
  return { audit, busy, error, rerun };
}

export function GeoReport({ audit, busy, error, rerun, compact = false }: { audit: GeoAuditData | null; busy: boolean; error: string | null; rerun: () => void; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const color = audit ? (audit.score >= 80 ? "text-good" : audit.score >= 60 ? "text-warn" : "text-bad") : "text-ink-4";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className={`font-display text-3xl font-semibold tabular ${color}`} aria-label={audit ? `GEO readiness ${audit.score} of 100` : "Not audited"}>{audit ? audit.score : "–"}<span className="text-sm text-ink-4">/100</span></span>
          <p className="text-sm text-ink-3">
            {audit ? <>Audited {audit.url}{audit.createdAt ? ` · ${fmtDateTime(audit.createdAt)}` : ""}{audit.platform ? ` · platform: ${audit.platform}` : ""}</> : "No audit yet. Run one to see what stops AI engines from citing you."}
          </p>
        </div>
        <Button size="sm" onClick={rerun} loading={busy}><RefreshCw /> {audit ? "Re-run audit" : "Run audit"}</Button>
      </div>
      {error ? <p className="rounded-sm border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">{error}</p> : null}
      {audit ? (
        <>
          <section aria-label="Prioritized fixes">
            <h4 className="mb-2 font-sans text-sm font-semibold text-ink">{audit.fixes.length ? "Fix these first" : "Nothing to fix. Nice."}</h4>
            <ol className="flex flex-col gap-2">
              {(compact ? audit.fixes.slice(0, 3) : audit.fixes).map((f) => (
                <li key={f.id} className="rounded-md border border-line bg-surface">
                  <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
                    <span className="text-sm font-medium text-ink">{f.title}</span>
                    <Badge tone={PRI[f.priority]}>{f.priority}</Badge>
                  </button>
                  {open === f.id ? (
                    <div className="border-t border-line px-4 py-3 text-sm text-ink-2">
                      <p className="mb-2 text-ink-3">{f.why}</p>
                      <ul className="flex flex-col gap-1">{f.steps.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
          {compact ? null : (
            <section aria-label="All checks">
              <h4 className="mb-2 font-sans text-sm font-semibold text-ink">All checks</h4>
              <ul className="divide-y divide-line rounded-md border border-line">
                {audit.checks.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                    <div><p className="font-medium text-ink">{c.label} <span className="text-xs font-normal text-ink-4">{c.category}</span></p><p className="text-ink-3">{c.detail}</p></div>
                    <Badge tone={TONE[c.status]}>{c.status === "info" ? "info" : c.score}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
