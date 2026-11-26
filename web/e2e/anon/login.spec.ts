import { test, expect } from "@playwright/test";

test.describe("anonymous, no auth env", () => {
  test("login page shows 'Auth not configured'", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/auth not configured/i).first()).toBeVisible();
  });
  test("signup route is gone", async ({ page }) => {
    const r = await page.goto("/signup");
    expect(r?.status()).toBe(404);
  });
  test("/app without any identity does not expose dashboard data", async ({ page }) => {
    await page.goto("/app/northwind");
    await expect(page.getByText("Visibility score")).toHaveCount(0);
  });
  test("/admin without identity shows sign-in prompt, not the console", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("body")).not.toContainText("Client accounts");
    await expect(page.getByText(/sign in to see this account/i)).toBeVisible();
  });
});
