import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import { Suspense } from "react";
import { SegmentedBar } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { EngineChip } from "@/components/dashboard/engine-chip";
import { loadPage, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { getKpis, getSentimentSummary } from "@/lib/mock";
import { cn } from "@/lib/ui/cn";

export const metadata = { title: "Sentiment" };

const POS = "#1f8a4c";
const NEU = "#b8bec6";
const NEG = "#d0453f";

export default function SentimentPage(props: PageProps<"/app/[orgSlug]/sentiment">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SentimentContent {...(props as RouteProps)} />
    </Suspense>
  );
}

async function SentimentContent(props: RouteProps) {
  const { org, filters } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="Sentiment" demo={false} /><NoData org={org} /></>);
  const [s, kpi] = await Promise.all([getSentimentSummary(org.id, filters), getKpis(org.id, filters)]);
  const pct = (n: number) => ((n / Math.max(1, s.total)) * 100).toFixed(1);
  return (
    <>
      <PageHeader title="Sentiment" description={`How AI engines describe ${org.name} when they mention it. ${rangeLabel(filters)}.`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Net sentiment" metric="sentiment" value={kpi.sentiment > 0 ? `+${kpi.sentiment}` : kpi.sentiment} delta={kpi.sentiment - kpi.sentimentPrev} deltaUnit="" trend={kpi.sparkSentiment} />
        <StatTile label="Positive mentions" metric="sentiment" value={pct(s.distribution.positive)} unit="%" />
        <StatTile label="Neutral mentions" metric="sentiment" value={pct(s.distribution.neutral)} unit="%" />
        <StatTile label="Negative mentions" metric="sentiment" value={pct(s.distribution.negative)} unit="%" upIsGood={false} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Positive vs negative over time" help={<MetricHelp id="sentiment" />} description="Share of daily mentions" />
          <CardBody>
            <TrendChart
              data={s.trend}
              series={[
                { key: "positive", name: "Positive", color: POS },
                { key: "negative", name: "Negative", color: NEG },
              ]}
              height={260}
            />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="By engine" help={<MetricHelp id="sentiment" />} description="Tone split of mentions per engine" />
          <CardBody className="flex flex-col gap-4">
            {s.byEngine.map((e) => (
              <div key={e.engine} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <EngineChip id={e.engine} />
                  <span className="text-sm font-semibold text-ink tabular">{e.net > 0 ? `+${e.net}` : e.net}</span>
                </div>
                <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-xs" role="img" aria-label={`${e.positive}% positive, ${e.neutral}% neutral, ${e.negative}% negative`}>
                  <div style={{ width: `${e.positive}%`, background: POS }} />
                  <div style={{ width: `${e.neutral}%`, background: NEU }} />
                  <div style={{ width: `${e.negative}%`, background: NEG }} />
                </div>
              </div>
            ))}
            <SegmentedBar
              className="mt-2 [&>div:first-child]:hidden"
              parts={[
                { key: "p", label: "Positive", value: s.distribution.positive, color: POS },
                { key: "n", label: "Neutral", value: s.distribution.neutral, color: NEU },
                { key: "x", label: "Negative", value: s.distribution.negative, color: NEG },
              ]}
            />
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Themes" description="What engines praise and criticise, grouped by topic. Fix the negatives with content and reviews." />
        <CardBody>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {s.themes.map((t) => {
              const Icon = t.sentiment === "positive" ? ThumbsUp : t.sentiment === "negative" ? ThumbsDown : Minus;
              return (
                <li key={t.theme} className="flex flex-col gap-2 rounded-sm border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full",
                          t.sentiment === "positive" ? "bg-good-soft text-good" : t.sentiment === "negative" ? "bg-bad-soft text-bad" : "bg-subtle text-ink-3",
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      {t.theme}
                    </span>
                    <span className="text-xs text-ink-3 tabular">{t.mentions} mentions</span>
                  </div>
                  <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-ink-2 italic">“{t.example}”</blockquote>
                  <div className="flex flex-wrap gap-2">
                    {t.engines.map((e) => (
                      <EngineChip key={e} id={e} short className="text-xs" />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
