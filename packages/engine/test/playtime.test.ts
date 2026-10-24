import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.ts";
import { textLimits } from "../src/analyze-text.ts";
import {
  BUDGET_DEFAULTS,
  budgetForMinutes,
  countWords,
  estimatePlaytime,
  PACING_BAND,
  PACING_READING_SHARE,
  PLAYTIME_DEFAULTS,
} from "../src/playtime.ts";
import type { Pack } from "../src/schema.ts";
import type { PlaytimeReport } from "../src/types.ts";
import { deepFreeze, loadFixture, loadLockedStudy, makePack } from "./fixtures/runtime/helpers.ts";

function codes(report: PlaytimeReport): string[] {
  return report.diagnostics.map((d) => d.code);
}

describe("countWords", () => {
  it("counts German words with umlauts and ß as one word each", () => {
    expect(countWords("Der Messingschlüssel liegt auf der Straße.")).toBe(6);
    expect(countWords("Größe, Übermut, Äpfel, Öl, Fuß")).toBe(5);
    expect(countWords("»Was willst du?«, fragt er.")).toBe(5);
  });

  it("treats decomposed umlauts like composed ones", () => {
    expect(countWords("Müller")).toBe(1);
    expect(countWords("Müller")).toBe(1);
  });

  it("keeps hyphenated words and contractions together", () => {
    expect(countWords("Das Hafen-Kontor ist well-known.")).toBe(4);
    expect(countWords("Don't panic, it’s fine.")).toBe(4);
    expect(countWords("a - b")).toBe(2);
    expect(countWords("dash—separated words")).toBe(3);
  });

  it("counts numbers as words", () => {
    expect(countWords("Hamburg, 1948.")).toBe(2);
    expect(countWords("3 of 3 points")).toBe(4);
    expect(countWords("version 1.0.1")).toBe(4);
  });

  it("ignores punctuation and whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  … — !? ")).toBe(0);
    expect(countWords("one\ntwo\n\nthree")).toBe(3);
  });
});

/** A small pack with exactly countable texts. */
function tinyPack(extra: Record<string, unknown> = {}): Pack {
  return makePack({
    language: "en",
    start: { room: "hall", intro: "Begin here." },
    rooms: {
      hall: {
        name: "Great Hall",
        description: "You see {lamp|an old brass lamp} here.",
        exits: { north: { to: "attic" } },
      },
      attic: {
        name: "Attic",
        description: [{ when: { flag: "dusted" }, text: "A clean attic." }, { text: "A dusty attic full of crates." }],
      },
    },
    flags: { dusted: false },
    objects: {
      lamp: {
        name: "lamp",
        location: "hall",
        description: [
          { when: { flag: "dusted" }, text: "It shines." },
          { text: "A lamp with a long, curved and rather ornate brass handle." },
        ],
      },
      crate: { name: "crate", location: "attic", description: "Just a crate." },
      ghost: { name: "ghost", location: "attic", npc: true, dialogue: "chat" },
    },
    rules: [
      {
        id: "rub",
        on: { verb: "use", object: "lamp" },
        // biome-ignore lint/suspicious/noThenProperty: pack data, not a thenable
        do: [{ if: { when: { flag: "dusted" }, then: [{ say: "Already shiny." }], else: [{ say: "You rub it." }] } }],
      },
      { id: "arrive", on: { event: "enter", room: "attic" }, do: [{ say: "Never counted." }] },
    ],
    dialogues: {
      chat: {
        with: "ghost",
        start: "hello",
        nodes: {
          hello: {
            say: "Boo.",
            options: [
              { id: "bye", text: "Goodbye, ghost." },
              { id: "ask", text: "Who are you?", goto: "who" },
            ],
          },
          who: { say: "Nobody at all.", options: [{ id: "back", text: "I see.", goto: "hello" }] },
        },
      },
    },
    endings: { won: { title: "The End", text: "You did it.", win: true } },
    walkthrough: ["look lamp", "go north", "talk ghost", "choose bye", "wait"],
    ...extra,
  });
}

