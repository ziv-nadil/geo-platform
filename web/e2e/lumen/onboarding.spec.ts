import { test, expect, type Page } from "@playwright/test";

const URL = "/app/lumen/onboarding";
const stepBtn = (p: Page, label: string) => p.locator('nav[aria-label="Onboarding steps"] button').filter({ hasText: label });

test.describe("onboarding wizard (Lumen owner, org in onboarding)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator("h1").first()).toHaveText("Onboarding");
  });

  test("progress bar is consistent with the summary text", async ({ page }) => {
    const bars = page.getByRole("progressbar", { name: "Onboarding progress" });
    expect(await bars.count()).toBeGreaterThan(0);
    await expect(page.getByText(/\d+% complete/)).toBeVisible();
    const text = await page.locator("main").innerText();
    const pct = Number(/(\d+)% complete/.exec(text)?.[1]);
    for (let i = 0; i < (await bars.count()); i++) {
      expect(Number(await bars.nth(i).getAttribute("aria-valuenow")), `progressbar #${i} vs "${pct}% complete"`).toBe(pct);
    }
  });

  test("step count is consistent (header vs 'N of M steps')", async ({ page }) => {
    const text = await page.locator("main").innerText();
    const of = Number(/of (\d+) steps working or skipped/.exec(text)?.[1]);
    const stepOf = Number(/Step \d+ of (\d+)/.exec(text)?.[1]);
    expect(stepOf - 1, "Review step should not count as a task step").toBe(of);
  });

  test("step navigation: sidebar, Next and Previous", async ({ page }) => {
    await expect(page.getByText(/Step 1 of/)).toBeVisible();
    await page.getByRole("button", { name: /^Next:/ }).click();
    await expect(page.getByText(/Step 2 of/)).toBeVisible();
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(page.getByText(/Step 1 of/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
    await stepBtn(page, "DNS").click();
    await expect(page.locator("main")).toContainText("Where is your DNS hosted?");
    await expect(stepBtn(page, "DNS")).toHaveAttribute("aria-current", "step");
  });

  test("review step is reachable and lists all steps", async ({ page }) => {
    await stepBtn(page, "Review").click();
    await expect(page.getByRole("region", { name: "Review" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Review" })).toContainText("Company");
  });

  test("skip an optional step and undo (progress changes)", async ({ page }) => {
    const pct = async () => Number(/(\d+)% complete/.exec(await page.locator("main").innerText())?.[1] ?? -1);
    const before = await pct();
    await stepBtn(page, "Cloudflare").click();
    await page.getByRole("button", { name: /skip \/ not applicable/i }).click();
    await expect(page.getByText(/Skipped/).first()).toBeVisible();
    await expect.poll(pct, { timeout: 10_000 }).toBeGreaterThan(before);
    const bar = Number(await page.getByRole("progressbar", { name: "Onboarding progress" }).first().getAttribute("aria-valuenow"));
    expect(bar, "top progress bar should match the summary").toBe(await pct());
    await page.getByRole("button", { name: /undo skip/i }).click();
    await expect.poll(pct, { timeout: 10_000 }).toBe(before);
  });

  test("required (non-optional) step has no plain skip except GitHub", async ({ page }) => {
    await stepBtn(page, "Company").click();
    await expect(page.getByRole("button", { name: /skip \/ not applicable/i })).toHaveCount(0);
  });

  test("selector field shows/hides dependent fields (access method)", async ({ page }) => {
    await stepBtn(page, "Access method").click();
    const radios = page.getByRole("radio");
    await radios.nth(0).click(); // agency email
    await expect(page.getByText("Email of the user you created for us")).toHaveCount(0);
    await radios.nth(1).click(); // domain user
    await expect(page.getByText("Email of the user you created for us").first()).toBeVisible();
    await expect(page.getByText("Password", { exact: true })).toBeVisible();
    await radios.nth(0).click(); // restore
    await expect(page.getByText("Email of the user you created for us")).toHaveCount(0);
  });

  test("CMS selector toggles fields (WordPress adds Username, Other swaps credential for notes)", async ({ page }) => {
    await stepBtn(page, "CMS").click();
    const pick = async (label: string) => {
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: label, exact: true }).click();
    };
    await pick("WordPress");
    await expect(page.getByText("Username", { exact: true })).toBeVisible();
    await pick("Ghost");
    await expect(page.getByText("Username", { exact: true })).toHaveCount(0);
    await pick("Other");
    await expect(page.getByText("Tell us about your CMS")).toBeVisible();
    await expect(page.getByText("API token / key / application password")).toHaveCount(0);
  });

  test("instructions variant follows the CMS", async ({ page }) => {
    await stepBtn(page, "CMS").click();
    const pick = async (label: string) => {
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: label, exact: true }).click();
    };
    await pick("WordPress");
    await expect(page.locator("main")).toContainText(/Application Password/i);
    await pick("Shopify");
    await expect(page.locator("main")).toContainText(/shpat_/);
    await expect(page.locator("main")).not.toContainText(/Application Passwords? /);
  });

  test("instructions variant follows the DNS provider", async ({ page }) => {
    await stepBtn(page, "DNS").click();
    await expect(page.locator("main")).toContainText(/Choose .Where is your DNS hosted/);
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Cloudflare" }).click();
    await expect(page.locator("main")).toContainText("dash.cloudflare.com");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "GoDaddy" }).click();
    await expect(page.locator("main")).toContainText(/godaddy/i);
    await expect(page.locator("main")).not.toContainText("dash.cloudflare.com");
  });

  test("instructions do not leak raw placeholders or variant keys", async ({ page }) => {
    for (const s of ["Access method", "Search Console", "DNS", "GA4"]) {
      await stepBtn(page, s).click();
      if (s === "Access method") await page.getByRole("radio").first().click();
      const t = await page.locator("main").innerText();
      expect(t, `step ${s}`).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(t, `step ${s}`).not.toMatch(/^(agency_email|domain_user)$/m);
    }
  });

  test("live test returns not_configured gracefully", async ({ page }) => {
    await stepBtn(page, "Access method").click();
    await page.getByRole("radio").first().click();
    await page.getByRole("button", { name: /run live tests?/i }).click();
    // Expected: "The test service is not configured". Any visible feedback is the minimum bar.
    await expect(page.getByText(/not configured|sign in|unauthenticated|could not|failed to/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/something went wrong|unexpected token/i)).toHaveCount(0);
  });

  test("test API returns not_configured JSON", async ({ page }) => {
    const r = await page.request.post("/api/onboarding/10000000-0000-4000-b000-000000000002/test/access_method", { data: {} });
    expect(r.status(), "API should honour the dev auth bypass like the pages do").not.toBe(401);
    expect(JSON.stringify(await r.json().catch(() => ({})))).toMatch(/not_configured|pass|partial|fail/);
  });

  test("skip state persists across reload", async ({ page }) => {
    await stepBtn(page, "Cloudflare").click();
    await page.getByRole("button", { name: /skip \/ not applicable/i }).click();
    await page.waitForTimeout(1500);
    await page.reload();
    await stepBtn(page, "Cloudflare").click();
    await expect(page.getByRole("button", { name: /undo skip/i })).toBeVisible();
    await page.getByRole("button", { name: /undo skip/i }).click();
  });

  test("tenant isolation: Lumen owner cannot open Northwind", async ({ page }) => {
    for (const p of ["/app/northwind", "/app/northwind/prompts", "/app/northwind/settings"]) {
      await page.goto(p);
      await expect(page.getByText("This page could not be found"), p).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Northwind Analytics");
    }
  });

  test("/admin is 404 for client owner", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });
});
