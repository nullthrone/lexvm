/**
 * End-to-end tests against the production build (vite preview on dist/).
 * Build first: `npm run packs && npm run build -w @lexvm/web` (root), then `npm run e2e -w @lexvm/web`.
 */
import { defineConfig, devices } from "@playwright/test";
import { chromiumExecutable } from "./scripts/chromium.ts";

const PORT = 4173;
const executablePath = chromiumExecutable();

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: "en-US",
    trace: "retain-on-failure",
    serviceWorkers: "allow",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium", locale: "en-US" } },
    { name: "pixel", use: { ...devices["Pixel 7"], locale: "en-US" } },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
