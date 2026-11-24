import { Suspense } from "react";
import { ContentView } from "@/components/dashboard/content-view";
import { loadPage, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getBrandKit, getContentDrafts, getPrompts } from "@/lib/mock";

export const metadata = { title: "Content" };

export default function ContentPage(props: PageProps<"/app/[orgSlug]/content">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Content(props: RouteProps) {
  const { org, filters } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="Content" demo={false} /><NoData org={org} /></>);
  const [kit, drafts, prompts] = await Promise.all([getBrandKit(org.id), getContentDrafts(org.id), getPrompts(org.id, filters)]);
  const weakest = [...prompts].sort((a, b) => a.visibility - b.visibility).slice(0, 15).map((p) => p.text);
  return (
    <>
      <PageHeader title="Content" description="Your brand kit guides every draft we write. Drafts target the prompts where AI engines overlook you." />
      <ContentView kit={kit} drafts={drafts} prompts={weakest} />
    </>
  );
}
