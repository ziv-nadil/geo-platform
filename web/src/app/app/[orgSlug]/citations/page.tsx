import { ExternalLink } from "lucide-react";
import { Suspense } from "react";
import { SegmentedBar } from "@/components/charts/bar-list";
import { loadPage, LoadFail, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { SourceTags } from "@/components/dashboard/source-tags";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getCitations, getOverview, getSourceTags } from "@/lib/data";
import type { SourceType } from "@/lib/ui/data-types";
import { fmtDate } from "@/lib/ui/format";

export const metadata = { title: "Citations & sources" };

const TYPE_META: Record<SourceType, { label: string; color: string }> = {
  owned: { label: "Your site", color: "#008c99" },
  competitor: { label: "Competitor", color: "#eb6834" },
  earned: { label: "Earned media", color: "#2a78d6" },
  ugc: { label: "UGC / forum", color: "#e87ba4" },
  other: { label: "Other", color: "#8a929c" },
};

export default function CitationsPage(props: PageProps<"/app/[orgSlug]/citations">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Citations {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Citations(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, filters } = ctx;
  const [c, tags, ov] = await Promise.all([getCitations(org.id, filters), getSourceTags(org.id), getOverview(org.id, filters)]);
  const header = <PageHeader title="Citations & sources" description={`The pages AI engines cite when they answer your prompts. ${rangeLabel(filters)}.`} />;
  if (!c.ok) return (<>{header}<LoadFail result={c} /></>);
  const { domains, urls, split } = c.data;
  const total = split.reduce((s, x) => s + x.count, 0);
  if (total === 0) return (<>{header}<NoData org={org} what="citations" /></>);
  const owned = domains.filter((d) => d.type === "owned").reduce((s, d) => s + d.answersCiting, 0);
  const cs = ov.ok ? ov.data.kpis.citationShare : null;
  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Citation share" metric="citationShare" value={cs?.value === null || cs === null ? "—" : cs.value.toFixed(1)} unit="%" delta={cs?.delta ?? undefined} trend={ov.ok ? ov.data.kpis.sparkCitation : undefined} />
        <StatTile label="Total citations" metric="domainCitations" value={total.toLocaleString()} />
        <StatTile label="Unique domains" metric="sourceType" value={domains.length} />
        <StatTile label="Answers citing you" metric="domainInfluence" value={owned.toLocaleString()} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Source type split" help={<MetricHelp id="sourceType" />} description="What kinds of sites engines trust for your topics" />
        <CardBody>
          <SegmentedBar parts={split.map((s) => ({ key: s.type, label: TYPE_META[s.type].label, value: s.count, color: TYPE_META[s.type].color }))} height={16} />
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Top domains" help={<MetricHelp id="domainCitations" />} />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Domain</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Citations</Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">Share <MetricHelp id="domainInfluence" /></span>
                  </Th>
                  <Th className="text-right">Answers</Th>
                  <Th>Tags</Th>
                </tr>
              </THead>
              <TBody>
                {domains.slice(0, 15).map((d) => (
                  <Tr key={d.domain}>
                    <Td className="font-medium text-ink">{d.domain}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="size-2 rounded-[2px]" style={{ background: TYPE_META[d.type].color }} aria-hidden="true" />
                        {TYPE_META[d.type].label}
                      </span>
                    </Td>
                    <Td className="text-right font-semibold text-ink">{d.citations.toLocaleString()}</Td>
                    <Td className="text-right">{d.share.toFixed(1)}%</Td>
                    <Td className="text-right">{d.answersCiting.toLocaleString()}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {d.tags.map((t) => (
                          <Badge key={t} tone="outline">{t}</Badge>
                        ))}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Top cited URLs" description="Pages that appear most often as sources" />
          <CardBody>
            <ol className="flex flex-col divide-y divide-line">
              {urls.slice(0, 12).map((u) => (
                <li key={u.url} className="flex items-center justify-between gap-3 py-2">
                  <a href={u.url} target="_blank" rel="noreferrer" className="group min-w-0">
                    <span className="flex items-center gap-1 text-sm font-medium text-ink group-hover:text-accent">
                      <span className="truncate">{u.title}</span>
                      <ExternalLink className="size-3 shrink-0 text-ink-4" aria-hidden="true" />
                    </span>
                    <span className="block truncate text-xs text-ink-4">
                      {u.domain} · last seen {fmtDate(u.lastSeenAt)}
                    </span>
                  </a>
                  <span className="flex shrink-0 items-center gap-2">
                    {u.type === "owned" ? <Badge tone="accent">Yours</Badge> : null}
                    <span className="w-10 text-right text-sm font-semibold text-ink tabular">{u.citations}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <SourceTags orgId={org.id} initial={tags.ok ? tags.data : []} knownDomains={domains.map((d) => d.domain)} />
      </div>
    </>
  );
}