describe("estimatePlaytime: counting", () => {
  it("counts the walkthrough output on rendered text, without echo and system lines", () => {
    const r = estimatePlaytime(tinyPack());
    // Start: "Begin here." 2, "Great Hall" 2, "You see an old brass lamp here." 7.
    // look lamp: default variant 11. go north: "Attic" 1, "A dusty attic full of crates." 6, enter rule "Never counted." 2.
    // talk ghost: "Boo." 1. choose bye: "Goodbye, ghost." 2. wait: "Time passes." 2.
    expect(r.words.path).toBe(2 + 2 + 7 + 11 + 1 + 6 + 2 + 1 + 2 + 2);
    expect(r.commands).toMatchObject({ path: 4, choices: 1 });
  });

  it("counts only unseen optional texts, each paragraph once, objects by their longest variant", () => {
    const r = estimatePlaytime(tinyPack());
    // Unseen: crate "Just a crate." 3; node who "Nobody at all." 3; options "Who are you?" 3 and "I see." 2;
    // rule says "Already shiny." 2 and "You rub it." 3; attic variant "A clean attic." 3.
    // The lamp's longest variant was shown by "look lamp"; "It shines." is a shorter variant and not counted.
    expect(r.words.optional).toBe(3 + 3 + 3 + 2 + 2 + 3 + 3);
    // crate has a description and was never examined; the lamp was.
    expect(r.commands.unseenLooks).toBe(1);
    // ask and back were never chosen; bye was.
    expect(r.commands.unchosenOptions).toBe(2);
    expect(r.commands.failedAttempts).toBe(4);
  });

  it("applies the formulas with the default parameters", () => {
    const r = estimatePlaytime(tinyPack());
    const { path, optional } = r.words;
    const { coverage: c, failedAttemptsPerCommand: f, secondsPerCommand: tc, secondsPerChoice: td } = PLAYTIME_DEFAULTS;
    const min = path / 230 + (4 * tc + 1 * td) / 60;
    const expected = min + (c * optional) / 230 + (c * 1 * tc + c * 2 * td + f * 4 * tc) / 60;
    expect(r.wordsPerMinute).toBe(230);
    expect(r.minutes.min).toBeCloseTo(min, 2);
    expect(r.minutes.expected).toBeCloseTo(expected, 2);
  });

  it("is deterministic and does not mutate the pack", () => {
    const pack = deepFreeze(tinyPack());
    expect(estimatePlaytime(pack)).toEqual(estimatePlaytime(pack));
  });
});

describe("estimatePlaytime: reference packs", () => {
  it("estimates packs/locked-study close to its seven-minute target", () => {
    const r = estimatePlaytime(loadLockedStudy());
    expect(r.language).toBe("en");
    expect(r.wordsPerMinute).toBe(230);
    expect(r.words.path).toBeGreaterThan(250);
    expect(r.words.path).toBeLessThan(400);
    expect(r.words.optional).toBeGreaterThan(50);
    expect(r.words.optional).toBeLessThan(250);
    expect(r.commands).toMatchObject({ path: 13, choices: 4, unchosenOptions: 0 });
    expect(r.minutes.min).toBeGreaterThan(3);
    expect(r.minutes.min).toBeLessThan(r.minutes.expected);
    expect(r.minutes.expected).toBeGreaterThan(6);
    expect(r.minutes.expected).toBeLessThan(8.5);
    expect(r.target).toBe(7);
    expect(Math.abs(r.deviation!)).toBeLessThanOrEqual(PLAYTIME_DEFAULTS.tolerance);
    expect(codes(r)).toEqual(["playtime.estimate"]);
    expect(r.diagnostics[0]!.message).toMatch(/^≈ \d+ min expected \(speedrun \d+ min\); target 7 min\. /);
  });

  it("estimates the German fixture with the German reading speed and suggests a playtime", () => {
    const r = estimatePlaytime(loadFixture("hafen.yaml"));
    expect(r.language).toBe("de");
    expect(r.wordsPerMinute).toBe(200);
    expect(r.words.path).toBeGreaterThan(40);
    expect(r.words.path).toBeLessThan(120);
    expect(r.commands).toMatchObject({ path: 5, choices: 3, unchosenOptions: 1 });
    expect(r.minutes.expected).toBeGreaterThan(1);
    expect(r.minutes.expected).toBeLessThan(4);
    expect(r.target).toBeNull();
    expect(r.deviation).toBeNull();
    expect(codes(r)).toEqual(["playtime.estimate", "playtime.no-target"]);
    const suggestion = Math.max(1, Math.round(r.minutes.expected));
    expect(r.diagnostics[1]!.message).toContain(`Suggest playtime: ${suggestion}`);
    expect(r.diagnostics.every((d) => d.path === "playtime")).toBe(true);
  });
});

