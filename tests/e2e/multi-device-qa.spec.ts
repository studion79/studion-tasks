import { expect, test } from "@playwright/test";

async function assertNoPageHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      viewport: window.innerWidth,
      htmlScrollWidth: html.scrollWidth,
      bodyScrollWidth: body?.scrollWidth ?? 0,
    };
  });
  expect(metrics.htmlScrollWidth).toBeLessThanOrEqual(metrics.viewport + 2);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewport + 2);
}

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.locator("form")).toBeVisible();

  const identifierCandidates = [
    page.getByLabel(/identifiant|identifier|email|username/i).first(),
    page.getByPlaceholder(/admin|exemple|example|email/i).first(),
    page.locator("input[name='identifier']").first(),
    page.locator("input[name='email']").first(),
    page.locator("input[type='email']").first(),
    page.locator("input[type='text']").first(),
  ];
  let identifierFilled = false;
  for (const locator of identifierCandidates) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(email);
      identifierFilled = true;
      break;
    }
  }
  expect(identifierFilled).toBeTruthy();

  const passwordCandidates = [
    page.getByLabel(/mot de passe|password/i).first(),
    page.getByPlaceholder(/••••|password|mot de passe/i).first(),
    page.locator("input[name='password']").first(),
    page.locator("input[type='password']").first(),
  ];
  let passwordFilled = false;
  for (const locator of passwordCandidates) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(password);
      passwordFilled = true;
      break;
    }
  }
  expect(passwordFilled).toBeTruthy();

  await page.locator("button[type='submit']").first().click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

async function screenshotStep(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

test.describe("Lot 5 - Multi-device QA", () => {
  test("public mobile baseline (login screen)", async ({ page }, testInfo) => {
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible();
    await assertNoPageHorizontalOverflow(page);
    await screenshotStep(page, testInfo, "mobile-login-baseline");
  });

  test("authenticated mobile flow: home + project views", async ({ page }, testInfo) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, "E2E_USER_EMAIL / E2E_USER_PASSWORD not provided");

    await login(page, email as string, password as string);

    await expect(page.locator("body")).toContainText(/dashboard|mes tâches|my tasks|projets|projects/i);
    await assertNoPageHorizontalOverflow(page);
    await screenshotStep(page, testInfo, "home-initial");

    const doneFilter = page.getByRole("button", { name: /terminées|completed|done/i }).first();
    if (await doneFilter.isVisible()) {
      await doneFilter.click();
      await assertNoPageHorizontalOverflow(page);
      await screenshotStep(page, testInfo, "home-filter-completed");
    }

    const projectLink = page.locator("a[href^='/projects/']").first();
    await expect(projectLink).toBeVisible();
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\//);
    await assertNoPageHorizontalOverflow(page);
    await screenshotStep(page, testInfo, "project-initial");

    const tabTargets: Array<{ key: string; regex: RegExp }> = [
      { key: "spreadsheet", regex: /tableur|spreadsheet/i },
      { key: "cards", regex: /fiches|cards/i },
      { key: "kanban", regex: /kanban/i },
      { key: "calendar", regex: /calendrier|calendar/i },
    ];

    for (const tab of tabTargets) {
      const tabButton = page.getByRole("button", { name: tab.regex }).first();
      if (!(await tabButton.isVisible())) continue;
      await tabButton.click();
      await page.waitForTimeout(250);
      await assertNoPageHorizontalOverflow(page);
      await screenshotStep(page, testInfo, `project-${tab.key}`);
    }
  });
});
