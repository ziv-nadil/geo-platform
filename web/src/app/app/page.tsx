import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadFail, PageSkeleton } from "@/components/dashboard/page-kit";
import { EmptyState } from "@/components/ui/empty-state";
import { getViewer, listOrgs } from "@/lib/data";

export default function AppIndex() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Pick />
    </Suspense>
  );
}

/** /app → the viewer's first account; platform staff go to the admin console. */
async function Pick() {
  const viewer = await getViewer();
  if (!viewer.ok) return <main className="mx-auto max-w-xl px-6 py-24"><LoadFail result={viewer} /></main>;
  const orgs = await listOrgs();
  if (!orgs.ok) return <main className="mx-auto max-w-xl px-6 py-24"><LoadFail result={orgs} /></main>;
  const own = orgs.data.filter((o) => o.role);
  if (own[0]) redirect(`/app/${own[0].slug}`);
  if (viewer.data.isPlatformAdmin) redirect("/admin");
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <EmptyState title="You're not in any account yet" description="Ask your account owner for an invitation link." />
    </main>
  );
}
