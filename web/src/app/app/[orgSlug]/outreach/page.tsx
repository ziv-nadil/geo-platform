import { Suspense } from "react";
import { OutreachView } from "@/components/dashboard/outreach-view";
import { loadPage, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { getOutreachContacts } from "@/lib/mock";

export const metadata = { title: "Outreach" };

export default function OutreachPage(props: PageProps<"/app/[orgSlug]/outreach">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Outreach {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Outreach(props: RouteProps) {
  const { org } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="Outreach" demo={false} /><NoData org={org} /></>);
  const contacts = await getOutreachContacts(org.id);
  return (
    <>
      <PageHeader title="Outreach" description="Editors, reviewers and community moderators at the sites AI engines cite. Get your brand onto the pages that shape the answers." />
      <OutreachView contacts={contacts} />
    </>
  );
}
