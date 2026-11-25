import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { LoadFail } from "@/components/dashboard/page-kit";
import { Sidebar, SidebarFallback } from "@/components/shell/sidebar";
import { Topbar, TopbarFallback } from "@/components/shell/topbar";
import { ViewAsBanner } from "@/components/shell/view-as-banner";
import { getOrgBySlug, getViewAsGrant, getViewer, listOrgs } from "@/lib/data";

export default function OrgLayout({ children, params }: LayoutProps<"/app/[orgSlug]">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ params, children }: { params: Promise<{ orgSlug: string }>; children: ReactNode }) {
  const { orgSlug } = await params;
  const viewer = await getViewer();
  if (!viewer.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <LoadFail result={viewer} />
      </main>
    );
  }
  const [org, orgs] = await Promise.all([getOrgBySlug(orgSlug), listOrgs()]);
  if (!org.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <LoadFail result={org} />
      </main>
    );
  }
  if (!org.data) notFound();
  const grant = viewer.data.isPlatformAdmin && !org.data.role ? await getViewAsGrant(org.data.id) : null;
  const viewAs = Boolean(grant);
  return (
    <div className="flex min-h-screen flex-col">
      {viewAs ? <ViewAsBanner orgName={org.data.name} expiresAt={grant!.expiresAt} /> : null}
      <div className="flex flex-1">
        <Sidebar org={org.data} orgs={orgs.ok ? orgs.data : [org.data]} canSwitch={!viewAs && (orgs.ok ? orgs.data.length > 1 : false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={viewer.data} viewAs={viewAs} />
          <main className="mx-auto w-full max-w-[1320px] flex-1 px-8 pt-8 pb-16">{children}</main>
        </div>
      </div>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="flex min-h-screen">
      <SidebarFallback />
      <div className="flex-1">
        <TopbarFallback />
      </div>
    </div>
  );
}
