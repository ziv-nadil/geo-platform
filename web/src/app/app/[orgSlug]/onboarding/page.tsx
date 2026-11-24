import { Suspense } from "react";
import { PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

export const metadata = { title: "Onboarding" };

export default function OnboardingPage(props: PageProps<"/app/[orgSlug]/onboarding">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OnboardingScreen {...(props as RouteProps)} />
    </Suspense>
  );
}

