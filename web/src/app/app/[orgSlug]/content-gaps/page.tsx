import { Suspense } from "react";
import { ContentGapsView } from "@/components/dashboard/content-gaps-view";
import { loadPage, LoadFail, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { ContentPipelineView } from "@/components/dashboard/content-pipeline-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listGaps, listListicles } from "@/lib/server/queries/content-gaps";
import { loadPipeline } from "@/lib/server/queries/content-pipeline";

export const metadata = { title: "Content gaps" };
// Creating an article (research, brief, draft, images) runs inside a server action on this route.
export const maxDuration = 300;

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
  const [gaps, items, pipe] = await Promise.all([listGaps(org.id), listListicles(org.id), loadPipeline(org.id)]);
  const fail = !gaps.ok ? gaps : !items.ok ? items : !pipe.ok ? pipe : null;
  return (
    <>
      <PageHeader title="Content gaps" description="Prompts where AI engines recommend your competitors and not you. Plan titles, research the competition, create a GEO article, approve it, and send it to your blog as a draft." />
      {fail ? <LoadFail result={fail} /> : gaps.ok && items.ok && pipe.ok ? (
        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Content pipeline</TabsTrigger>
            <TabsTrigger value="gaps">Gaps and listicles</TabsTrigger>
          </TabsList>
          <TabsContent value="pipeline" className="pt-4"><ContentPipelineView orgId={org.id} role={org.role} data={pipe.data} /></TabsContent>
          <TabsContent value="gaps" className="pt-4"><ContentGapsView orgId={org.id} role={org.role} gaps={gaps.data} items={items.data} /></TabsContent>
        </Tabs>
      ) : null}
    </>
  );
}
