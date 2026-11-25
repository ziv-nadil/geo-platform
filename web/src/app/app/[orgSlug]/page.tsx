import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { EngineChip } from "@/components/dashboard/engine-chip";
import { filterQs, fmtMaybe, loadPage, LoadFail, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getOverview, getShareOfVoice, getTopMovers } from "@/lib/data";
import { engineMeta } from "@/lib/ui/engines";
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
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, filters } = ctx;
  const [ov, sovR, moversR] = await Promise.all([getOverview(org.id, filters), getShareOfVoice(org.id, filters), getTopMovers(org.id, filters)]);
  if (!ov.ok) return <LoadFail result={ov} />;
  if (ov.data.kpis.answers === 0) {
    return (
      <>
        <PageHeader title="Overview" />
        <NoData org={org} />
      </>
    );
  }
  const { kpis: kpi, trend, engines, topSources } = ov.data;
  const sov = sovR.ok ? sovR.data.rows : [];
  const movers = moversR.ok ? moversR.data : { up: [], down: [] };
  const qs = filterQs(filters);
  const series = ov.data.engineIds.map((id) => engineMeta(id)).map((e) => ({ key: e.id, name: e.name, color: e.color }));
  const engineLabel = filters.engine === "all" ? "all engines" : engineMeta(filters.engine).name;
  const d = (k: { delta: number | null }) => k.delta ?? undefined;
  return (
    <>
      <PageHeader
        title="Overview"
        description={`How AI engines answer the ${kpi.answers.toLocaleString()} questions we tracked for ${org.name} across ${engineLabel}. ${rangeLabel(filters)}, compared with the ${filters.range} days before.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Visibility score" metric="visibility" value={fmtMaybe(kpi.visibility.value)} unit="%" delta={d(kpi.visibility)} trend={kpi.sparkVisibility} />
        <StatTile label="Share of voice" metric="shareOfVoice" value={fmtMaybe(kpi.shareOfVoice.value)} unit="%" delta={d(kpi.shareOfVoice)} trend={kpi.sparkSov} />
        <StatTile label="Citation share" metric="citationShare" value={fmtMaybe(kpi.citationShare.value)} unit="%" delta={d(kpi.citationShare)} trend={kpi.sparkCitation} />
        <StatTile label="Avg. position" metric="avgPosition" value={fmtMaybe(kpi.avgPosition.value)} delta={d(kpi.avgPosition)} deltaUnit="" upIsGood={false} trend={kpi.sparkPosition} />
        <StatTile label="Net sentiment" metric="sentiment" value={kpi.sentiment.value === null ? "—" : `${kpi.sentiment.value > 0 ? "+" : ""}${Math.round(kpi.sentiment.value)}`} delta={d(kpi.sentiment)} deltaUnit="" trend={kpi.sparkSentiment} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Visibility by engine" help={<MetricHelp id="visibility" />} description="Mean visibility score per engine · 3-day rolling average" />
          <CardBody>
            <TrendChart data={trend} series={series} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Engine breakdown" description={rangeLabel(filters)} />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Engine</Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">Visibility <MetricHelp id="visibility" /></span>
                  </Th>
                  <Th className="text-right">Mentioned in</Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">SoV <MetricHelp id="shareOfVoice" /></span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {engines.map((e) => (
                  <Tr key={e.engine}>
                    <Td>
                      <EngineChip id={e.engine} short />
                    </Td>
                    <Td className="text-right font-semibold text-ink">{fmtMaybe(e.visibility, 1, "%")}</Td>
                    <Td className="text-right">{fmtMaybe(e.pctMentioned ?? null, 1, "%")}</Td>
                    <Td className="text-right">{fmtMaybe(e.sov, 1, "%")}</Td>
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
                  {list.length === 0 ? <li className="py-2 text-sm text-ink-3">{movers.up.length + movers.down.length === 0 ? "Needs answers from the previous period to compare." : "No significant changes."}</li> : null}
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
            items={topSources.slice(0, 8).map((d) => ({
              key: d.domain,
              label: d.domain,
              sub: d.type === "owned" ? "Your site" : d.type === "ugc" ? "UGC / forum" : d.type,
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
