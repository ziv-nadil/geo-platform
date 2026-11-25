import { Suspense } from "react";
import { loadPage, LoadFail, NoData, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { SiteHealthView } from "@/components/dashboard/site-health-view";
import { PageHeader } from "@/components/ui/page-header";
import { getSiteHealth } from "@/lib/data";

export const metadata = { title: "Site health" };

export default function SiteHealthPage(props: PageProps<"/app/[orgSlug]/site-health">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SiteHealth {...(props as RouteProps)} />
    </Suspense>
  );
}

async function SiteHealth(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org } = ctx;
  const r = await getSiteHealth(org.id);
  return (
    <>
      <PageHeader title="Site health" description="A crawl of your sites checks what stops AI engines from reading, understanding and citing your pages." />
      {!r.ok ? <LoadFail result={r} /> : r.data.properties.length === 0 ? <NoData org={org} title="No site audits yet" description="Site health crawls your tracked properties for crawl blockers, broken links and missing llms.txt. Add your domain in onboarding to run the first audit." action={{ label: "Add domain in onboarding", href: `/app/${org.slug}/onboarding` }} /> : <SiteHealthView orgId={org.id} {...r.data} />}
    </>
  );
}
