import { describe, expect, it } from "vitest";
import { cardMinutes, isSafeRelativePath, parseCatalog } from "../src/logic/catalog.ts";

const entry = {
  id: "locked-study",
  title: "The Locked Study",
  subtitle: "A five-minute LexVM demo",
  description: "Your uncle has vanished.",
  language: "en",
  version: "1.0.0",
  playtime: 5,
  estimatedMinutes: 6,
  author: "LexVM contributors",
  license: "CC0-1.0",
  file: "locked-study.lexpack.json",
  hash: "daf402a710608391",
  size: 6208,
};

describe("parseCatalog", () => {
  it("accepts a valid catalog", () => {
    const result = parseCatalog({ format: "lexvm-catalog/1", packs: [entry] });
    expect(result).toEqual({ ok: true, entries: [entry], skipped: 0 });
  });

  it("rejects other formats and shapes", () => {
    expect(parseCatalog(null).ok).toBe(false);
    expect(parseCatalog([]).ok).toBe(false);
    expect(parseCatalog({ format: "lexvm-catalog/2", packs: [] }).ok).toBe(false);
    expect(parseCatalog({ format: "lexvm-catalog/1", packs: {} }).ok).toBe(false);
  });

  it("skips invalid and duplicate entries", () => {
    const result = parseCatalog({
      format: "lexvm-catalog/1",
      packs: [
        entry,
        { ...entry },
        { ...entry, id: "Bad Id" },
        { ...entry, id: "evil", file: "../secret.json" },
        { ...entry, id: "remote", file: "https://example.com/x.json" },
        { ...entry, id: "no-title", title: "" },
        "nonsense",
      ],
    });
    expect(result.ok && result.entries.map((e) => e.id)).toEqual(["locked-study"]);
    expect(result.ok && result.skipped).toBe(6);
  });

  it("fills defaults for optional fields and drops invalid ones", () => {
    const result = parseCatalog({
      format: "lexvm-catalog/1",
      packs: [
        { id: "x", title: "X", file: "x.lexpack.json", playtime: -3, estimatedMinutes: 2.5, language: "not a tag" },
      ],
    });
    expect(result.ok && result.entries[0]).toEqual({
      id: "x",
      title: "X",
      description: "",
      language: "und",
      version: "0.0.0",
      author: "",
      license: "",
      file: "x.lexpack.json",
      hash: "",
    });
  });
});

describe("cardMinutes", () => {
  it("shows the pack's playtime, else the estimate", () => {
    expect(cardMinutes({ playtime: 5, estimatedMinutes: 6 })).toBe(5);
    expect(cardMinutes({ estimatedMinutes: 6 })).toBe(6);
    expect(cardMinutes({})).toBeUndefined();
  });
});

describe("isSafeRelativePath", () => {
  it.each([
    ["locked-study.lexpack.json", true],
    ["sub/dir/pack.json", true],
    ["../x.json", false],
    ["/abs.json", false],
    ["a/../b.json", false],
    ["https://x/y.json", false],
    ["a\\b.json", false],
    ["x.json?y", false],
    ["", false],
  ])("%s -> %s", (path, expected) => {
    expect(isSafeRelativePath(path)).toBe(expected);
  });
});
