import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { LoadFail } from "@/components/dashboard/page-kit";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";
import { getViewer } from "@/lib/data";

export const metadata = { title: "Super admin" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

/** Platform staff only. Anyone else gets a 404, so clients never learn the console exists. */
async function Gate({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer.ok) {
    if (viewer.reason === "forbidden") notFound();
    return <main className="mx-auto max-w-xl px-6 py-24"><LoadFail result={viewer} /></main>;
  }
  if (!viewer.data.isPlatformAdmin) notFound();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-8">
          <Link href="/admin" aria-label="Admin home"><Logo /></Link>
          <Badge tone="accent">Super admin</Badge>
          <nav className="flex gap-1 text-sm" aria-label="Admin">
            <Link href="/admin" className="rounded-sm px-2.5 py-1.5 font-medium text-ink-2 hover:bg-subtle hover:text-ink">Client accounts</Link>
            <Link href="/admin/settings" className="rounded-sm px-2.5 py-1.5 font-medium text-ink-2 hover:bg-subtle hover:text-ink">Platform settings</Link>
          </nav>
          <span className="ml-auto text-sm text-ink-3">
            {viewer.data.name} · {viewer.data.aal === "aal2" ? "MFA verified" : "MFA required for client access"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] px-8 pt-8 pb-16">{children}</main>
    </div>
  );
}
