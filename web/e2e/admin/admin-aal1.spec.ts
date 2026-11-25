import { test, expect } from "@playwright/test";

test.describe("platform admin, aal1 (no MFA step-up)", () => {
  test("console loads but flags that MFA is required for client access", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("body")).toContainText(/MFA required/i);
  });
  test("client org data is not reachable at aal1", async ({ page }) => {
    await page.goto("/app/northwind");
    await expect(page.getByText("This page could not be found")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Visibility score");
  });
});
