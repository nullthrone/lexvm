import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, inlineHashes, withContentSecurityPolicy } from "../build/csp.ts";

const hash = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

const PWA = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<script>(() => { document.documentElement.dataset.theme = "dark"; })();</script>
<script type="module" crossorigin src="./assets/index-abc.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-abc.css">
</head><body></body></html>`;

const SINGLE = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<script>theme()</script>
<script type="module" crossorigin>console.log("app")</script>
<style rel="stylesheet" crossorigin>body{color:red}</style>
</head><body></body></html>`;

describe("Content-Security-Policy of the builds", () => {
  it("hashes exactly the inline scripts and styles", () => {
    expect(inlineHashes(PWA)).toEqual({
      scripts: [hash('(() => { document.documentElement.dataset.theme = "dark"; })();')],
      styles: [],
    });
    expect(inlineHashes(SINGLE)).toEqual({
      scripts: [hash("theme()"), hash('console.log("app")')],
      styles: [hash("body{color:red}")],
    });
  });

  it("allows the app's own origin for the PWA and nothing but hashed inline code for the single file", () => {
    const pwa = contentSecurityPolicy(PWA, false);
    expect(pwa).toContain("default-src 'none'");
    expect(pwa).toContain(
      `script-src 'self' ${hash('(() => { document.documentElement.dataset.theme = "dark"; })();')}`,
    );
    expect(pwa).toContain("style-src 'self';");
    expect(pwa).toContain("worker-src 'self'");
    expect(pwa).not.toContain("unsafe");
    const single = contentSecurityPolicy(SINGLE, true);
    expect(single).toContain(`script-src ${hash("theme()")} ${hash('console.log("app")')};`);
    expect(single).toContain(`style-src ${hash("body{color:red}")};`);
    expect(single).toContain("img-src data:");
    expect(single).not.toMatch(/'self'|connect-src|unsafe/);
    for (const policy of [pwa, single]) {
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("base-uri 'none'");
      expect(policy).toContain("require-trusted-types-for 'script'");
    }
  });

  it("puts the meta tag right after the charset and replaces an older one", () => {
    const once = withContentSecurityPolicy(PWA, false);
    expect(once).toMatch(
      /<meta charset="utf-8" \/>\n {4}<meta http-equiv="Content-Security-Policy" content="[^"]+" \/>\n<script>/,
    );
    const twice = withContentSecurityPolicy(once, false);
    expect(twice).toBe(once);
    expect(twice.match(/Content-Security-Policy/g)).toHaveLength(1);
  });
});
