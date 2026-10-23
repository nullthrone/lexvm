/**
 * Locate a Chromium binary for Playwright. Returns undefined when Playwright's
 * own bundled revision is installed (the normal case, e.g. in CI after
 * `npx playwright install chromium`). Otherwise falls back to the newest
 * chromium-* build under PLAYWRIGHT_BROWSERS_PATH, so a slightly different
 * pre-installed revision still works.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const CANDIDATES = [
  ["chrome-linux64", "chrome"],
  ["chrome-linux", "chrome"],
  ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
  ["chrome-win", "chrome.exe"],
];

export function chromiumExecutable(): string | undefined {
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    // executablePath() throws when the browser registry has no entry; fall through.
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of dirs) {
    for (const parts of CANDIDATES) {
      const path = join(root, dir, ...parts);
      if (existsSync(path)) return path;
    }
  }
  return undefined;
}
