import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3101";
const useExternalBaseUrl = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: useExternalBaseUrl
    ? undefined
    : {
      command: "npm run dev -- --port 3101",
      url: `${baseURL}/api/health/live`,
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        AUTH_SECRET: process.env.AUTH_SECRET ?? "lot5-e2e-local-secret",
      },
    },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "iphone16-safari-pwa",
      use: {
        ...devices["iPhone 15 Pro"],
        browserName: "webkit",
        viewport: { width: 393, height: 852 },
      },
    },
    {
      name: "android-chrome",
      use: {
        ...devices["Pixel 8"],
        browserName: "chromium",
      },
    },
  ],
});
