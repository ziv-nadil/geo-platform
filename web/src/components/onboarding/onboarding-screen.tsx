import { OnboardingWizard } from "@/components/onboarding/wizard";
import { loadPage, LoadFail, type RouteProps } from "@/components/dashboard/page-kit";
import { PageHeader } from "@/components/ui/page-header";
import { ONBOARDING_STEPS } from "@/config/onboarding";
import { getOnboardingPlaceholders, getOnboardingState } from "@/lib/data";

export async function OnboardingScreen(props: RouteProps & { forceStep?: string }) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, sp } = ctx;
  const [initial, placeholders] = await Promise.all([getOnboardingState(org.id), getOnboardingPlaceholders(org.id)]);
  if (!initial.ok) return <LoadFail result={initial} />;
  const step = props.forceStep ?? (typeof sp.step === "string" ? sp.step : undefined);
  return (
    <>
      <PageHeader
        title="Onboarding"
        description={`Connect ${org.name}'s tools so we can monitor and improve AI visibility. Each step explains what we need, how to grant it, and tests the connection live.`}
      />
      <OnboardingWizard orgId={org.id} orgSlug={org.slug} orgName={org.name} steps={ONBOARDING_STEPS} placeholders={placeholders} initial={initial.data} initialStepId={step} />
    </>
  );
}
