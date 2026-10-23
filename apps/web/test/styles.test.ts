/** Static checks on the source: theme contrast (WCAG AA) and no HTML injection APIs. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));

function themes(): Record<string, Record<string, string>> {
  const css = readFileSync(join(srcDir, "styles/tokens.css"), "utf8");
  const out: Record<string, Record<string, string>> = {};
  for (const m of css.matchAll(/:root(?:\[data-theme="(\w+)"\])?\s*\{([^}]*)\}/g)) {
    const vars: Record<string, string> = {};
    for (const v of (m[2] ?? "").matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)) vars[v[1] ?? ""] = v[2] ?? "";
    if (Object.keys(vars).length === 0) continue;
    const name = m[1] ?? "sepia";
    out[name] = { ...(out[name] ?? {}), ...vars };
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const PAIRS: Array<[string, string]> = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "raised"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "raised"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent", "raised"],
  ["accent-ink", "accent"],
  ["danger", "surface"],
  ["ok", "bg"],
  ["warning", "surface"],
];

describe("theme tokens", () => {
  const all = themes();

  it("define the three themes", () => {
    expect(Object.keys(all).sort()).toEqual(["dark", "light", "sepia"]);
  });

  for (const [theme, vars] of Object.entries(all)) {
    it(`${theme}: text colours meet WCAG AA (4.5:1)`, () => {
      for (const [fg, bg] of PAIRS) {
        const a = vars[fg];
        const b = vars[bg];
        expect(a && b, `${theme} defines --${fg} and --${bg}`).toBeTruthy();
        expect(contrast(a ?? "", b ?? ""), `${theme} --${fg} on --${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("no HTML injection", () => {
  it("src never uses an HTML or script sink", () => {
    // HTML parsing (innerHTML & co., also as el["innerHTML"]), document.write/writeln, iframe srcdoc, script
    // URLs and eval. The Content-Security-Policy with Trusted Types blocks most of these at run time as well.
    const sinks = new RegExp(
      [
        String.raw`\.(innerHTML|outerHTML|insertAdjacentHTML)\b`,
        String.raw`\[\s*["'\x60](innerHTML|outerHTML|srcdoc)["'\x60]\s*\]`,
        String.raw`document\.write(ln)?\(`,
        "(set|parse)HTMLUnsafe",
        "createContextualFragment",
        "DOMParser",
        String.raw`\bsrcdoc\b`,
        String.raw`\.src\s*=`,
        String.raw`\beval\(`,
        String.raw`\bnew Function\(`,
      ].join("|"),
    );
    const offenders = sourceFiles(srcDir).filter((file) => sinks.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
    expect(sinks.test('el["innerHTML"] = x')).toBe(true);
    expect(sinks.test("document.writeln(x)")).toBe(true);
    expect(sinks.test("frame.srcdoc = x")).toBe(true);
    expect(sinks.test("script.src = url")).toBe(true);
    expect(sinks.test("el.textContent = x")).toBe(false);
  });
});
