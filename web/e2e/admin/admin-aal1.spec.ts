import { test, expect } from "@playwright/test";

test.describe("platform admin, aal1 (no MFA step-up)", () => {
  test("/admin requires MFA entirely: no console content", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId("admin-mfa-required")).toContainText(/MFA required/i);
    await expect(page.locator("body")).not.toContainText("Client accounts");
    await expect(page.locator("body")).not.toContainText("Northwind");
  });
  test("/admin/settings requires MFA too", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByTestId("admin-mfa-required")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Platform settings");
  });
  test("client org data is not reachable at aal1", async ({ page }) => {
    await page.goto("/app/northwind");
    await expect(page.getByText("This page could not be found")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Visibility score");
  });
});
