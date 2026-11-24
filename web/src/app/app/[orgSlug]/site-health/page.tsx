import { Suspense } from "react";
import { loadPage, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { SiteHealthView } from "@/components/dashboard/site-health-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSiteIssues, getSitePages, getSiteProperties, getSiteTasks } from "@/lib/mock";

export const metadata = { title: "Site health" };

export default function SiteHealthPage(props: PageProps<"/app/[orgSlug]/site-health">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SiteHealth {...(props as RouteProps)} />
    </Suspense>
  );
}

async function SiteHealth(props: RouteProps) {
  const { org } = await loadPage(props);
  if (!org.hasData) return (<><PageHeader title="Site health" demo={false} /><NoData org={org} /></>);
  const [properties, issues, pages, tasks] = await Promise.all([getSiteProperties(org.id), getSiteIssues(org.id), getSitePages(org.id), getSiteTasks(org.id)]);
  return (
    <>
      <PageHeader title="Site health" description="A weekly crawl of your sites checks what stops AI engines from reading, understanding and citing your pages." />
      <SiteHealthView properties={properties} issues={issues} pages={pages} tasks={tasks} />
    </>
  );
}
