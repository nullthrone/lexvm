import { describe, expect, it } from "vitest";
import { exploreWith } from "../src/explore.ts";
import { indexPack } from "../src/pack-index.ts";
import { relevantState } from "../src/relevance.ts";
import type { Pack } from "../src/schema.ts";
import type { ExploreReport } from "../src/types.ts";
import { loadFixture, loadLockedStudy, makePack } from "./fixtures/runtime/helpers.ts";

const rel = (pack: Pack) => relevantState(pack, indexPack(pack));

/** A cell with a door whose only key can be destroyed: the base for packs that hide a dead end. */
function cell(
  extra: { flags?: Record<string, boolean>; rules?: unknown[]; objects?: Record<string, unknown> } & Record<
    string,
    unknown
  >,
) {
  const { flags, rules, objects, ...rest } = extra;
  return makePack({
    start: { room: "cell" },
    flags: { studied: false, ...flags },
    rooms: {
      cell: {
        name: "Cell",
        description: "A cell with a {painting} and a {door}.",
        exits: { out: { to: "yard", door: "door", blocked: "Shut." } },
      },
      yard: { name: "Yard", description: "Free." },
    },
    objects: {
      painting: { name: "painting", location: "cell" },
      key: { name: "key", location: "cell", portable: true },
      door: { name: "door", location: "cell", openable: true, locked: true, unlockedBy: "key" },
      ...objects,
    },
    rules: [...(rules ?? []), { id: "escape", on: { event: "enter", room: "yard" }, do: { end: "won" } }],
    ...rest,
  });
}

const destroyKey = { move: { object: "key", to: "nowhere" } };

/** The verdicts that the reduction must not change. */
function verdict(r: ExploreReport) {
  return {
    complete: r.complete,
    winnable: r.winnable,
    shortestWin: r.shortestWin?.length ?? null,
    deadEnds: r.deadEnds.length > 0,
    losing: r.losingEndings.map((l) => l.ending).sort(),
    unreached: r.unreached,
    errors: [...new Set(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code))].sort(),
  };
}

function sameVerdict(pack: Pack): ExploreReport {
  const reduced = exploreWith(pack, {}, true);
  const full = exploreWith(pack, {}, false);
  expect(verdict(reduced)).toEqual(verdict(full));
  expect(reduced.states).toBeLessThanOrEqual(full.states);
  return reduced;
}

describe("relevance analysis", () => {
  it("ignores flags that only text variants, hints or inert rules read", () => {
    const pack = cell({
      flags: { noticed: false, mood: false },
      hints: [{ id: "h", when: { flag: "mood" }, until: { flag: "noticed" }, steps: ["Look."] }],
      rules: [
        // First-time examine text: inert rule, inert default, no competitor.
        { on: { verb: "look", object: "painting" }, when: { not: { flag: "studied" } }, do: [{ set: "studied" }] },
        { on: { verb: "look", object: "door" }, do: [{ say: "Oak." }, { set: "noticed" }] },
      ],
    });
    expect(rel(pack).flags).toEqual(new Set());
  });

  it("keeps flags that decide between an inert rule and a state change", () => {
    const later = cell({
      rules: [
        { on: { verb: "look", object: "painting" }, when: { not: { flag: "studied" } }, do: [{ set: "studied" }] },
        { on: { verb: "look", object: "painting" }, do: [destroyKey] },
      ],
    });
    expect(rel(later).flags).toEqual(new Set(["studied"]));
    const viaIf = cell({
      rules: [
        {
          on: { verb: "look", object: "painting" },
          // biome-ignore lint/suspicious/noThenProperty: 'then' is a pack data key, not a thenable
          do: { if: { when: { flag: "studied" }, then: [destroyKey], else: [{ set: "studied" }] } },
        },
      ],
    });
    expect(rel(viaIf).flags).toEqual(new Set(["studied"]));
    const viaExit = cell({
      rooms: {
        cell: { name: "Cell", description: "A {painting}.", exits: { out: { to: "yard", when: { flag: "studied" } } } },
        yard: { name: "Yard", description: "Free." },
      },
      rules: [{ on: { verb: "look", object: "painting" }, do: [{ set: "studied" }] }],
    });
    expect(rel(viaExit).flags).toEqual(new Set(["studied"]));
  });

  it("follows chains of flags to a state change", () => {
    const pack = cell({
      flags: { a: false, b: false },
      rules: [
        { on: { verb: "push", object: "painting" }, when: { not: { flag: "a" } }, do: { set: "a" } },
        { on: { verb: "pull", object: "painting" }, when: { flag: "a" }, do: { set: "b" } },
        { on: { event: "turn" }, when: { flag: "b" }, do: destroyKey },
      ],
    });
    expect(rel(pack).flags).toEqual(new Set(["a", "b"]));
  });

  it("ignores once-topics that return to the node, unless the node could run empty or the answer matters", () => {
    const talk = (
      options: unknown[],
      answer: unknown = { say: "Hm.", options: [{ id: "back", text: "OK.", goto: "hi" }] },
    ) =>
      cell({
        objects: { guard: { name: "guard", location: "cell", npc: true, dialogue: "d" } },
        dialogues: { d: { start: "hi", nodes: { hi: { say: "Yes?", options }, answer } } },
      });
    const bye = { id: "bye", text: "Bye." };
    const topic = { id: "weather", text: "Weather?", once: true, goto: "answer" };
    expect(rel(talk([topic, bye])).chosen).toEqual(new Set());
    // Without an always available option the node empties after the topic: that ends the dialogue.
    expect(rel(talk([topic])).chosen).toEqual(new Set(["d.weather"]));
    // An answer that changes the state makes the topic relevant.
    const learning = { say: "Hm.", do: destroyKey, options: [{ id: "back", text: "OK.", goto: "hi" }] };
    expect(rel(talk([topic, bye], learning)).chosen).toEqual(new Set(["d.weather"]));
  });
});

