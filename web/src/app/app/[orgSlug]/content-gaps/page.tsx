import { Suspense } from "react";
import { ContentGapsView } from "@/components/dashboard/content-gaps-view";
import { loadPage, LoadFail, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { listGaps, listListicles } from "@/lib/server/queries/content-gaps";

export const metadata = { title: "Content gaps" };

export default function ContentGapsPage(props: PageProps<"/app/[orgSlug]/content-gaps">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Gaps {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Gaps(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org } = ctx;
  const [gaps, items] = await Promise.all([listGaps(org.id), listListicles(org.id)]);
  const fail = !gaps.ok ? gaps : !items.ok ? items : null;
  return (
    <>
      <PageHeader title="Content gaps" description="Prompts where AI engines recommend your competitors and not you. Generate an honest listicle, review it, and send it to your own site as a draft." />
      {fail ? <LoadFail result={fail} /> : gaps.ok && items.ok ? <ContentGapsView orgId={org.id} role={org.role} gaps={gaps.data} items={items.data} /> : null}
    </>
  );
}
