import { Suspense } from "react";
import { OutreachView } from "@/components/dashboard/outreach-view";
import { loadPage, LoadFail, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getOutreach } from "@/lib/data";

export const metadata = { title: "Outreach" };

export default function OutreachPage(props: PageProps<"/app/[orgSlug]/outreach">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Outreach {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Outreach(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org } = ctx;
  const r = await getOutreach(org.id);
  if (!r.ok) return <LoadFail result={r} />;
  return (
    <>
      <PageHeader title="Outreach" description="Editors, reviewers and community moderators at the sites AI engines cite. Get your brand onto the pages that shape the answers." />
      {r.data.length ? <OutreachView orgId={org.id} contacts={r.data.filter((c) => c.stage !== "ignored")} /> : <NoData org={org} what="outreach contacts" />}
    </>
  );
}
