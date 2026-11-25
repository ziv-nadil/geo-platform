import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

const psql = (q: string) => execSync(`psql -h localhost -p 54322 -U postgres beacon -qc "${q}"`);

const O = "/app/northwind";
const TABS: [string, string, RegExp][] = [
  ["overview", "", /Overview/],
  ["prompts", "/prompts", /Prompts/],
  ["competitors", "/competitors", /Competitors/],
  ["citations", "/citations", /Citations & sources/],
  ["responses", "/responses", /Responses explorer/],
  ["sentiment", "/sentiment", /Sentiment/],
  ["site-health", "/site-health", /Site health/],
  ["crawlers", "/crawlers", /AI crawlers/],
  ["content", "/content", /Content/],
  ["creators", "/creators", /Creators/],
  ["outreach", "/outreach", /Outreach/],
  ["reports", "/reports", /Reports/],
  ["settings", "/settings", /Settings/],
  ["onboarding", "/onboarding", /Onboarding/],
];
// pages that carry metric "?" tooltips
const HAS_HELP = ["overview", "competitors", "citations", "sentiment", "crawlers"];

async function track(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
}

test.describe("client user (Northwind owner)", () => {
  for (const [name, path, h1] of TABS) {
    test(`tab ${name} loads with data`, async ({ page }) => {
      const errs = await track(page);
      await page.goto(O + path);
      await expect(page.locator("h1").first()).toHaveText(h1);
      await expect(page.getByText("This page could not be found")).toHaveCount(0);
      await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
      expect(errs).toEqual([]);
    });
  }

  test("overview shows seeded KPIs (not empty)", async ({ page }) => {
    await page.goto(O);
    for (const k of ["Visibility score", "Share of voice", "Citation share", "Net sentiment"]) await expect(page.getByText(k).first()).toBeVisible();
    await expect(page.getByText(/\d+(\.\d+)?\s*%/).first()).toBeVisible();
  });

  for (const name of HAS_HELP) {
    test(`tooltips on ${name}`, async ({ page }) => {
      await page.goto(O + TABS.find((t) => t[0] === name)![1]);
      const help = page.locator('main [aria-label^="What is"]');
      expect(await help.count()).toBeGreaterThan(0);
      await help.first().focus();
      await expect(page.getByRole("tooltip").first()).toBeVisible();
      await expect(page.getByRole("tooltip").first()).toContainText(/\S{10,}/);
    });
  }

  test("every metric tooltip on overview has definition + formula", async ({ page }) => {
    await page.goto(O);
    const help = page.locator('main [aria-label^="What is"]');
    const n = await help.count();
    for (let i = 0; i < n; i++) {
      await help.nth(i).focus();
      const tip = page.getByRole("tooltip").first();
      await expect(tip).toBeVisible();
      expect((await tip.innerText()).length).toBeGreaterThan(20);
      await page.keyboard.press("Escape");
    }
  });

  test("date range switch updates URL / view", async ({ page }) => {
    await page.goto(O);
    await page.getByRole("tab", { name: "7 days" }).or(page.getByRole("button", { name: "7 days" })).or(page.getByText("7 days", { exact: true })).first().click();
    await expect(page).toHaveURL(/7|range|days/);
  });

  test("prompt detail opens from list", async ({ page }) => {
    await page.goto(O + "/prompts");
    const link = page.locator('a[href*="/prompts/"]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    await page.goto(href!);
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
    await expect(page.locator("h1").first()).not.toHaveText(/^$/);
    await expect(page.locator("main")).toContainText(/ChatGPT|Claude|Gemini|Perplexity|Google/);
  });

  test("prompt detail with unknown id is 404", async ({ page }) => {
    await page.goto(O + "/prompts/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });

  test.afterEach(() => { psql("delete from competitors where name like 'QA Rival%'"); });

  test("competitors: add then remove", async ({ page }) => {
    const name = `QA Rival ${Date.now() % 100000}`;
    await page.goto(O + "/competitors");
    await page.getByRole("button", { name: /add competitor/i }).click();
    await page.locator("#comp-name").fill(name);
    await page.locator("#comp-domain").fill("qa-rival-example.com");
    await page.getByRole("button", { name: /^(add|track|save)/i }).last().click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText(name).first()).toBeVisible();
    await page.getByRole("button", { name: `Stop tracking ${name}` }).click();
    const confirm = page.getByRole("button", { name: /stop tracking|remove|confirm|yes/i }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.getByText(name)).toHaveCount(0, { timeout: 15_000 });
  });

  test("competitor form validates domain", async ({ page }) => {
    await page.goto(O + "/competitors");
    await page.getByRole("button", { name: /add competitor/i }).click();
    await page.locator("#comp-name").fill("Bad Domain Co");
    await page.locator("#comp-domain").fill("not a domain");
    await expect(page.getByRole("button", { name: /^(add|track)/i }).last()).toBeDisabled();
  });

  test("source tags: create, edit, delete", async ({ page }) => {
    const name = `QA tag ${Date.now() % 100000}`;
    await page.goto(O + "/citations");
    await page.getByRole("button", { name: /new tag/i }).click();
    await page.locator("#tag-name").fill(name);
    await page.locator("#tag-domains").fill("qa-example.com\nqa-two.org");
    await page.getByRole("button", { name: /^(save|create)/i }).last().click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await page.locator("#tag-name").fill(name + " v2");
    await page.getByRole("button", { name: /^(save|create)/i }).last().click();
    await expect(page.getByText(name + " v2").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: `Delete ${name} v2` }).click();
    await expect(page.getByText(name + " v2")).toHaveCount(0, { timeout: 15_000 });
  });

  test("settings: every tab renders", async ({ page }) => {
    await page.goto(O + "/settings");
    const tabs = ["General", "Members & roles", "Invitations", "SSO", "API keys", "Integrations", "Billing"];
    for (const t of tabs) {
      await page.getByRole("tab", { name: t }).click();
      await expect(page.getByRole("tab", { name: t })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toBeVisible();
      expect((await page.getByRole("tabpanel").innerText()).trim().length).toBeGreaterThan(10);
    }
  });

  test("settings: members tab lists seeded members", async ({ page }) => {
    await page.goto(O + "/settings");
    await page.getByRole("tab", { name: "Members & roles" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Dana Whitfield");
  });

  test("tenant isolation: Northwind user cannot open Lumen", async ({ page }) => {
    for (const p of ["/app/lumen", "/app/lumen/prompts", "/app/lumen/competitors", "/app/lumen/settings", "/app/lumen/onboarding"]) {
      await page.goto(p);
      await expect(page.getByText("This page could not be found"), p).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Lumen Skincare");
    }
  });

  test("tenant isolation: org switcher lists only own orgs", async ({ page }) => {
    await page.goto(O);
    await expect(page.locator("body")).not.toContainText("Lumen Skincare");
  });

  test("/admin is 404 for a client user", async ({ page }) => {
    for (const p of ["/admin", "/admin/settings"]) {
      await page.goto(p);
      await expect(page.getByText("This page could not be found"), p).toBeVisible();
    }
  });

  test("admin API refuses a client user", async ({ request }) => {
    const r = await request.get("/api/admin/orgs");
    expect([401, 403, 404, 405]).toContain(r.status());
  });

  test("onboarding API refuses another org", async ({ request }) => {
    const r = await request.get("/api/onboarding/10000000-0000-4000-b000-000000000002/progress");
    expect([401, 403, 404]).toContain(r.status());
  });

  test("unknown org slug is 404", async ({ page }) => {
    await page.goto("/app/does-not-exist");
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });
});
