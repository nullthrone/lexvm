import { afterEach, describe, expect, it } from "vitest";
import { detectLanguage, LANGS, placeholders, STRINGS, setLanguage, t } from "../src/i18n.ts";

describe("i18n string tables", () => {
  const keys = (lang: "de" | "en") => Object.keys(STRINGS[lang]).sort();

  it("de and en have exactly the same keys", () => {
    expect(keys("en")).toEqual(keys("de"));
  });

  it("no string is empty", () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe("");
      }
    }
  });

  it("translations use the same placeholders", () => {
    for (const key of keys("de")) {
      const k = key as keyof (typeof STRINGS)["de"];
      expect(placeholders(STRINGS.en[k]), key).toEqual(placeholders(STRINGS.de[k]));
    }
  });
});

describe("t()", () => {
  afterEach(() => setLanguage("en"));

  it("fills placeholders and keeps unknown ones", () => {
    setLanguage("de");
    expect(t("game.score", { value: 2, max: 3 })).toBe("Punkte: 2 von 3");
    setLanguage("en");
    expect(t("game.score", { value: 2 })).toBe("Score: 2 of {max}");
  });
});

describe("detectLanguage", () => {
  it("picks the first supported language", () => {
    expect(detectLanguage(["de-AT", "en"])).toBe("de");
    expect(detectLanguage(["fr-FR", "en-GB", "de"])).toBe("en");
    expect(detectLanguage(["fr"])).toBe("en");
    expect(detectLanguage(undefined)).toBe("en");
  });
});
