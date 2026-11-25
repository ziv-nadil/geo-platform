import { Suspense } from "react";
import { PromptsView } from "@/components/dashboard/prompts-view";
import { filterQs, loadPage, LoadFail, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getPrompts } from "@/lib/data";

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
  const r = await getPrompts(org.id, filters);
  return (
    <>
      <PageHeader title="Prompts" description={`The questions we ask AI engines every day on behalf of ${org.name}. ${rangeLabel(filters)}.`} />
      {!r.ok ? <LoadFail result={r} /> : r.data.rows.length === 0 ? <NoData org={org} what="tracked prompts" /> : <PromptsView orgId={org.id} orgSlug={org.slug} qs={filterQs(filters)} rows={r.data.rows} engineIds={r.data.engineIds} topics={r.data.topics} />}
    </>
  );
}
