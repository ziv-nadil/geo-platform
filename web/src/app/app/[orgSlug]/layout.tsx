import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Sidebar, SidebarFallback } from "@/components/shell/sidebar";
import { Topbar, TopbarFallback } from "@/components/shell/topbar";
import { ViewAsBanner } from "@/components/shell/view-as-banner";
import { getOrgBySlug, getSessionUser, listOrgs } from "@/lib/mock";

const VIEW_AS_COOKIE = "bgeo_view_as";

export default function OrgLayout({ children, params }: LayoutProps<"/app/[orgSlug]">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ params, children }: { params: Promise<{ orgSlug: string }>; children: ReactNode }) {
  const { orgSlug } = await params;
  const [org, user, orgs, jar] = await Promise.all([getOrgBySlug(orgSlug), getSessionUser(), listOrgs(), cookies()]);
  if (!org) notFound();
  const viewAs = user.isPlatformAdmin && jar.get(VIEW_AS_COOKIE)?.value === org.slug;
  return (
    <div className="flex min-h-screen flex-col">
      {viewAs ? <ViewAsBanner orgName={org.name} /> : null}
      <div className="flex flex-1">
        <Sidebar org={org} orgs={orgs} canSwitch={user.isPlatformAdmin && !viewAs} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} viewAs={viewAs} />
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
