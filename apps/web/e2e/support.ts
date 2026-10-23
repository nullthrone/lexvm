/** Shared helpers for the end-to-end specs (not a spec file itself). */
import type { Page } from "@playwright/test";

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