describe("explore with and without the reduction", () => {
  it("agrees on the fixtures", () => {
    for (const pack of [
      loadLockedStudy(),
      loadFixture("hafen.yaml"),
      loadFixture("dead-end.yaml"),
      loadFixture("losing-ending.yaml"),
    ]) {
      sameVerdict(pack);
    }
  });

  it("finds a dead end behind a first-time flag with a destructive second rule", () => {
    const report = sameVerdict(
      cell({
        rules: [
          { on: { verb: "look", object: "painting" }, when: { not: { flag: "studied" } }, do: [{ set: "studied" }] },
          { on: { verb: "look", object: "painting" }, when: { not: { has: "key" } }, do: [destroyKey] },
        ],
      }),
    );
    expect(report.deadEnds.length).toBeGreaterThan(0);
  });

  it("finds a dead end that a turn rule causes after a flavour-looking flag", () => {
    const report = sameVerdict(
      cell({
        flags: { alarm: false },
        rules: [
          { on: { verb: "look", object: "painting" }, do: [{ say: "Click." }, { set: "alarm" }] },
          { on: { event: "turn" }, when: [{ flag: "alarm" }, { not: { has: "key" } }], do: destroyKey },
        ],
      }),
    );
    expect(report.deadEnds.length).toBeGreaterThan(0);
  });

  it("agrees when topics empty a node and end the dialogue", () => {
    sameVerdict(
      cell({
        objects: { guard: { name: "guard", location: "cell", npc: true, dialogue: "d" } },
        dialogues: {
          d: {
            start: "hi",
            nodes: {
              hi: {
                say: "Yes?",
                options: [
                  { id: "a", text: "A?", once: true, goto: "hi" },
                  { id: "b", text: "B?", once: true, goto: "hi" },
                ],
              },
            },
          },
        },
      }),
    );
  });

  it("does not report inert rules gated by merged state as unreached", () => {
    const report = sameVerdict(
      cell({
        rules: [
          { on: { verb: "look", object: "painting" }, when: { not: { flag: "studied" } }, do: [{ set: "studied" }] },
          { id: "again", on: { verb: "look", object: "painting" }, do: { say: "Seen it." } },
        ],
      }),
    );
    expect(report.unreached.rules).toEqual([]);
  });

  it("merges flavour state: fewer states, same verdict", () => {
    const pack = cell({
      flags: { f1: false, f2: false, f3: false, f4: false },
      objects: {
        a: { name: "a", location: "cell" },
        b: { name: "b", location: "cell" },
        c: { name: "c", location: "cell" },
        d: { name: "d", location: "cell" },
      },
      rules: ["a", "b", "c", "d"].map((o, i) => ({
        on: { verb: "look", object: o },
        when: { not: { flag: `f${i + 1}` } },
        do: [{ say: "Interesting." }, { set: `f${i + 1}` }],
      })),
    });
    const reduced = sameVerdict(pack);
    expect(exploreWith(pack, {}, false).states).toBeGreaterThanOrEqual(reduced.states * 16);
  });
});
