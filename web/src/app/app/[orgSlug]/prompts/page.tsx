import { Suspense } from "react";
import { PromptsView } from "@/components/dashboard/prompts-view";
import { filterQs, loadPage, LoadFail, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { SuggestionsPanel } from "@/components/dashboard/suggestions-panel";
import { getPrompts } from "@/lib/data";
import { listSuggestions } from "@/lib/server/queries/discovery";

export const metadata = { title: "Prompts" };

export default function PromptsPage(props: PageProps<"/app/[orgSlug]/prompts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prompts {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Prompts(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, filters } = ctx;
  const [r, sg] = await Promise.all([getPrompts(org.id, filters), listSuggestions(org.id)]);
  const discovery = sg.ok ? <SuggestionsPanel orgId={org.id} rows={sg.data.rows} remaining={sg.data.remaining} limit={sg.data.limit} /> : null;
  return (
    <>
      <PageHeader title="Prompts" description={`The questions we ask AI engines every day on behalf of ${org.name}. ${rangeLabel(filters)}.`} />
      {!r.ok ? <LoadFail result={r} /> : r.data.rows.length === 0 ? <NoData org={org} what="tracked prompts" /> : <PromptsView orgId={org.id} orgSlug={org.slug} qs={filterQs(filters)} rows={r.data.rows} engineIds={r.data.engineIds} topics={r.data.topics} discovery={discovery} />}
    </>
  );
}
