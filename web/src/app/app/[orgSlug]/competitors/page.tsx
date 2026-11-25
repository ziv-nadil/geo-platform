import { Suspense } from "react";
import { CompetitorsView } from "@/components/dashboard/competitors-view";
import { loadPage, LoadFail, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getHeadToHead, getShareOfVoice } from "@/lib/data";

export const metadata = { title: "Competitors" };

export default function CompetitorsPage(props: PageProps<"/app/[orgSlug]/competitors">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Competitors {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Competitors(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, filters } = ctx;
  const [sov, h2h] = await Promise.all([getShareOfVoice(org.id, filters), getHeadToHead(org.id, filters, org.name)]);
  return (
    <>
      <PageHeader title="Competitors" description={`Who AI engines recommend instead of ${org.name}, and where you win. ${rangeLabel(filters)}.`} />
      {!sov.ok ? (
        <LoadFail result={sov} />
      ) : (
        <CompetitorsView orgId={org.id} rows={sov.data.rows} trend={sov.data.trend} h2h={h2h.ok ? h2h.data.rows : []} sample={h2h.ok ? h2h.data.sample : 0} brandName={org.name} />
      )}
    </>
  );
}