describe("estimatePlaytime: target and tolerance", () => {
  const pack = loadLockedStudy();
  const expected = estimatePlaytime(pack).minutes.expected;

  it("warns only when the deviation exceeds the tolerance", () => {
    const at = (deviation: number) => estimatePlaytime(pack, { targetMinutes: expected / (1 + deviation) });
    expect(codes(at(0.24))).toEqual(["playtime.estimate"]);
    expect(codes(at(-0.24))).toEqual(["playtime.estimate"]);
    expect(codes(at(0.26))).toEqual(["playtime.estimate", "playtime.too-long"]);
    expect(codes(at(-0.26))).toEqual(["playtime.estimate", "playtime.too-short"]);
    expect(at(0.26).deviation).toBeCloseTo(0.26, 2);
    expect(codes(estimatePlaytime(pack, { targetMinutes: expected * 1.3, tolerance: 0.35 }))).toEqual([
      "playtime.estimate",
    ]);
  });

  it("gives concrete guidance in numbers", () => {
    const short = estimatePlaytime(pack, { targetMinutes: 30 }).diagnostics[1]!;
    expect(short).toMatchObject({ severity: "warning", code: "playtime.too-short", path: "playtime" });
    expect(short.message).toMatch(
      /≈ \d+ min short: add \d+(-\d+)? puzzles?, or ≈ \d+ walkthrough commands, or ≈ [\d,]+ words/,
    );
    expect(short.message).toContain("target of 30 min");
    // The target came from the options, so the pack's playtime is not the thing to change.
    expect(short.message).not.toContain("set playtime");
    const long = estimatePlaytime({ ...pack, playtime: 2 }).diagnostics[1]!;
    expect(long).toMatchObject({ severity: "warning", code: "playtime.too-long" });
    expect(long.message).toMatch(/≈ \d+ min too long: (trim ≈ [\d,]+ words or |cut )≈ \d+ commands/);
    expect(long.message).toMatch(/If the length is intended, set playtime: \d+\./);
  });

  it("uses the options for reading speed and timing", () => {
    expect(estimatePlaytime(pack, { wordsPerMinute: 100 }).wordsPerMinute).toBe(100);
    expect(estimatePlaytime({ ...pack, language: "fr" }).wordsPerMinute).toBe(220);
    expect(estimatePlaytime({ ...pack, language: "de-AT" }).wordsPerMinute).toBe(200);
    expect(estimatePlaytime({ ...pack, language: "fr" }, { readingSpeeds: { fr: 210 } }).wordsPerMinute).toBe(210);
    const slow = estimatePlaytime(pack, { secondsPerCommand: 20 });
    expect(slow.minutes.min).toBeGreaterThan(estimatePlaytime(pack).minutes.min);
    expect(() => estimatePlaytime(pack, { wordsPerMinute: 0 })).toThrow(RangeError);
    expect(() => estimatePlaytime(pack, { targetMinutes: -1 })).toThrow(RangeError);
  });

  it("measures a failing walkthrough up to its first failure, without length warnings", () => {
    const broken = { ...pack, playtime: 60, walkthrough: [...pack.walkthrough.slice(0, 5), "take nothing_here"] };
    const r = estimatePlaytime(broken);
    expect(codes(r)).toEqual(["playtime.estimate"]);
    expect(r.diagnostics[0]!.message).toContain("does not reach a winning ending");
    expect(r.commands.path + r.commands.choices).toBe(5);
  });
});

