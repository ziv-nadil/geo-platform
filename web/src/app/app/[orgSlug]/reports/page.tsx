import { CalendarClock, FileText } from "lucide-react";
import { Suspense } from "react";
import { loadPage, LoadFail, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getReports } from "@/lib/data";
import { buttonClass } from "@/components/ui/button";
import { fmtDate } from "@/lib/ui/format";
import { DigestToggle, ReportGenerator } from "./report-tools";

export const metadata = { title: "Reports" };

const STATUS_TONE: Record<string, "good" | "info" | "warn" | "bad" | "neutral"> = { ready: "good", succeeded: "good", running: "info", sent: "good", generating: "info", queued: "info", draft: "neutral", failed: "bad" };

export default function ReportsPage(props: PageProps<"/app/[orgSlug]/reports">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reports {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Reports(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org } = ctx;
  const r = await getReports(org.id);
  return (
    <>
      <PageHeader title="Reports" description="Scheduled and one-off summaries for your team and stakeholders." />
      <ReportGenerator orgId={org.id} />
      {!r.ok ? (
        <LoadFail result={r} />
      ) : r.data.length === 0 ? (
        <EmptyState icon={FileText} title="No reports yet" description="Pick a date range above and generate your first client report." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {r.data.map((rep) => (
            <Card key={rep.id} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-sans text-md font-semibold text-ink">{rep.title}</h2>
                  <p className="mt-0.5 text-sm text-ink-3 capitalize">{(rep.type ?? "report").replace(/_/g, " ")}</p>
                </div>
                <Badge tone={STATUS_TONE[rep.status] ?? "neutral"} className="capitalize">
                  {rep.status}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                <div>
                  <dt className="text-xs text-ink-4">Period</dt>
                  <dd className="text-ink-2">{rep.periodStart && rep.periodEnd ? `${fmtDate(rep.periodStart)} – ${fmtDate(rep.periodEnd)}` : "—"}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-ink-4">
                    <CalendarClock className="size-3" aria-hidden="true" /> Schedule
                  </dt>
                  <dd className="text-ink-2">{rep.schedule ?? "One-off"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-ink-4">Created</dt>
                  <dd className="text-ink-2">{fmtDate(rep.createdAt)}</dd>
                </div>
              </dl>
              {rep.status === "succeeded" ? (
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <a className={buttonClass("secondary", "sm")} href={`/api/reports/${rep.id}/download?format=pdf`}>PDF</a>
                  {["kpis", "engines", "trend", "gaps", "competitor_movers"].map((t) => (
                    <a key={t} className={buttonClass("ghost", "sm")} href={`/api/reports/${rep.id}/download?format=csv&table=${t}`}>CSV: {t.replace("_", " ")}</a>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
      <DigestToggle />
    </>
  );
}
