import { test, expect } from "@playwright/test";

test.describe("platform admin, aal2", () => {
  test("/admin loads", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
    await expect(page.locator("main")).toContainText(/Northwind/);
    await expect(page.locator("main")).toContainText(/Lumen/);
  });
  test("/admin/settings loads", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
  });
  test("admin console shows MFA verified", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("body")).toContainText("MFA verified");
  });
  test("admin cannot open a client org without a support grant", async ({ page }) => {
    await page.goto("/app/northwind");
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });
});
