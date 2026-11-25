import { Suspense } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import { loadPage, LoadFail, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getCrawlers } from "@/lib/data";
import { SERIES } from "@/lib/ui/chart-colors";
import { fmtNumber } from "@/lib/ui/format";

export const metadata = { title: "AI crawlers" };

const PURPOSE: Record<string, { label: string; tone: "info" | "accent" | "neutral" | "outline" }> = {
  search: { label: "Search / answers", tone: "accent" },
  user: { label: "User-triggered", tone: "info" },
  training: { label: "Model training", tone: "neutral" },
  unknown: { label: "Other", tone: "outline" },
};

export default function CrawlersPage(props: PageProps<"/app/[orgSlug]/crawlers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Crawlers {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Crawlers(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, filters } = ctx;
  const r = await getCrawlers(org.id, filters);
  const header = <PageHeader title="AI crawlers" description={`Verified visits from AI bots, read from your CDN logs. ${rangeLabel(filters)}.`} />;
  if (!r.ok) return (<>{header}<LoadFail result={r} /></>);
  const { bots, trend, operators, paths } = r.data;
  if (!bots.length) return (<>{header}<NoData org={org} what="crawler hits (connect Cloudflare in onboarding)" /></>);
  const total = bots.reduce((s, b) => s + b.hits, 0);
  const sum = (...p: string[]) => bots.filter((b) => p.includes(b.purpose)).reduce((s, b) => s + b.hits, 0);
  const errors = bots.reduce((s, b) => s + b.errorHits, 0);
  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="AI crawler hits" metric="crawlerHits" value={fmtNumber(total)} />
        <StatTile label="Answer-engine fetches" metric="crawlerHits" value={fmtNumber(sum("search", "user"))} footer={<span className="text-xs text-ink-3">Search and user-triggered bots</span>} />
        <StatTile label="Training crawls" metric="crawlerHits" value={fmtNumber(sum("training"))} footer={<span className="text-xs text-ink-3">GPTBot, ClaudeBot, Google-Extended…</span>} />
        <StatTile label="Error responses" metric="crawlerHits" value={fmtNumber(errors)} footer={<span className="text-xs text-ink-3">{total ? ((errors / total) * 100).toFixed(1) : 0}% of bot requests got 4xx/5xx</span>} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Hits by operator" help={<MetricHelp id="crawlerHits" />} description="Daily verified requests, all bots per company combined" />
        <CardBody>
          <TrendChart data={trend} unit="" series={operators.slice(0, 6).map((o, i) => ({ key: o, name: o, color: SERIES[i]! }))} height={260} />
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Bots" description="Each user agent, verified by reverse DNS or published IP ranges" />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Bot</Th>
                  <Th>Purpose</Th>
                  <Th className="text-right">Hits</Th>
                  <Th className="text-right">Errors</Th>
                  <Th className="text-right">Unique paths</Th>
                </tr>
              </THead>
              <TBody>
                {bots.map((b) => (
                  <Tr key={b.name}>
                    <Td>
                      <span className="block font-medium text-ink">{b.name}</span>
                      <span className="block text-xs text-ink-4">{b.operator}</span>
                    </Td>
                    <Td>
                      <Badge tone={PURPOSE[b.purpose]!.tone}>{PURPOSE[b.purpose]!.label}</Badge>
                    </Td>
                    <Td className="text-right font-semibold text-ink">{b.hits.toLocaleString()}</Td>
                    <Td className={b.errorHits ? "text-right text-bad" : "text-right"}>{b.errorHits.toLocaleString()}</Td>
                    <Td className="text-right">{b.uniquePaths.toLocaleString()}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Top paths" description="Most-requested URLs by AI bots" actions={<ButtonLink href={`/app/${org.slug}/site-health`} size="sm" variant="ghost">Site health</ButtonLink>} />
          <CardBody>
            <ul className="flex flex-col divide-y divide-line">
              {paths.slice(0, 12).map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm text-ink">{p.path}</span>
                    <span className="block truncate text-xs text-ink-4">{p.bots.join(", ") || "Mixed bots"}</span>
                  </span>
                  <span className="w-14 text-right text-sm font-semibold text-ink tabular">{fmtNumber(p.hits)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
      <p className="mt-4 text-xs text-ink-4">llms.txt monitoring is not wired yet: it needs a daily check job (backend TODO).</p>
    </>
  );
}
