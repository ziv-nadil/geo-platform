import { Suspense } from "react";
import { ContentView } from "@/components/dashboard/content-view";
import { loadPage, LoadFail, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getBrandKit, getContentDrafts } from "@/lib/data";

export const metadata = { title: "Content" };

export default function ContentPage(props: PageProps<"/app/[orgSlug]/content">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Content(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org } = ctx;
  const [kit, drafts] = await Promise.all([getBrandKit(org.id), getContentDrafts(org.id)]);
  return (
    <>
      <PageHeader title="Content" description="Your brand kit guides every draft we write. Drafts target the prompts where AI engines overlook you." />
      {!kit.ok ? <LoadFail result={kit} /> : <ContentView orgId={org.id} kit={kit.data} drafts={drafts.ok ? drafts.data : []} />}
    </>
  );
}
