import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS } from "@/config/onboarding";
import { adminGate } from "@/lib/ui/admin-gate";
import { overallProgress, substitute, variantLabel, variantSelector, type WizardState } from "@/lib/ui/onboarding-logic";
import { withTrackedCompetitors } from "@/lib/ui/sov";
import type { SovRow } from "@/lib/ui/data-types";

const brand: SovRow = { id: "b", name: "Brand", color: "#000", isBrand: true, sov: 50, sovPrev: null, mentions: 5, avgPosition: 1, sentiment: 0 };
const rival: SovRow = { id: "c1", name: "Old", color: "#111", isBrand: false, sov: 50, sovPrev: null, mentions: 5, avgPosition: 2, sentiment: 0 };

describe("competitor list merges tracked competitors (B2)", () => {
  it("shows a newly added competitor with zeros before any run", () => {
    const rows = withTrackedCompetitors([brand, rival], [
      { id: "c1", name: "Old", color: null, active: true },
      { id: "c2", name: "QA Rival", color: null, active: true },
    ]);
    const added = rows.find((r) => r.id === "c2")!;
    expect(added).toMatchObject({ name: "QA Rival", mentions: 0, sov: 0, isBrand: false });
    expect(added.color).toMatch(/^#|^var|^hsl|^rgb|oklch/);
  });
  it("drops competitors that were stopped, even with past mentions", () => {
    expect(withTrackedCompetitors([brand, rival], [{ id: "c1", name: "Old", color: null, active: false }]).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("one progress computation that counts skips (B5)", () => {
  const counted = ONBOARDING_STEPS.filter((s) => s.id !== "review");
  const optional = counted.find((s) => s.optional)!;
  const empty = (): WizardState => ({ values: {}, tests: {}, skipped: {}, serverStatus: {} });
  it("skipping a step raises the percentage", () => {
    const a = overallProgress(ONBOARDING_STEPS, empty());
    const st = empty();
    st.skipped[optional.id] = true;
    expect(overallProgress(ONBOARDING_STEPS, st)).toBeGreaterThan(a);
    expect(overallProgress(ONBOARDING_STEPS, st)).toBe(Math.round((1 / counted.length) * 100));
  });
  it("server status counts too", () => {
    const st = empty();
    st.serverStatus![counted[0]!.id] = "pass";
    expect(overallProgress(ONBOARDING_STEPS, st)).toBe(Math.round((1 / counted.length) * 100));
  });
});

describe("placeholders and variant labels (B4)", () => {
  it("substitutes known keys and uses the fallback for unset ones", () => {
    expect(substitute("a {{X}} b {{Y}}", { X: "1" })).toBe("a 1 b {{Y}}");
    expect(substitute("a {{X}} b {{Y}}", { X: "1" }, "NOT SET")).toBe("a 1 b NOT SET");
  });
  it("never uses a raw variant key as a label", () => {
    const gsc = ONBOARDING_STEPS.find((s) => s.id === "gsc")!;
    expect(variantSelector(gsc)).toBeUndefined();
    expect(variantLabel(gsc, undefined, "agency_email")).toBe("Add our agency email as Owner");
    const access = ONBOARDING_STEPS.find((s) => s.id === "access_method")!;
    expect(variantLabel(access, variantSelector(access), "domain_user")).toBe("Create a user for us in our domain");
    expect(variantLabel(gsc, undefined, "some_key")).toBe("Some key");
  });
});

describe("/admin gate requires aal2 entirely (S5)", () => {
  it("404 for non-staff, MFA wall for aal1 staff, console for aal2 staff", () => {
    expect(adminGate(false, "aal2")).toBe("not_found");
    expect(adminGate(true, "aal1")).toBe("mfa_required");
    expect(adminGate(true, "aal2")).toBe("ok");
  });
});
