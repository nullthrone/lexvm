/**
 * Vite plugins for the LexVM web app:
 * - builtinPacks: virtual module with the built-in packs, inlined only in the single-file build.
 * - singlefileHtml: strips manifest/icon links that cannot work from file:// and inlines an SVG favicon.
 * - pwa: copies the single-file build into dist and generates dist/sw.js with a precache list of every emitted file.
 * - csp: adds the Content-Security-Policy meta tag to the written index.html (see csp.ts); it runs before pwa,
 *   so the precache list and the copied single-file build carry the final HTML.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Plugin, transformWithOxc } from "vite";
import { isSafeRelativePath } from "../src/logic/catalog.ts";
import { withContentSecurityPolicy } from "./csp.ts";
import { type BuiltFile, precacheManifest, renderServiceWorker, SW_FILE } from "./precache.ts";

const VIRTUAL_PACKS = "virtual:lexvm-builtin-packs";
const RESOLVED_VIRTUAL_PACKS = `\0${VIRTUAL_PACKS}`;

/** Read packs/index.json and every pack file it lists from `packsDir`. */
export function readBundledPacks(packsDir: string): { catalog: unknown; packs: Record<string, unknown> } | null {
  const catalogPath = join(packsDir, "index.json");
  if (!existsSync(catalogPath)) return null;
  const catalog: unknown = JSON.parse(readFileSync(catalogPath, "utf8"));
  const packs: Record<string, unknown> = {};
  const list = (catalog as { packs?: unknown }).packs;
  if (Array.isArray(list)) {
    for (const entry of list) {
      const file = (entry as { file?: unknown }).file;
      if (typeof file !== "string" || !isSafeRelativePath(file)) continue;
      const path = join(packsDir, file);
      if (existsSync(path)) packs[file] = JSON.parse(readFileSync(path, "utf8"));
    }
  }
  return { catalog, packs };
}

export function builtinPacksPlugin(options: { inline: boolean; packsDir: string }): Plugin {
  return {
    name: "lexvm-builtin-packs",
    resolveId(id) {
      return id === VIRTUAL_PACKS ? RESOLVED_VIRTUAL_PACKS : undefined;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_PACKS) return undefined;
      if (!options.inline) return "export const bundled = null;\n";
      const bundled = readBundledPacks(options.packsDir);
      if (!bundled) {
        this.warn(`no built-in packs found in ${options.packsDir} (run "npm run packs" at the repo root)`);
        return "export const bundled = null;\n";
      }
      this.addWatchFile(join(options.packsDir, "index.json"));
      // JSON.parse of a string literal is faster to start than a large object literal.
      return `export const bundled = JSON.parse(${JSON.stringify(JSON.stringify(bundled))});\n`;
    },
  };
}

export function singlefileHtmlPlugin(options: { iconSvg: string }): Plugin {
  return {
    name: "lexvm-singlefile-html",
    transformIndexHtml(html) {
      const stripped = html
        .replace(/[ \t]*<link rel="manifest"[^>]*>\n?/g, "")
        .replace(/[ \t]*<link rel="apple-touch-icon"[^>]*>\n?/g, "")
        .replace(/[ \t]*<link rel="icon"[^>]*>\n?/g, "");
      const svg = existsSync(options.iconSvg) ? readFileSync(options.iconSvg) : null;
      return {
        html: stripped,
        tags: svg
          ? [
              {
                tag: "link",
                attrs: {
                  rel: "icon",
                  type: "image/svg+xml",
                  href: `data:image/svg+xml;base64,${svg.toString("base64")}`,
                },
                injectTo: "head",
              },
            ]
          : [],
      };
    },
  };
}

function walk(dir: string, root = dir): BuiltFile[] {
  const out: BuiltFile[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, root));
    else out.push({ path: relative(root, path).replaceAll("\\", "/"), content: readFileSync(path) });
  }
  return out;
}

export function pwaPlugin(options: { swSource: string; offlineHtml: string; offlineName: string }): Plugin {
  let outDir = "";
  return {
    name: "lexvm-pwa",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        if (existsSync(options.offlineHtml)) {
          copyFileSync(options.offlineHtml, join(outDir, options.offlineName));
        } else {
          this.warn(`${options.offlineHtml} not found: run "vite build --mode singlefile" first (npm run build does)`);
        }
        const manifest = precacheManifest(walk(outDir));
        const source = readFileSync(options.swSource, "utf8");
        const { code } = await transformWithOxc(source, options.swSource, { lang: "ts" });
        writeFileSync(join(outDir, SW_FILE), renderServiceWorker(code, manifest));
        this.info(`${SW_FILE}: ${manifest.urls.length} files precached in cache ${manifest.cacheName}`);
      },
    },
  };
}

export function cspPlugin(options: { singlefile: boolean }): Plugin {
  let outDir = "";
  return {
    name: "lexvm-csp",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    // After generateBundle, where vite-plugin-singlefile inlines the bundle: the hashes cover the final code.
    writeBundle: {
      sequential: true,
      order: "pre",
      handler() {
        const file = join(outDir, "index.html");
        if (!existsSync(file)) {
          this.warn(`${file} not found: no Content-Security-Policy added`);
          return;
        }
        writeFileSync(file, withContentSecurityPolicy(readFileSync(file, "utf8"), options.singlefile));
      },
    },
  };
}
