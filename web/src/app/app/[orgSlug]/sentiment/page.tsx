import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import { Suspense } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import { EngineChip } from "@/components/dashboard/engine-chip";
import { loadPage, LoadFail, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { getSentiment } from "@/lib/data";
import { cn } from "@/lib/ui/cn";
import { fmtDay } from "@/lib/ui/format";

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
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, filters } = ctx;
  const r = await getSentiment(org.id, filters);
  const header = <PageHeader title="Sentiment" description={`How AI engines describe ${org.name} when they mention it. ${rangeLabel(filters)}.`} />;
  if (!r.ok) return (<>{header}<LoadFail result={r} /></>);
  const s = r.data;
  const total = s.totals.positive + s.totals.neutral + s.totals.negative;
  if (!total) return (<>{header}<NoData org={org} what="brand mentions" /></>);
  const pct = (n: number) => ((n / total) * 100).toFixed(1);
  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Net sentiment" metric="sentiment" value={s.net === null ? "—" : `${s.net > 0 ? "+" : ""}${s.net}`} />
        <StatTile label="Positive mentions" metric="sentiment" value={pct(s.totals.positive)} unit="%" footer={<span className="text-xs text-ink-3">{s.totals.positive.toLocaleString()} mentions</span>} />
        <StatTile label="Neutral mentions" metric="sentiment" value={pct(s.totals.neutral)} unit="%" footer={<span className="text-xs text-ink-3">{s.totals.neutral.toLocaleString()} mentions</span>} />
        <StatTile label="Negative mentions" metric="sentiment" value={pct(s.totals.negative)} unit="%" footer={<span className="text-xs text-ink-3">{s.totals.negative.toLocaleString()} mentions</span>} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Positive vs negative over time" help={<MetricHelp id="sentiment" />} description="Share of daily mentions" />
          <CardBody>
            <TrendChart data={s.trend} series={[{ key: "positive", name: "Positive", color: POS }, { key: "negative", name: "Negative", color: NEG }]} height={260} />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="By engine" help={<MetricHelp id="sentiment" />} description="Tone split of mentions per engine" />
          <CardBody className="flex flex-col gap-4">
            {s.byEngine.map((e) => (
              <div key={e.engine} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <EngineChip id={e.engine} />
                  <span className="text-sm font-semibold text-ink tabular">{e.net === null ? "—" : `${e.net > 0 ? "+" : ""}${e.net}`}</span>
                </div>
                <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-xs" role="img" aria-label={`${e.positive}% positive, ${e.neutral}% neutral, ${e.negative}% negative`}>
                  <div style={{ width: `${e.positive}%`, background: POS }} />
                  <div style={{ width: `${e.neutral}%`, background: NEU }} />
                  <div style={{ width: `${e.negative}%`, background: NEG }} />
                </div>
              </div>
            ))}
            <ul className="mt-1 flex gap-4 text-xs text-ink-2">
              {[["Positive", POS], ["Neutral", NEU], ["Negative", NEG]].map(([l, c]) => (
                <li key={l} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: c }} aria-hidden="true" />
                  {l}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="What engines say" description="Recent sentences about your brand, by tone. Fix the negatives with content, reviews and outreach." />
        <CardBody>
          {s.samples.length === 0 ? (
            <p className="text-sm text-ink-3">No sample sentences in range.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {s.samples.slice(0, 9).map((t, i) => {
                const Icon = t.sentiment === "positive" ? ThumbsUp : t.sentiment === "negative" ? ThumbsDown : Minus;
                return (
                  <li key={i} className="flex flex-col gap-2 rounded-sm border border-line p-3">
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      <span className={cn("flex size-6 items-center justify-center rounded-full", t.sentiment === "positive" ? "bg-good-soft text-good" : t.sentiment === "negative" ? "bg-bad-soft text-bad" : "bg-subtle text-ink-3")}>
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="capitalize">{t.sentiment}</span> · <EngineChip id={t.engine} short className="text-xs" /> · {fmtDay(t.date)}
                    </span>
                    <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-ink-2">“{t.snippet}”</blockquote>
                    <p className="truncate text-xs text-ink-4" title={t.promptText}>Prompt: {t.promptText}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
