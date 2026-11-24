import { CheckCircle2, ExternalLink, ShieldOff, XCircle } from "lucide-react";
import { Suspense } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import { loadPage, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getCrawlerBots, getCrawlerPaths, getCrawlerTrend, getLlmsTxt } from "@/lib/mock";
import { SERIES } from "@/lib/ui/chart-colors";
import { cn } from "@/lib/ui/cn";
import { fmtDateTime, fmtNumber } from "@/lib/ui/format";

export const metadata = { title: "AI crawlers" };

const PURPOSE: Record<string, { label: string; tone: "info" | "accent" | "neutral" }> = {
  search: { label: "Search / answers", tone: "accent" },
  user: { label: "User-triggered", tone: "info" },
  training: { label: "Model training", tone: "neutral" },
};

export default function CrawlersPage(props: PageProps<"/app/[orgSlug]/crawlers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Crawlers {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Crawlers(props: RouteProps) {
  const { org, filters } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="AI crawlers" demo={false} /><NoData org={org} /></>);
  const [bots, trend, paths, llms] = await Promise.all([getCrawlerBots(org.id, filters.range), getCrawlerTrend(org.id, filters.range), getCrawlerPaths(org.id), getLlmsTxt(org.id)]);
  const total = bots.reduce((s, b) => s + b.hits, 0);
  const prev = bots.reduce((s, b) => s + b.hitsPrev, 0);
  const sum = (p: string) => bots.filter((b) => b.purpose === p).reduce((s, b) => s + b.hits, 0);
  const ops = ["OpenAI", "Perplexity", "Google", "Microsoft", "Anthropic"];
  return (
    <>
      <PageHeader title="AI crawlers" description={`Verified visits from AI bots, read from your Cloudflare logs. ${rangeLabel(filters)}.`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="AI crawler hits" metric="crawlerHits" value={fmtNumber(total)} delta={((total - prev) / Math.max(1, prev)) * 100} deltaUnit="%" />
        <StatTile label="Answer-engine fetches" metric="crawlerHits" value={fmtNumber(sum("search") + sum("user"))} footer={<span className="text-xs text-ink-3">Search and user-triggered bots</span>} />
        <StatTile label="Training crawls" metric="crawlerHits" value={fmtNumber(sum("training"))} footer={<span className="text-xs text-ink-3">GPTBot, ClaudeBot, Google-Extended…</span>} />
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink-3">
            llms.txt <MetricHelp id="llmsTxt" />
          </div>
          {llms.reachable ? (
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-good">
              <CheckCircle2 className="size-5" aria-hidden="true" /> Live
            </p>
          ) : (
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-bad">
              <XCircle className="size-5" aria-hidden="true" /> Missing ({llms.statusCode})
            </p>
          )}
          <p className="text-xs text-ink-3">
            {llms.reachable ? `${llms.linksTotal} links · ${llms.linksBroken} broken · ${llms.sizeKb} KB` : "Publish /llms.txt so models find your key pages."}
          </p>
          <a href={llms.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            {llms.url.replace("https://", "")} <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Hits by operator" help={<MetricHelp id="crawlerHits" />} description="Daily verified requests, all bots per company combined" />
        <CardBody>
          <TrendChart data={trend} unit="" series={ops.map((o, i) => ({ key: o, name: o, color: SERIES[i]! }))} height={260} />
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
                  <Th className="text-right">Change</Th>
                  <Th>Last seen</Th>
                  <Th>robots.txt</Th>
                </tr>
              </THead>
              <TBody>
                {bots.map((b) => {
                  const d = ((b.hits - b.hitsPrev) / Math.max(1, b.hitsPrev)) * 100;
                  return (
                    <Tr key={b.id}>
                      <Td>
                        <span className="block font-medium text-ink">{b.name}</span>
                        <span className="block text-xs text-ink-4">{b.operator}</span>
                      </Td>
                      <Td>
                        <Badge tone={PURPOSE[b.purpose]!.tone}>{PURPOSE[b.purpose]!.label}</Badge>
                      </Td>
                      <Td className="text-right font-semibold text-ink">{b.hits.toLocaleString()}</Td>
                      <Td className={cn("text-right text-sm", d >= 0 ? "text-good" : "text-bad")}>
                        {d >= 0 ? "+" : "−"}
                        {Math.abs(d).toFixed(0)}%
                      </Td>
                      <Td className="text-sm">{fmtDateTime(b.lastSeen).replace(", 2026", "")}</Td>
                      <Td>
                        {b.blocked ? (
                          <span className="inline-flex items-center gap-1 text-sm text-bad">
                            <ShieldOff className="size-4" aria-hidden="true" /> Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm text-good">
                            <CheckCircle2 className="size-4" aria-hidden="true" /> Allowed
                          </span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
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
                  <span className="flex items-center gap-2">
                    {p.status !== 200 ? <Badge tone="bad">{p.status}</Badge> : null}
                    <span className="w-14 text-right text-sm font-semibold text-ink tabular">{fmtNumber(p.hits)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
