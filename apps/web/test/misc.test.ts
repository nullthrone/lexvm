import { describe, expect, it } from "vitest";
import { parseRoute, routeHash } from "../src/logic/routes.ts";
import { blockText, disambiguate, formatBytes, stripMarkup } from "../src/logic/text.ts";
import { DEFAULT_SETTINGS, parseSettings, resolveTheme } from "../src/services/settings.ts";

describe("routes", () => {
  it.each([
    ["", { name: "library" }],
    ["#/", { name: "library" }],
    ["#/settings", { name: "settings" }],
    ["#/about/", { name: "about" }],
    ["#/create", { name: "create" }],
    ["#/play/builtin/locked-study", { name: "play", key: "builtin:locked-study", fresh: false }],
    ["#/play/imported/my-pack/new", { name: "play", key: "imported:my-pack", fresh: true }],
    ["#/play/remote/x", { name: "library" }],
    ["#/play/builtin/Bad_Id", { name: "library" }],
    ["#/nonsense", { name: "library" }],
  ])("%s", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it("round-trips", () => {
    for (const hash of ["#/", "#/settings", "#/play/builtin/locked-study", "#/play/imported/x-y/new"]) {
      expect(routeHash(parseRoute(hash))).toBe(hash);
    }
  });
});

describe("text helpers", () => {
  it("strips inline markup", () => {
    const names: Record<string, string> = { red_book: "red book" };
    expect(stripMarkup("Pull the {red_book}.", (id) => names[id])).toBe("Pull the red book.");
    expect(stripMarkup("Read {logbook|des Logbuchs}!", () => undefined)).toBe("Read des Logbuchs!");
    expect(stripMarkup("{unknown_id} and {not markup}", () => undefined)).toBe("unknown_id and {not markup}");
  });

  it("joins spans", () => {
    expect(blockText({ kind: "text", spans: [{ text: "A " }, { text: "key", ref: "key" }, { text: "." }] })).toBe(
      "A key.",
    );
  });

  it("rewrites ambiguous input to name one candidate", () => {
    expect(disambiguate("take book", "red book")).toBe("take red book");
    expect(disambiguate("take red book", "red book")).toBe("take red book");
    expect(disambiguate("use key with door", "brass key")).toBe("use brass key with door");
    expect(disambiguate("take lamp", "red book")).toBeNull();
  });

  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

describe("settings", () => {
  it("parses stored settings defensively", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{broken")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ theme: "dark", textSize: 4, language: "de", haptics: false }))).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "dark",
      textSize: 4,
      language: "de",
      haptics: false,
    });
    expect(parseSettings(JSON.stringify({ theme: "neon", textSize: 9, language: "fr" }))).toEqual(DEFAULT_SETTINGS);
  });

  it("resolves the system theme to sepia or dark", () => {
    expect(resolveTheme("system", false)).toBe("sepia");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});
