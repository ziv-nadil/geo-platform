import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import { AnswerText } from "@/components/dashboard/answer-text";
import { EngineAnswerTabs } from "@/components/dashboard/engine-answer-tabs";
import { filterQs, loadPage, PageSkeleton, rangeLabel } from "@/components/dashboard/page-kit";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { getPromptDetail } from "@/lib/mock";
import { fmtNumber } from "@/lib/ui/format";

export const metadata = { title: "Prompt detail" };

type Props = { params: Promise<{ orgSlug: string; promptId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function PromptDetailPage(props: PageProps<"/app/[orgSlug]/prompts/[promptId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PromptDetail {...(props as Props)} />
    </Suspense>
  );
}

async function PromptDetail(props: Props) {
  const { org, filters } = await loadPage(props);
  const { promptId } = await props.params;
  if (!org.hasData) notFound();
  const d = await getPromptDetail(org.id, promptId, filters);
  if (!d) notFound();
  const qs = filterQs(filters);
  const mentionedCount = d.answers.filter((a) => a.mentioned).length;
  return (
    <>
      <Link href={`/app/${org.slug}/prompts${qs}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" /> All prompts
      </Link>
      <PageHeader
        title={`“${d.prompt.text}”`}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{d.prompt.topic}</Badge>
            <Badge tone="outline">{d.prompt.persona}</Badge>
            <Badge tone="outline" className="capitalize">{d.prompt.funnel}</Badge>
            <span className="text-sm text-ink-3">
              · {fmtNumber(d.prompt.volume)} est. monthly searches <MetricHelp id="promptVolume" />
            </span>
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Prompt visibility" metric="promptVisibility" value={d.row.visibility.toFixed(0)} unit="%" delta={d.row.visibility - d.row.visibilityPrev} />
        <StatTile label="Avg. position" metric="avgPosition" value={d.row.avgPosition?.toFixed(1) ?? "—"} />
        <StatTile label="Net sentiment" metric="sentiment" value={d.row.sentiment > 0 ? `+${d.row.sentiment}` : d.row.sentiment} />
        <StatTile label="Mentioned today" metric="mentions" value={`${mentionedCount}/${d.answers.length}`} footer={<span className="text-xs text-ink-3">engines that named you</span>} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Today's answers" description="Latest answer from each engine. Your brand is highlighted in teal, competitors in amber." />
          <CardBody>
            <EngineAnswerTabs
              answers={d.answers.map((a) => ({
                engine: a.engine,
                mentioned: a.mentioned,
                position: a.position,
                sentiment: a.sentiment,
                citations: a.citations,
                body: <AnswerText text={a.text} brand={d.brandName} competitors={d.competitorNames} />,
              }))}
            />
          </CardBody>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Visibility trend" help={<MetricHelp id="promptVisibility" />} description={rangeLabel(filters)} />
            <CardBody>
              <TrendChart data={d.trend} series={[{ key: "all", name: "All engines", color: "#008c99" }]} height={180} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Top sources for this prompt" help={<MetricHelp id="domainCitations" />} />
            <CardBody>
              <ul className="flex flex-col divide-y divide-line">
                {d.topSources.map((s) => (
                  <li key={s.url} className="flex items-center justify-between gap-3 py-2">
                    <a href={s.url} target="_blank" rel="noreferrer" className="group min-w-0">
                      <span className="flex items-center gap-1 truncate text-sm font-medium text-ink group-hover:text-accent">
                        {s.title}
                        <ExternalLink className="size-3 shrink-0 text-ink-4" aria-hidden="true" />
                      </span>
                      <span className="block truncate text-xs text-ink-4">{s.domain}</span>
                    </a>
                    <span className="flex shrink-0 items-center gap-2">
                      {s.type === "owned" ? <Badge tone="accent">Yours</Badge> : <Badge tone="outline" className="capitalize">{s.type}</Badge>}
                      <span className="w-6 text-right text-sm font-semibold text-ink tabular">{s.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
