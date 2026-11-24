import { Suspense } from "react";
import { PromptsView } from "@/components/dashboard/prompts-view";
import { filterQs, loadPage, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getDiscoverySuggestions, getPrompts, getTopics } from "@/lib/mock";

export const metadata = { title: "Prompts" };

export default function PromptsPage(props: PageProps<"/app/[orgSlug]/prompts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prompts {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Prompts(props: RouteProps) {
  const { org, filters } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="Prompts" demo={false} /><NoData org={org} /></>);
  const [rows, { topics, personas }, suggestions] = await Promise.all([getPrompts(org.id, filters), getTopics(org.id), getDiscoverySuggestions(org.id)]);
  return (
    <>
      <PageHeader title="Prompts" description={`The questions we ask AI engines every day on behalf of ${org.name}. ${rangeLabel(filters)}.`} />
      <PromptsView orgSlug={org.slug} qs={filterQs(filters)} rows={rows} topics={topics} personas={personas} suggestions={suggestions} />
    </>
  );
}
