/**
 * Render the app icons from scripts/icon-art.ts with Playwright's Chromium.
 * Writes public/icons/icon.svg and the PNGs referenced by index.html and the
 * manifest. Run with `npm run icons -w @lexvm/web`; commit the outputs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { chromiumExecutable } from "./chromium.ts";
import { type IconVariant, iconSvg } from "./icon-art.ts";

const outDir = fileURLToPath(new URL("../public/icons/", import.meta.url));

const OUTPUTS: Array<{ file: string; variant: IconVariant; size: number }> = [
  { file: "icon-192.png", variant: "any", size: 192 },
  { file: "icon-512.png", variant: "any", size: 512 },
  { file: "maskable-512.png", variant: "maskable", size: 512 },
  { file: "apple-touch-icon.png", variant: "apple", size: 180 },
  { file: "favicon-32.png", variant: "any", size: 32 },
];

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}icon.svg`, iconSvg("any"));
  const executablePath = chromiumExecutable();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const output of OUTPUTS) {
      const svg = Buffer.from(iconSvg(output.variant)).toString("base64");
      await page.setViewportSize({ width: output.size, height: output.size });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">` +
          `<img src="data:image/svg+xml;base64,${svg}" width="${output.size}" height="${output.size}" style="display:block">` +
          `</body></html>`,
      );
      await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
      const png = await page.screenshot({
        omitBackground: true,
        clip: { x: 0, y: 0, width: output.size, height: output.size },
      });
      writeFileSync(`${outDir}${output.file}`, png);
      console.log(`wrote public/icons/${output.file}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
