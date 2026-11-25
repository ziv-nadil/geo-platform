import { Suspense } from "react";
import { CreatorsView } from "@/components/dashboard/creators-view";
import { loadPage, LoadFail, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getCreators } from "@/lib/data";

export const metadata = { title: "Creators" };

export default function CreatorsPage(props: PageProps<"/app/[orgSlug]/creators">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Creators {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Creators(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org } = ctx;
  const r = await getCreators(org.id);
  if (!r.ok) return <LoadFail result={r} />;
  return (
    <>
      <PageHeader title="Creators" description="YouTube and TikTok creators covering your topics. Videos are a growing source in AI answers, especially Google AI Overviews and Gemini." />
      {r.data.length ? <CreatorsView orgId={org.id} creators={r.data} /> : <NoData org={org} what="creators" />}
    </>
  );
}
