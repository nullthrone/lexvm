/**
 * Build-time helpers for the service worker: which emitted files are
 * precached, the cache name (a content hash, so any change to any file yields
 * a new cache and an update), and the final sw.js source.
 */
import { createHash } from "node:crypto";

export interface BuiltFile {
  /** Path relative to the output directory, with forward slashes. */
  path: string;
  content: Uint8Array | string;
}

export const SW_FILE = "sw.js";

/** Everything except the service worker itself, source maps and dotfiles. */
export function shouldPrecache(path: string): boolean {
  if (path === SW_FILE || path.endsWith(".map")) return false;
  return !path.split("/").some((segment) => segment.startsWith("."));
}

export interface PrecacheManifest {
  urls: string[];
  cacheName: string;
}

export function precacheManifest(files: readonly BuiltFile[]): PrecacheManifest {
  const selected = files
    .map((f) => ({ ...f, path: f.path.replaceAll("\\", "/") }))
    .filter((f) => shouldPrecache(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash("sha256");
  for (const file of selected) {
    const contentHash = createHash("sha256").update(file.content).digest("hex");
    hash.update(`${file.path}\n${contentHash}\n`);
  }
  return { urls: selected.map((f) => f.path), cacheName: `lexvm-${hash.digest("hex").slice(0, 16)}` };
}

/**
 * Wrap the transpiled service worker module: drop the module marker and
 * define the build constants in an IIFE (sw.js is a classic script).
 */
export function renderServiceWorker(transpiled: string, manifest: PrecacheManifest): string {
  const body = transpiled.replace(/^\s*export\s*\{\s*\};?\s*$/gm, "").trim();
  return [
    "/* LexVM service worker. Generated at build time; do not edit. */",
    "(() => {",
    `const __PRECACHE__ = ${JSON.stringify(manifest.urls, null, 1)};`,
    `const __CACHE_NAME__ = ${JSON.stringify(manifest.cacheName)};`,
    body,
    "})();",
    "",
  ].join("\n");
}
