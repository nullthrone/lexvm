import { describe, expect, it } from "vitest";
import { precacheManifest, renderServiceWorker, shouldPrecache } from "../build/precache.ts";

const files = [
  { path: "index.html", content: "<html>" },
  { path: "assets/index-abc.js", content: "js" },
  { path: "assets/index-abc.js.map", content: "{}" },
  { path: "sw.js", content: "old" },
  { path: "packs/index.json", content: "{}" },
  { path: "packs/locked-study.lexpack.json", content: "{}" },
  { path: "lexvm-offline.html", content: "<html>offline" },
  { path: ".nojekyll", content: "" },
  { path: "icons/icon.svg", content: "<svg/>" },
];

describe("precache manifest", () => {
  it("lists every emitted file except the worker, maps and dotfiles, sorted", () => {
    expect(precacheManifest(files).urls).toEqual([
      "assets/index-abc.js",
      "icons/icon.svg",
      "index.html",
      "lexvm-offline.html",
      "packs/index.json",
      "packs/locked-study.lexpack.json",
    ]);
    expect(shouldPrecache("sub/.hidden/x")).toBe(false);
  });

  it("derives the cache name from the content of the files", () => {
    const a = precacheManifest(files).cacheName;
    expect(a).toMatch(/^lexvm-[0-9a-f]{16}$/);
    expect(precacheManifest([...files].reverse()).cacheName).toBe(a);
    const changed = files.map((f) => (f.path === "packs/index.json" ? { ...f, content: '{"x":1}' } : f));
    expect(precacheManifest(changed).cacheName).not.toBe(a);
    const ignored = files.map((f) => (f.path === "sw.js" ? { ...f, content: "new" } : f));
    expect(precacheManifest(ignored).cacheName).toBe(a);
  });

  it("renders a classic script with the build constants", () => {
    const manifest = precacheManifest(files);
    const sw = renderServiceWorker("const x = __CACHE_NAME__;\nexport {};\n", manifest);
    expect(sw).not.toMatch(/export\s*\{/);
    expect(sw).toContain(`const __CACHE_NAME__ = "${manifest.cacheName}";`);
    expect(sw).toContain('"lexvm-offline.html"');
    expect(() => new Function(sw)).not.toThrow();
  });
});