describe("budgetForMinutes", () => {
  it("grows monotonically with the target length", () => {
    for (const language of ["de", "en", "fr"]) {
      let previous = budgetForMinutes(5, language);
      for (let minutes = 10; minutes <= 120; minutes += 5) {
        const b = budgetForMinutes(minutes, language);
        expect(b.words.min).toBeLessThanOrEqual(b.words.max);
        expect(b.walkthroughSteps.min).toBeLessThanOrEqual(b.walkthroughSteps.max);
        expect(b.words.min).toBeGreaterThanOrEqual(previous.words.min);
        expect(b.words.max).toBeGreaterThanOrEqual(previous.words.max);
        expect(b.walkthroughSteps.min).toBeGreaterThanOrEqual(previous.walkthroughSteps.min);
        expect(b.walkthroughSteps.max).toBeGreaterThanOrEqual(previous.walkthroughSteps.max);
        previous = b;
      }
    }
  });

  it("asks German packs for fewer words than English ones (slower reading)", () => {
    const de = budgetForMinutes(30, "de");
    const en = budgetForMinutes(30, "en");
    expect(de.words.max).toBeLessThan(en.words.max);
    expect(de.walkthroughSteps.max).toBeLessThanOrEqual(en.walkthroughSteps.max);
    expect(en.notes.length).toBeGreaterThanOrEqual(3);
    expect(en.notes.join(" ")).toContain(`${en.walkthroughSteps.min}–${en.walkthroughSteps.max} steps`);
    expect(() => budgetForMinutes(0, "en")).toThrow(RangeError);
  });

  /**
   * A pack built to the budget under the model's assumptions (the ratios of
   * BUDGET_DEFAULTS): a hub room with scenery, a dialogue chain, then a
   * corridor of rooms; the last room's enter rule wins the game.
   */
  function packFromBudget(language: string, steps: number, words: number): Pack {
    const q = BUDGET_DEFAULTS;
    let token = 0;
    const text = (n: number) =>
      Array.from({ length: Math.max(1, Math.round(n)) }, () => `w${(token++).toString(36)}`).join(" ");
    const choices = Math.max(1, Math.round(steps * q.choiceShare));
    const commands = Math.max(2, steps - choices);
    const pathWords = words / (1 + q.optionalWordRatio);
    const optionalWords = words - pathWords;
    const rooms: Record<string, unknown> = {};
    const roomCount = commands; // talk in room 0, then commands - 1 moves
    // Fixed path text: room titles (2 words), option texts (2), the ending (title 1 + text 2).
    const fixed = roomCount * 2 + choices * 2 + 3;
    const perUnit = Math.max(1, (pathWords - fixed) / (roomCount + choices));
    for (let i = 0; i < roomCount; i++) {
      rooms[`r${i}`] = {
        name: `Room ${i}`,
        description: text(perUnit),
        exits: i + 1 < roomCount ? { east: { to: `r${i + 1}` } } : {},
      };
    }
    const unseen = Math.round(q.unseenLooksPerCommand * commands);
    const unchosen = Math.round(q.unchosenOptionsPerChoice * choices);
    const objects: Record<string, unknown> = { npc: { name: "npc", location: "r0", npc: true, dialogue: "d" } };
    const perObject = (optionalWords - unchosen * 2) / Math.max(1, unseen);
    for (let i = 0; i < unseen; i++) objects[`o${i}`] = { name: `o${i}`, location: "r0", description: text(perObject) };
    const nodes: Record<string, unknown> = {};
    for (let i = 0; i < choices; i++) {
      const options: unknown[] = [{ id: `next${i}`, text: text(2), ...(i + 1 < choices ? { goto: `n${i + 1}` } : {}) }];
      if (i < unchosen) options.push({ id: `alt${i}`, text: text(2) });
      nodes[`n${i}`] = { say: text(perUnit), options };
    }
    const walkthrough = [
      "talk npc",
      ...Array.from({ length: choices }, (_, i) => `choose next${i}`),
      ...Array.from({ length: roomCount - 1 }, () => "go east"),
    ];
    return makePack({
      language,
      start: { room: "r0" },
      rooms,
      objects,
      dialogues: { d: { with: "npc", start: "n0", nodes } },
      rules: [{ on: { event: "enter", room: `r${roomCount - 1}` }, do: [{ end: "won" }] }],
      endings: { won: { title: "End", text: text(2), win: true } },
      walkthrough,
    });
  }

  it("round-trips: a pack built to the budget lands within the tolerance", () => {
    for (const language of ["de", "en"]) {
      for (const minutes of [15, 30, 60]) {
        const b = budgetForMinutes(minutes, language);
        const mid = (r: { min: number; max: number }) => (r.min + r.max) / 2;
        const corners: Array<[number, number]> = [
          [mid(b.walkthroughSteps), mid(b.words)],
          [b.walkthroughSteps.min, b.words.min],
          [b.walkthroughSteps.max, b.words.max],
        ];
        for (const [steps, words] of corners) {
          const pack = packFromBudget(language, Math.round(steps), words);
          const r = estimatePlaytime(pack, { targetMinutes: minutes });
          const label = `${language} ${minutes} min, ${Math.round(steps)} steps, ${Math.round(words)} words`;
          expect(r.words.path + r.words.optional, label).toBeGreaterThan(words * 0.9);
          expect(r.words.path + r.words.optional, label).toBeLessThan(words * 1.1);
          expect(Math.abs(r.deviation!), label).toBeLessThanOrEqual(PLAYTIME_DEFAULTS.tolerance);
          expect(codes(r), label).toEqual(["playtime.estimate"]);
        }
      }
    }
  });
});

