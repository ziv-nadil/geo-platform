import { Suspense } from "react";
import { AnswerText } from "@/components/dashboard/answer-text";
import { filterQs, loadPage, LoadFail, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { ResponsesView } from "@/components/dashboard/responses-view";
import { PageHeader } from "@/components/ui/page-header";
import { getResponses } from "@/lib/data";

export const metadata = { title: "Responses" };

export default function ResponsesPage(props: PageProps<"/app/[orgSlug]/responses">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Responses {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Responses(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, filters } = ctx;
  const r = await getResponses(org.id, filters, 80);
  if (!r.ok) return <LoadFail result={r} />;
  const { items, brandName, competitorNames, total } = r.data;
  if (!items.length) return (<><PageHeader title="Responses explorer" /><NoData org={org} /></>);
  return (
    <>
      <PageHeader title="Responses explorer" description={`Read exactly what each engine answered. Showing the latest ${items.length} of ${total.toLocaleString()} answers in range. Your brand is highlighted in teal, competitors in amber.`} />
      <ResponsesView
        orgSlug={org.slug}
        qs={filterQs(filters)}
        items={items.map((i, idx) => ({
          key: `${i.id}-${idx}`,
          engine: i.engine,
          date: i.date,
          promptId: i.promptId,
          promptText: i.promptText,
          topic: "",
          mentioned: i.mentioned,
          position: i.position,
          sentiment: i.sentiment,
          citations: i.citations.length,
          brands: i.brandsInOrder,
          preview: i.text.split("\n").filter(Boolean).slice(1, 2).join(" "),
          body: <AnswerText text={i.text} brand={brandName} competitors={competitorNames} />,
        }))}
      />
    </>
  );
}
