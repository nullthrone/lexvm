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
import { builtinPacksPlugin, pwaPlugin, singlefileHtmlPlugin } from "./build/plugins.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const pkg = JSON.parse(readFileSync(here("./package.json"), "utf8")) as { version: string };

const OFFLINE_DIR = "dist-offline";
const OFFLINE_NAME = "lexvm-offline.html";
const ENGINE_SRC = here("../../packages/engine/src/");

/** The engine is pure; marking it side-effect free lets the bundler drop unused modules (the compiler and YAML). */
const isEngineModule = (id: string) => id.replaceAll("\\", "/").startsWith(ENGINE_SRC.replaceAll("\\", "/"));

export default defineConfig(({ mode }) => {
  const singlefile = mode === "singlefile";
  return {
    base: "./",
    publicDir: singlefile ? false : "public",
    define: {
      __LEXVM_VERSION__: JSON.stringify(pkg.version),
      __LEXVM_SINGLEFILE__: JSON.stringify(singlefile),
    },
    resolve: {
      // The compiler is imported dynamically from its own module so YAML stays out of the main chunk.
      alias: [{ find: /^@lexvm\/engine\/compile$/, replacement: `${ENGINE_SRC}compile.ts` }],
    },
    build: {
      outDir: singlefile ? OFFLINE_DIR : "dist",
      emptyOutDir: true,
      sourcemap: false,
      rolldownOptions: {
        treeshake: { moduleSideEffects: (id: string) => !isEngineModule(id) },
      },
    },
    plugins: [
      builtinPacksPlugin({ inline: singlefile, packsDir: here("./public/packs") }),
      ...(singlefile
        ? [singlefileHtmlPlugin({ iconSvg: here("./public/icons/icon.svg") }), viteSingleFile()]
        : [
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
