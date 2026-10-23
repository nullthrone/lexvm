/**
 * Two builds from one config:
 * - default:            dist/ — the PWA for GitHub Pages (service worker, manifest, fetched packs).
 * - --mode singlefile:  dist-offline/index.html — one self-contained HTML file with JS, CSS and the
 *                       built-in packs inlined, no service worker; copied to dist/lexvm-offline.html.
 *
 * `npm run build` runs the single-file build first so the main build can include it in the precache list.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { builtinPacksPlugin, cspPlugin, pwaPlugin, singlefileHtmlPlugin } from "./build/plugins.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const pkg = JSON.parse(readFileSync(here("./package.json"), "utf8")) as { version: string };

const OFFLINE_DIR = "dist-offline";
const OFFLINE_NAME = "lexvm-offline.html";

export default defineConfig(({ mode }) => {
  const singlefile = mode === "singlefile";
  return {
    base: "./",
    publicDir: singlefile ? false : "public",
    define: {
      __LEXVM_VERSION__: JSON.stringify(pkg.version),
      __LEXVM_SINGLEFILE__: JSON.stringify(singlefile),
    },
    // The compiler (and with it the YAML parser) is imported dynamically from "@lexvm/engine/compile", a
    // subpath export of the engine, so it lands in its own chunk. The engine's package.json declares
    // "sideEffects": false, so the main chunk keeps only the engine modules it uses.
    build: {
      outDir: singlefile ? OFFLINE_DIR : "dist",
      emptyOutDir: true,
      sourcemap: false,
    },
    plugins: [
      builtinPacksPlugin({ inline: singlefile, packsDir: here("./public/packs") }),
      ...(singlefile
        ? [
            singlefileHtmlPlugin({ iconSvg: here("./public/icons/icon.svg") }),
            viteSingleFile(),
            cspPlugin({ singlefile }),
          ]
        : [
            cspPlugin({ singlefile }),
            pwaPlugin({
              swSource: here("./src/sw.ts"),
              offlineHtml: here(`./${OFFLINE_DIR}/index.html`),
              offlineName: OFFLINE_NAME,
            }),
          ]),
    ],
    server: {
      // prompts/oneshot.md lives at the repository root.
      fs: { allow: [here("../..")] },
    },
    preview: { port: 4173, strictPort: true },
  };
});
