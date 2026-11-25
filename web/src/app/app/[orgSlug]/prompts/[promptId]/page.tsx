import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BarList } from "@/components/charts/bar-list";
import { AnswerText } from "@/components/dashboard/answer-text";
import { EngineAnswerTabs } from "@/components/dashboard/engine-answer-tabs";
import { filterQs, fmtMaybe, loadPage, LoadFail, PageSkeleton, rangeLabel } from "@/components/dashboard/page-kit";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { getPromptDetail } from "@/lib/data";
import { engineMeta } from "@/lib/ui/engines";

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
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, filters } = ctx;
  const { promptId } = await props.params;
  const r = await getPromptDetail(org.id, promptId, filters);
  if (!r.ok) return <LoadFail result={r} />;
  const d = r.data;
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
            {d.prompt.topic ? <Badge tone="outline">{d.prompt.topic}</Badge> : null}
            {d.prompt.persona ? <Badge tone="outline">{d.prompt.persona}</Badge> : null}
            {d.prompt.funnel ? <Badge tone="outline" className="capitalize">{d.prompt.funnel}</Badge> : null}
            <span className="text-sm text-ink-3">· {d.prompt.runs.toLocaleString()} answers in range</span>
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Prompt visibility" metric="promptVisibility" value={fmtMaybe(d.prompt.visibility, 0)} unit="%" />
        <StatTile label="Avg. position" metric="avgPosition" value={fmtMaybe(d.prompt.avgPosition)} />
        <StatTile label="Answers collected" metric="answers" value={d.prompt.runs.toLocaleString()} />
        <StatTile label="Latest answers naming you" metric="mentions" value={`${mentionedCount}/${d.answers.length}`} footer={<span className="text-xs text-ink-3">most recent answer per engine</span>} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Latest answers" description="Most recent answer from each engine. Your brand is highlighted in teal, competitors in amber." />
          <CardBody>
            <EngineAnswerTabs
              answers={d.answers.map((a) => ({
                engine: a.engine,
                date: a.date,
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
            <CardHeader title="Visibility by engine" help={<MetricHelp id="promptVisibility" />} description={rangeLabel(filters)} />
            <CardBody>
              <BarList items={d.byEngine.map((e) => ({ key: e.engine, label: engineMeta(e.engine).short, sub: `${e.runs} answers`, value: e.visibility ?? 0, color: engineMeta(e.engine).color }))} max={100} />
            </CardBody>
          </Card>
          {d.competitorsMentioned.length ? (
            <Card>
              <CardHeader title="Competitors named" description="Across answers in range" />
              <CardBody>
                <BarList unit="" items={d.competitorsMentioned.slice(0, 6).map((c) => ({ key: c.name, label: c.name, value: c.mentions, color: "#8a929c" }))} />
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Top sources for this prompt" help={<MetricHelp id="domainCitations" />} />
            <CardBody>
              <ul className="flex flex-col divide-y divide-line">
                {d.topSources.length === 0 ? <li className="py-2 text-sm text-ink-3">No citations in range.</li> : null}
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
