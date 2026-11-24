import { Suspense } from "react";
import { CreatorsView } from "@/components/dashboard/creators-view";
import { loadPage, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getCreators } from "@/lib/mock";

export const metadata = { title: "Creators" };

export default function CreatorsPage(props: PageProps<"/app/[orgSlug]/creators">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Creators {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Creators(props: RouteProps) {
  const { org } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="Creators" demo={false} /><NoData org={org} /></>);
  const creators = await getCreators(org.id);
  return (
    <>
      <PageHeader title="Creators" description="YouTube and TikTok creators covering your topics. Videos are a growing source in AI answers, especially Google AI Overviews and Gemini." />
      <CreatorsView creators={creators} />
    </>
  );
}
