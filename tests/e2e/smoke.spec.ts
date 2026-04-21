import { test, expect } from "@playwright/test";

test.describe("Task App smoke", () => {
  test("health endpoints are up", async ({ request }) => {
    const live = await request.get("/api/health/live");
    expect(live.ok()).toBeTruthy();

    // `/api/health` may be auth-protected depending on current deployment.
    // We only assert that the route is reachable (not 5xx).
    const ready = await request.get("/api/health", { maxRedirects: 0 });
    expect(ready.status()).toBeLessThan(500);
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("invalid login shows an error", async ({ page }) => {
    await page.goto("/login");
    const email = page.locator("input[type='email'], input[name='email']").first();
    await email.fill("invalid@example.com");
    await page.locator("input[type='password']").fill("invalid-password");
    await page.locator("button[type='submit']").click();
    await expect(page.getByText(/incorrect|invalide|invalid/i)).toBeVisible();
  });

  test("authenticated dashboard flow (optional)", async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, "E2E_USER_EMAIL / E2E_USER_PASSWORD not provided");

    await page.goto("/login");
    await page.locator("input[type='email'], input[name='email']").first().fill(email as string);
    await page.locator("input[type='password']").fill(password as string);
    await page.locator("button[type='submit']").click();

    await expect(page).toHaveURL(/\/(fr|en)?\/?$/);
    await expect(page.locator("body")).toContainText(/dashboard|projets|projects|mes tâches|my tasks/i);
  });
});
