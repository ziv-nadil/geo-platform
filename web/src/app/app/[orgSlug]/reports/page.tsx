import { CalendarClock, FileText, Link2, MessageSquare, Plus } from "lucide-react";
import { Suspense } from "react";
import { loadPage, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getReports } from "@/lib/mock";
import { fmtDateTime } from "@/lib/ui/format";

export const metadata = { title: "Reports" };

const FORMAT = { pdf: { label: "PDF by email", Icon: FileText }, link: { label: "Share link", Icon: Link2 }, slack: { label: "Slack", Icon: MessageSquare } } as const;

export default function ReportsPage(props: PageProps<"/app/[orgSlug]/reports">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reports {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Reports(props: RouteProps) {
  const { org } = await loadPage(props);
  const reports = await getReports(org.id);
  return (
    <>
      <PageHeader
        title="Reports"
        description="Scheduled summaries for your team and stakeholders, branded with your logo."
        actions={
          <Button>
            <Plus /> New report
          </Button>
        }
      />
      {reports.length === 0 ? (
        <EmptyState icon={FileText} title="No reports scheduled" description="Create a weekly digest or a monthly executive report." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {reports.map((r) => {
            const F = FORMAT[r.format];
            return (
              <Card key={r.id} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-sans text-md font-semibold text-ink">{r.name}</h2>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-3">
                      <F.Icon className="size-4" aria-hidden="true" /> {F.label}
                    </p>
                  </div>
                  <Badge tone={r.cadence === "one_off" ? "neutral" : "accent"} className="capitalize">
                    {r.cadence === "one_off" ? "One-off" : r.cadence}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.sections.map((s) => (
                    <Badge key={s} tone="outline">{s}</Badge>
                  ))}
                </div>
                <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-ink-4">Last sent</dt>
                    <dd className="text-ink-2">{r.lastSentAt ? fmtDateTime(r.lastSentAt) : "Never"}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-ink-4">
                      <CalendarClock className="size-3" aria-hidden="true" /> Next run
                    </dt>
                    <dd className="text-ink-2">{r.nextRunAt ? fmtDateTime(r.nextRunAt) : "Not scheduled"}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-ink-4">Recipients</dt>
                    <dd className="truncate text-ink-2">{r.recipients.join(", ")}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" variant="secondary">Preview</Button>
                  <Button size="sm" variant="ghost">Edit schedule</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
