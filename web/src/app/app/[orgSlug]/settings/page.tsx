import { Suspense } from "react";
import { SettingsScreen } from "@/components/dashboard/settings-screen";
import { PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";

export const metadata = { title: "Settings" };

export default function SettingsPage(props: PageProps<"/app/[orgSlug]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsScreen {...(props as RouteProps)} />
    </Suspense>
  );
}
