import { Suspense } from "react";
import { PageSkeleton, type RouteProps } from "@/components/dashboard/page-kit";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

export const metadata = { title: "Review onboarding" };

export default function OnboardingReviewPage(props: PageProps<"/app/[orgSlug]/onboarding/review">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OnboardingScreen {...(props as RouteProps)} forceStep="review" />
    </Suspense>
  );
}
