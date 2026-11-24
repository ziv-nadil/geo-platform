import { Suspense } from "react";
import { CompetitorsView } from "@/components/dashboard/competitors-view";
import { loadPage, NoData, PageSkeleton, rangeLabel, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getCompetitors, getHeadToHead, getShareOfVoice, getSovTrend } from "@/lib/mock";

export const metadata = { title: "Competitors" };

export default function CompetitorsPage(props: PageProps<"/app/[orgSlug]/competitors">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Competitors {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Competitors(props: RouteProps) {
  const { org, filters } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="Competitors" demo={false} /><NoData org={org} /></>);
  const [rows, trend, comps] = await Promise.all([getShareOfVoice(org.id, filters), getSovTrend(org.id, filters), getCompetitors(org.id)]);
  const h2h = await Promise.all(comps.map(async (c) => ({ competitorId: c.id, ...(await getHeadToHead(org.id, c.id, filters)) })));
  return (
    <>
      <PageHeader title="Competitors" description={`Who AI engines recommend instead of ${org.name}, and where you win. ${rangeLabel(filters)}.`} />
      <CompetitorsView rows={rows} trend={trend} h2h={h2h} brandName={org.name} />
    </>
  );
}