describe("pacing", () => {
  const mid = (r: { min: number; max: number }) => (r.min + r.max) / 2;

  it("sizes the budget by the reading share: narrative packs get more words and fewer steps", () => {
    for (const language of ["de", "en"]) {
      const puzzle = budgetForMinutes(45, language, { pacing: "puzzle" });
      const balanced = budgetForMinutes(45, language);
      const narrative = budgetForMinutes(45, language, { pacing: "narrative" });
      expect(mid(narrative.words)).toBeGreaterThan(mid(balanced.words));
      expect(mid(balanced.words)).toBeGreaterThan(mid(puzzle.words));
      expect(mid(narrative.walkthroughSteps)).toBeLessThan(mid(balanced.walkthroughSteps));
      expect(mid(balanced.walkthroughSteps)).toBeLessThan(mid(puzzle.walkthroughSteps));
      expect(narrative.notes[0]).toContain("60% of it reading (pacing narrative)");
    }
    // Words scale with the reading share: twice the share, twice the words.
    const a = budgetForMinutes(60, "de", { readingShare: 0.3 });
    const b = budgetForMinutes(60, "de", { readingShare: 0.6 });
    expect(mid(b.words) / mid(a.words)).toBeCloseTo(2, 1);
    expect(() => budgetForMinutes(30, "de", { readingShare: 1 })).toThrow(RangeError);
  });

  it("reports the reading share and warns only when a declared pacing is missed", () => {
    const plain = estimatePlaytime(loadLockedStudy());
    expect(plain.pacing).toBeNull();
    expect(plain.readingShare).toBeGreaterThan(0.1);
    expect(plain.readingShare).toBeLessThan(0.4);
    expect(plain.minutes.reading).toBeCloseTo(plain.readingShare * plain.minutes.expected, 1);
    expect(plain.diagnostics[0]!.message).toMatch(/reading \d+% of the expected time\./);
    expect(codes(plain)).toEqual(["playtime.estimate"]);

    const narrative = estimatePlaytime({ ...loadLockedStudy(), pacing: "narrative" });
    expect(narrative.readingShare).toBeLessThan(PACING_READING_SHARE.narrative - PACING_BAND);
    const warning = narrative.diagnostics.find((d) => d.code === "playtime.pacing");
    expect(warning).toMatchObject({ severity: "warning", path: "pacing" });
    expect(warning!.message).toContain("Write out the scenes");
    expect(narrative.diagnostics[0]!.message).toContain("(pacing narrative: target 60%)");

    const puzzle = estimatePlaytime({ ...loadLockedStudy(), pacing: "puzzle" });
    expect(codes(puzzle)).not.toContain("playtime.pacing");
  });

  it("suggests scene prose first when a narrative pack is too short", () => {
    const r = estimatePlaytime({ ...loadLockedStudy(), pacing: "narrative" }, { targetMinutes: 20 });
    const short = r.diagnostics.find((d) => d.code === "playtime.too-short");
    expect(short!.message).toMatch(/min short: add ≈ [\d,]+ words of scene prose along the walkthrough/);
    const balanced = estimatePlaytime(loadLockedStudy(), { targetMinutes: 20 });
    expect(balanced.diagnostics.find((d) => d.code === "playtime.too-short")!.message).toMatch(/min short: add \d/);
  });

  it("gives narrative packs longer text budgets, but not longer buttons", () => {
    expect(textLimits("narrative").dialogueSay).toBeGreaterThan(textLimits(undefined).dialogueSay);
    expect(textLimits("narrative").roomDescription).toBeGreaterThan(textLimits("balanced").roomDescription);
    expect(textLimits("narrative").optionText).toBe(textLimits("puzzle").optionText);
    expect(textLimits("narrative").name).toBe(textLimits("puzzle").name);
    const long = (pacing: "narrative" | undefined) => {
      const pack = { ...loadLockedStudy(), pacing };
      const object = Object.values(pack.objects).find((o) => o.description !== undefined)!;
      object.description = "y".repeat(500);
      return analyze(pack).filter((d) => d.code === "text.too-long").length;
    };
    expect(long(undefined)).toBe(1);
    expect(long("narrative")).toBe(0);
  });
});
