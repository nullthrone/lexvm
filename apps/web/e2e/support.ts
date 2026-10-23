/** Shared helpers for the end-to-end specs (not a spec file itself). */
import { expect, type Page } from "@playwright/test";

/**
 * Collect Content-Security-Policy and Trusted Types violations of a page (both builds carry a policy).
 * Call before the first navigation; the returned list fills while the page runs.
 */
export async function watchPolicyViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content.Security.Policy|Trusted.?Type/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/Content.Security.Policy|Trusted.?Type/i.test(error.message)) violations.push(error.message);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(
        `Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI} ` +
          `"${event.sample}" at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      );
    });
  });
  return violations;
}

/**
 * Wait until the autosave in IndexedDB holds at least `commands` accepted commands.
 * The autosave is asynchronous, so a reload right after a tap could otherwise drop the last move.
 */
export async function waitForAutosave(page: Page, commands: number): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open("lexvm");
              open.onerror = () => resolve(0);
              open.onsuccess = () => {
                const db = open.result;
                try {
                  const all = db.transaction("saves", "readonly").objectStore("saves").getAll();
                  all.onsuccess = () => {
                    db.close();
                    const saves = all.result as Array<{ save?: { log?: unknown[] } }>;
                    resolve(Math.max(0, ...saves.map((entry) => entry.save?.log?.length ?? 0)));
                  };
                  all.onerror = () => {
                    db.close();
                    resolve(0);
                  };
                } catch {
                  db.close();
                  resolve(0);
                }
              };
            }),
        ),
      { message: "the autosave reaches IndexedDB", timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(commands);
}
