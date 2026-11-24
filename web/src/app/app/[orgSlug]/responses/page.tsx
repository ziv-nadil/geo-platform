import { Suspense } from "react";
import { AnswerText } from "@/components/dashboard/answer-text";
import { filterQs, loadPage, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { ResponsesView } from "@/components/dashboard/responses-view";
import { PageHeader } from "@/components/ui/page-header";
import { getResponses } from "@/lib/mock";

export const metadata = { title: "Responses" };

export default function ResponsesPage(props: PageProps<"/app/[orgSlug]/responses">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Responses {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Responses(props: RouteProps) {
  const { org, filters } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="Responses" demo={false} /><NoData org={org} /></>);
  const { items, brandName, competitorNames } = await getResponses(org.id, filters, { limit: 80 });
  return (
    <>
      <PageHeader title="Responses explorer" description="Read exactly what each engine answered in the last three daily runs. Your brand is highlighted in teal, competitors in amber." />
      <ResponsesView
        orgSlug={org.slug}
        qs={filterQs(filters)}
        items={items.map((i, idx) => ({
          key: `${i.date}-${i.engine}-${i.promptId}-${idx}`,
          engine: i.engine,
          date: i.date,
          promptId: i.promptId,
          promptText: i.promptText,
          topic: i.topic,
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
