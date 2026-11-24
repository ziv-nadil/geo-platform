import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { EngineChip } from "@/components/dashboard/engine-chip";
import { filterQs, loadPage, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import {
  ENGINE_BY_ID,
  ENGINES,
  getCitationDomains,
  getEngineBreakdown,
  getKpis,
  getShareOfVoice,
  getTopMovers,
  getVisibilityTrend,
} from "@/lib/mock";
import { cn } from "@/lib/ui/cn";

export const metadata = { title: "Overview" };

export default function OverviewPage(props: PageProps<"/app/[orgSlug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Overview(props: RouteProps) {
  const { org, filters } = await loadPage(props);
  if (!org.hasData) {
    return (
      <>
        <PageHeader title="Overview" demo={false} />
        <NoData org={org} />
      </>
    );
  }
  const [kpi, trend, engines, sov, movers, domains] = await Promise.all([
    getKpis(org.id, filters),
    getVisibilityTrend(org.id, filters),
    getEngineBreakdown(org.id, filters),
    getShareOfVoice(org.id, filters),
    getTopMovers(org.id, filters),
    getCitationDomains(org.id, filters),
  ]);
  const qs = filterQs(filters);
  const series = ENGINES.filter((e) => filters.engine === "all" || e.id === filters.engine).map((e) => ({ key: e.id, name: e.name, color: e.color }));
  const engineLabel = filters.engine === "all" ? "all engines" : ENGINE_BY_ID[filters.engine].name;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`How AI engines answer the ${kpi.answers.toLocaleString()} questions we tracked for ${org.name} across ${engineLabel}. ${rangeLabel(filters)}, compared with the ${filters.range} days before.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Visibility score" metric="visibility" value={kpi.visibility.toFixed(1)} unit="%" delta={kpi.visibility - kpi.visibilityPrev} trend={kpi.sparkVisibility} />
        <StatTile label="Share of voice" metric="shareOfVoice" value={kpi.shareOfVoice.toFixed(1)} unit="%" delta={kpi.shareOfVoice - kpi.shareOfVoicePrev} trend={kpi.sparkSov} />
        <StatTile label="Citation share" metric="citationShare" value={kpi.citationShare.toFixed(1)} unit="%" delta={kpi.citationShare - kpi.citationSharePrev} trend={kpi.sparkCitation} />
        <StatTile label="Avg. position" metric="avgPosition" value={kpi.avgPosition.toFixed(1)} delta={kpi.avgPosition - kpi.avgPositionPrev} deltaUnit="" upIsGood={false} trend={kpi.sparkPosition} />
        <StatTile label="Net sentiment" metric="sentiment" value={kpi.sentiment > 0 ? `+${kpi.sentiment}` : kpi.sentiment} delta={kpi.sentiment - kpi.sentimentPrev} deltaUnit="" trend={kpi.sparkSentiment} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Visibility by engine" help={<MetricHelp id="visibility" />} description="Share of answers that mention you, per engine · 3-day rolling average" />
          <CardBody>
            <TrendChart data={trend} series={series} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Engine breakdown" description={`${rangeLabel(filters)} vs previous`} />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Engine</Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">Visibility <MetricHelp id="visibility" /></span>
                  </Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">Pos. <MetricHelp id="avgPosition" /></span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {engines.map((e) => (
                  <Tr key={e.engine}>
                    <Td>
                      <EngineChip id={e.engine} short />
                    </Td>
                    <Td className="text-right">
                      <span className="font-semibold text-ink">{e.visibility.toFixed(1)}%</span>
                      <span className={cn("ml-2 text-xs", e.delta >= 0 ? "text-good" : "text-bad")}>
                        {e.delta >= 0 ? "+" : "−"}
                        {Math.abs(e.delta).toFixed(1)}
                      </span>
                    </Td>
                    <Td className="text-right">{e.avgPosition ? e.avgPosition.toFixed(1) : "—"}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Share of voice"
            help={<MetricHelp id="shareOfVoice" />}
            description="Your mentions vs tracked competitors"
            actions={
              <Link href={`/app/${org.slug}/competitors${qs}`} className="text-sm font-medium text-accent hover:underline">
                All competitors
              </Link>
            }
          />
          <CardBody>
            <BarList items={sov.map((s) => ({ key: s.id, label: s.isBrand ? `${s.name} (you)` : s.name, value: s.sov, color: s.color, highlight: s.isBrand }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Top movers" help={<MetricHelp id="movers" />} description="Prompt visibility vs previous period" />
          <CardBody className="grid gap-5 md:grid-cols-2">
            {(
              [
                ["Gaining", movers.up, ArrowUpRight, "text-good"],
                ["Losing", movers.down, ArrowDownRight, "text-bad"],
              ] as const
            ).map(([label, list, Icon, cls]) => (
              <div key={label} className="min-w-0">
                <p className="mb-2 text-2xs font-semibold tracking-wider text-ink-4 uppercase">{label}</p>
                <ul className="flex flex-col divide-y divide-line">
                  {list.length === 0 ? <li className="py-2 text-sm text-ink-3">No significant changes.</li> : null}
                  {list.map((m) => (
                    <li key={m.promptId} className="py-2">
                      <Link href={`/app/${org.slug}/prompts/${m.promptId}${qs}`} className="group flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-sm text-ink-2 group-hover:text-ink">{m.text}</span>
                        <span className={cn("inline-flex shrink-0 items-center text-sm font-semibold tabular", cls)}>
                          <Icon className="size-3.5" aria-hidden="true" />
                          {Math.abs(m.delta).toFixed(0)} pt
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Most-cited sources"
          help={<MetricHelp id="domainCitations" />}
          description="Domains AI engines lean on when answering your prompts"
          actions={
            <Link href={`/app/${org.slug}/citations${qs}`} className="text-sm font-medium text-accent hover:underline">
              Citations & sources
            </Link>
          }
        />
        <CardBody>
          <BarList
            unit=""
            items={domains.slice(0, 8).map((d) => ({
              key: d.domain,
              label: d.domain,
              sub: d.type === "owned" ? "Your site" : d.type,
              value: d.citations,
              highlight: d.type === "owned",
              color: d.type === "owned" ? "#008c99" : "#8a929c",
            }))}
          />
        </CardBody>
      </Card>
    </>
  );
}
