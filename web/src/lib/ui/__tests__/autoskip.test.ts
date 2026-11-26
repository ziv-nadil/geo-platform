import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS } from "@/config/onboarding";
import { autoSkipReason, stepStatus, type WizardState } from "@/lib/ui/onboarding-logic";

const gh = ONBOARDING_STEPS.find((s) => s.id === "github")!;
const st = (cms?: string) => ({ values: cms ? { cms: { cms_platform: cms } } : {}, tests: {}, skipped: {} }) as unknown as WizardState;

describe("github auto-skip", () => {
  it("skips for non-Git CMS, not for git or unset", () => {
    expect(autoSkipReason(gh, st("wordpress"))).toBeTruthy();
    expect(stepStatus(gh, st("webflow"))).toBe("skipped");
    expect(autoSkipReason(gh, st("git"))).toBeNull();
    expect(autoSkipReason(gh, st())).toBeNull();
  });
  it("cms comes before github and no Indexing API remains", () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids.indexOf("cms")).toBeLessThan(ids.indexOf("github"));
    expect(JSON.stringify(ONBOARDING_STEPS)).not.toMatch(/Indexing API|indexing\.googleapis/);
  });
});
