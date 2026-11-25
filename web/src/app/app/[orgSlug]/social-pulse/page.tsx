import { Suspense } from "react";
import { SocialPulseView } from "@/components/dashboard/social-pulse-view";
import { loadPage, LoadFail, PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { loadSocialPulse } from "@/lib/server/queries/social-pulse";

export const metadata = { title: "Social pulse" };

export default function SocialPulsePage(props: PageProps<"/app/[orgSlug]/social-pulse">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Pulse {...(props as RouteProps)} />
    </Suspense>
  );
}

async function Pulse(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org } = ctx;
  const data = await loadSocialPulse(org.id);
  return (
    <>
      <PageHeader title="Social pulse" description="What people are saying today about your brand and topics on Reddit, X and LinkedIn (public posts only), with GEO content titles you can approve." />
      {!data.ok ? <LoadFail result={data} /> : <SocialPulseView orgId={org.id} role={org.role} data={data.data} />}
    </>
  );
}
