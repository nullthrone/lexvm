import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.ts";
import { type PackInput, PackSchema } from "../src/schema.ts";
import type { Diagnostic } from "../src/types.ts";
import { basePack } from "./fixtures/compile/base-pack.ts";

function diagnose(mutate: (p: PackInput) => void = () => {}): Diagnostic[] {
  const p = basePack();
  mutate(p);
  return analyze(PackSchema.parse(p));
}

function codes(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

function find(diagnostics: Diagnostic[], code: string): Diagnostic {
  const d = diagnostics.find((x) => x.code === code);
  if (d === undefined) throw new Error(`expected ${code}, got: ${JSON.stringify(diagnostics, null, 2)}`);
  return d;
}

describe("analyze: base fixture", () => {
  it("reports nothing for a clean pack", () => {
    expect(diagnose()).toEqual([]);
  });
});

type Case = [code: string, severity: Diagnostic["severity"], path: string, mutate: (p: PackInput) => void];

const ERRORS: Case[] = [
  [
    "ref.unknown-room",
    "error",
    "start.room",
    (p) => {
      p.start.room = "hal";
    },
  ],
  [
    "ref.unknown-room",
    "error",
    "rooms.hall.exits.north.to",
    (p) => {
      p.rooms.hall!.exits!.north!.to = "garden";
    },
  ],
  [
    "ref.unknown-object",
    "error",
    "rules[3].when[1].has",
    (p) => {
      (p.rules![3]!.when as object[])[1] = { has: "clue_nope" };
    },
  ],
  [
    "ref.unknown-object",
    "error",
    "objects.door.unlockedBy",
    (p) => {
      p.objects!.door!.unlockedBy = "keyy";
    },
  ],
  [
    "ref.unknown-flag",
    "error",
    "rules[0].do[0].set",
    (p) => {
      (p.rules![0]!.do as object[])[0] = { set: "lamp_on" };
    },
  ],
  [
    "ref.unknown-counter",
    "error",
    "rules[2].when[0].counter.name",
    (p) => {
      p.rules![2]!.when = { counter: { name: "knock", lt: 3 } };
    },
  ],
  [
    "ref.unknown-verb",
    "error",
    "rules[0].on.verb",
    (p) => {
      p.rules![0]!.on = { verb: "light", object: "lamp" };
    },
  ],
  [
    "ref.unknown-verb",
    "error",
    "objects.note.verbs[0]",
    (p) => {
      p.objects!.note!.verbs = ["peruse"];
    },
  ],
  [
    "ref.unknown-dialogue",
    "error",
    "objects.butler.dialogue",
    (p) => {
      p.objects!.butler!.dialogue = "talk";
    },
  ],
  [
    "ref.unknown-node",
    "error",
    "dialogues.chat.start",
    (p) => {
      p.dialogues!.chat!.start = "hi";
    },
  ],
  [
    "ref.unknown-ending",
    "error",
    "rules[3].do[1].end",
    (p) => {
      (p.rules![3]!.do as object[])[1] = { end: "finish" };
    },
  ],
  [
    "ref.unknown-location",
    "error",
    "objects.lamp.location",
    (p) => {
      p.objects!.lamp!.location = "garden";
    },
  ],
  [
    "ref.not-a-container",
    "error",
    "objects.key.location",
    (p) => {
      p.objects!.key!.location = "lamp";
    },
  ],
  [
    "ref.unknown-exit",
    "error",
    "rules[0].on.object",
    (p) => {
      p.rules![0]!.on = { verb: "go", object: "west" };
    },
  ],
  [
    "ref.unknown-object",
    "error",
    "rooms.hall.description[0].when[0].here",
    (p) => {
      p.rooms.hall!.description = [{ when: { here: "ghost" }, text: "Spooky {box}." }, { text: "A {box}." }];
    },
  ],
  [
    "ref.unknown-flag",
    "error",
    "rules[1].do[1].if.then[0].clear",
    (p) => {
      p.rules![1]!.do = [
        { learn: "clue_note" },
        // biome-ignore lint/suspicious/noThenProperty: 'then' is a pack data key, not a thenable
        { if: { when: { flag: "lamp_lit" }, then: [{ clear: "nope" }] } },
      ];
    },
  ],
  [
    "ref.unknown-room",
    "error",
    "hints[0].when[0].visited",
    (p) => {
      p.hints![0]!.when = { visited: "attic" };
    },
  ],
  [
    "id.reserved",
    "error",
    "objects.inventory",
    (p) => {
      p.objects!.inventory = { name: "bag", location: "hall", portable: true };
    },
  ],
  [
    "id.collision",
    "error",
    "objects.study",
    (p) => {
      p.objects!.study = { name: "study", location: "hall", portable: true };
    },
  ],
  [
    "exit.label-required",
    "error",
    "rooms.hall.exits.trapdoor",
    (p) => {
      p.rooms.hall!.exits!.trapdoor = { to: "study" };
    },
  ],
  [
    "exit.door-not-openable",
    "error",
    "rooms.hall.exits.north.door",
    (p) => {
      p.objects!.door!.openable = false;
    },
  ],
  [
    "object.alsoIn-portable",
    "error",
    "objects.door.alsoIn",
    (p) => {
      p.objects!.door!.portable = true;
    },
  ],
  [
    "object.contains-itself",
    "error",
    "objects.box.location",
    (p) => {
      p.objects!.box!.location = "chest";
      p.objects!.chest = { name: "chest", location: "box", container: true };
    },
  ],
  [
    "object.contains-itself",
    "error",
    "objects.box.location",
    (p) => {
      p.objects!.box!.location = "box";
    },
  ],
  [
    "rule.once-without-id",
    "error",
    "rules[1].once",
    (p) => void Object.assign(p.rules![1]!, { id: undefined, once: true }),
  ],
  [
    "rule.duplicate-id",
    "error",
    "rules[1].id",
    (p) => {
      p.rules![1]!.id = "light_lamp";
    },
  ],
  [
    "rule.trigger-object-not-allowed",
    "error",
    "rules[0].on.with",
    (p) => {
      p.rules![0]!.on = { verb: "take", object: "lamp", with: "box" };
    },
  ],
  [
    "rule.trigger-object-not-allowed",
    "error",
    "rules[0].on.object",
    (p) => {
      p.rules![0]!.on = { verb: "wait", object: "lamp" };
    },
  ],
  [
    "ref.unknown-room",
    "error",
    "rules[0].on.room",
    (p) => {
      p.rules![0]!.on = { event: "turn", room: "garden" };
    },
  ],
  [
    "rule.choose-trigger",
    "error",
    "rules[0].on.verb",
    (p) => {
      p.rules![0]!.on = { verb: "choose", object: "ask" };
    },
  ],
  [
    "dialogue.duplicate-option",
    "error",
    "dialogues.chat.nodes.news.options[1].id",
    (p) => void p.dialogues!.chat!.nodes.news!.options!.push({ id: "ask", text: "Again?" }),
  ],
  [
    "dialogue.unknown-goto",
    "error",
    "dialogues.chat.nodes.hello.options[0].goto",
    (p) => {
      p.dialogues!.chat!.nodes.hello!.options![0]!.goto = "newz";
    },
  ],
  [
    "ending.none-winning",
    "error",
    "endings",
    (p) => {
      p.endings.done!.win = false;
    },
  ],
  [
    "policy.losing-ending",
    "error",
    "endings.done.win",
    (p) => {
      p.endings.done!.win = false;
    },
  ],
  [
    "learn.not-a-clue",
    "error",
    "rules[1].do[0].learn",
    (p) => {
      p.rules![1]!.do = { learn: "note" };
    },
  ],
  [
    "text.unknown-ref",
    "error",
    "rooms.hall.description",
    (p) => {
      p.rooms.hall!.description = "A hall with a {chest}.";
    },
  ],
  [
    "text.unknown-ref",
    "error",
    "rooms.hall.description",
    (p) => {
      p.rooms.hall!.description = "A {study} here, a {box}.";
    },
  ],
  [
    "text.unknown-ref",
    "error",
    "endings.done.text",
    (p) => {
      p.endings.done!.text = "Done with the {box|}.";
    },
  ],
  [
    "walkthrough.malformed",
    "error",
    "walkthrough[0]",
    (p) => {
      p.walkthrough[0] = "use the lamp now please";
    },
  ],
  [
    "walkthrough.malformed",
    "error",
    "walkthrough[0]",
    (p) => {
      p.walkthrough[0] = "Use lamp";
    },
  ],
  [
    "walkthrough.malformed",
    "error",
    "walkthrough[0]",
    (p) => {
      p.walkthrough[0] = "light lamp";
    },
  ],
  [
    "walkthrough.malformed",
    "error",
    "walkthrough[0]",
    (p) => {
      p.walkthrough[0] = "use torch";
    },
  ],
  [
    "walkthrough.malformed",
    "error",
    "walkthrough[0]",
    (p) => {
      p.walkthrough[0] = "go west";
    },
  ],
  [
    "walkthrough.malformed",
    "error",
    "walkthrough[0]",
    (p) => {
      p.walkthrough[0] = "choose hello";
    },
  ],
  [
    "walkthrough.malformed",
    "error",
    "walkthrough[0]",
    (p) => {
      p.walkthrough[0] = "give lamp";
    },
  ],
  [
    "walkthrough.malformed",
    "error",
    "walkthrough[0]",
    (p) => {
      p.walkthrough[0] = "take";
    },
  ],
  [
    "hint.duplicate-id",
    "error",
    "hints[1].id",
    (p) => void p.hints!.push({ id: "lamp", until: { has: "key" }, steps: ["x"] }),
  ],
];

const WARNINGS_AND_INFO: Case[] = [
  [
    "rule.shadowed",
    "warning",
    "rules[1].on",
    (p) => void p.rules!.unshift({ id: "general", on: { verb: "use" }, do: { say: "Nothing happens." } }),
  ],
  [
    "rule.shadowed",
    "warning",
    "rules[1].on",
    (p) => void p.rules!.unshift({ id: "same", on: { verb: "use", object: "lamp" }, do: { say: "Again." } }),
  ],
  [
    "flag.never-set",
    "warning",
    "flags.lamp_lit",
    (p) => {
      p.rules![0]!.do = { say: "The lamp glows." };
    },
  ],
  [
    "flag.never-read",
    "warning",
    "flags.unused",
    (p) => {
      p.flags!.unused = true;
    },
  ],
  [
    "counter.never-read",
    "warning",
    "counters.steps",
    (p) => {
      p.counters!.steps = 0;
    },
  ],
  [
    "counter.unbounded-turn-rule",
    "warning",
    "rules[4].do[0].counter",
    (p) => void p.rules!.push({ id: "tick", on: { event: "turn" }, do: { counter: { name: "knocks", add: 1 } } }),
  ],
  [
    "counter.unbounded",
    "info",
    "rules[2].do[0].counter",
    (p) => {
      p.rules![2]!.when = undefined;
    },
  ],
  [
    "room.unreachable",
    "warning",
    "rooms.attic",
    (p) => {
      p.rooms.attic = { name: "Attic", description: "Dusty." };
    },
  ],
  [
    "dialogue.unreachable-node",
    "warning",
    "dialogues.chat.nodes.secret",
    (p) => {
      p.dialogues!.chat!.nodes.secret = { say: "Psst." };
    },
  ],
  [
    "dialogue.no-exit",
    "warning",
    "dialogues.chat",
    (p) => {
      p.dialogues!.chat!.nodes.hello!.options![1]!.goto = "news";
    },
  ],
  [
    "object.unmentioned",
    "info",
    "objects.statue",
    (p) => {
      p.objects!.statue = { name: "statue", location: "hall" };
    },
  ],
  [
    "npc.no-talk",
    "info",
    "objects.cat",
    (p) => {
      p.objects!.cat = { name: "cat", location: "hall", npc: true, roomText: "A cat." };
    },
  ],
  [
    "text.too-long",
    "warning",
    "rooms.hall.description",
    (p) => {
      p.rooms.hall!.description = `A {box} and a {door}. ${"x".repeat(600)}`;
    },
  ],
  [
    "text.too-long",
    "warning",
    "objects.box.description",
    (p) => {
      p.objects!.box!.description = "y".repeat(401);
    },
  ],
  [
    "text.too-long",
    "warning",
    "dialogues.chat.nodes.news.say",
    (p) => {
      p.dialogues!.chat!.nodes.news!.say = "z".repeat(301);
    },
  ],
  [
    "text.too-long",
    "warning",
    "dialogues.chat.nodes.hello.options[0].text",
    (p) => {
      p.dialogues!.chat!.nodes.hello!.options![0]!.text = "w".repeat(81);
    },
  ],
  [
    "text.too-long",
    "warning",
    "objects.lamp.name",
    (p) => {
      p.objects!.lamp!.name = "an extraordinarily long lamp";
    },
  ],
  [
    "hint.none",
    "warning",
    "hints",
    (p) => {
      p.hints = [];
    },
  ],
  [
    "score.maxScore-missing",
    "info",
    "maxScore",
    (p) => {
      p.maxScore = undefined;
    },
  ],
  [
    "score.maxScore-unreachable",
    "warning",
    "maxScore",
    (p) => {
      p.maxScore = 5;
    },
  ],
  [
    "ending.unused",
    "warning",
    "endings.other",
    (p) => {
      p.endings.other = { title: "Other", text: "Other.", win: true };
    },
  ],
  [
    "dialogue.unused",
    "warning",
    "dialogues.idle",
    (p) => {
      p.dialogues!.idle = { start: "a", nodes: { a: { say: "Hm." } } };
    },
  ],
  [
    "exit.door-not-here",
    "warning",
    "rooms.study.exits.south.door",
    (p) => {
      p.objects!.door!.alsoIn = [];
    },
  ],
  [
    "text.variant-after-default",
    "warning",
    "objects.box.description[1]",
    (p) => {
      p.objects!.box!.description = [{ text: "A box." }, { when: { flag: "lamp_lit" }, text: "A lit box." }];
    },
  ],
  [
    "text.stray-brace",
    "warning",
    "endings.done.text",
    (p) => {
      p.endings.done!.text = "Well done }.";
    },
  ],
  [
    "condition.counter-no-test",
    "warning",
    "rules[3].when[2].counter",
    (p) => {
      (p.rules![3]!.when as object[])[2] = { counter: { name: "knocks" } };
    },
  ],
  [
    "object.dialogue-not-npc",
    "warning",
    "objects.butler.dialogue",
    (p) => {
      p.objects!.butler!.npc = false;
    },
  ],
  ["object.verb-not-applicable", "warning", "objects.note.verbs[1]", (p) => void p.objects!.note!.verbs!.push("go")],
  [
    "rule.start-room",
    "warning",
    "rules[4].on.room",
    (p) => void p.rules!.push({ id: "welcome", on: { event: "start", room: "study" }, do: { say: "Hello." } }),
  ],
  ["verb.reserved", "warning", "verbs.go", (p) => void (p.verbs!.go = { label: "Walk", synonyms: ["stroll"] })],
  ["verb.reserved", "warning", "verbs.choose", (p) => void (p.verbs!.choose = { label: "Pick" })],
];

describe("analyze: one fixture per diagnostic", () => {
  it.each([...ERRORS, ...WARNINGS_AND_INFO])("%s (%s) at %s", (code, severity, path, mutate) => {
    const diagnostics = diagnose(mutate);
    const match = diagnostics.find((d) => d.code === code && d.path === path);
    expect(match, JSON.stringify(diagnostics, null, 2)).toBeDefined();
    expect(match!.severity).toBe(severity);
    expect(match!.message.length).toBeGreaterThan(20);
  });
});

describe("analyze: details", () => {
  it("accepts 'room' on turn rules (they fire only while the player is in that room)", () => {
    const diagnostics = diagnose((p) => {
      p.rules!.push({ id: "tick", on: { event: "turn", room: "study" }, do: { say: "Tick." } });
    });
    expect(diagnostics).toEqual([]);
  });

  it("explains a start rule whose room is not the start room", () => {
    const d = find(
      diagnose((p) => void p.rules!.push({ id: "w", on: { event: "start", room: "study" }, do: { say: "Hi." } })),
      "rule.start-room",
    );
    expect(d.message).toContain("from ever firing");
    expect(d.message).toContain("event: enter, room: study");
    const same = find(
      diagnose((p) => void p.rules!.push({ id: "w", on: { event: "start", room: "hall" }, do: { say: "Hi." } })),
      "rule.start-room",
    );
    expect(same.message).toContain("repeats the start room");
  });

  it("suggests the closest id for typos", () => {
    const d = find(
      diagnose((p) => {
        p.objects!.lamp!.location = "hal";
      }),
      "ref.unknown-location",
    );
    expect(d.message).toContain('Did you mean "hall"?');
  });

  it("explains a room used where an object is expected", () => {
    const d = find(
      diagnose((p) => {
        p.rules![1]!.do = [{ learn: "clue_note" }, { reveal: "study" }];
      }),
      "ref.unknown-object",
    );
    expect(d.message).toContain("is a room, not an object");
  });

  it("does not report shadowing by a rule with 'when' or 'once'", () => {
    const withWhen = diagnose((p) => {
      p.rules!.splice(1, 0, { id: "general", on: { verb: "use" }, when: { flag: "lamp_lit" }, do: { say: "Hm." } });
    });
    expect(codes(withWhen)).not.toContain("rule.shadowed");
    const once = diagnose((p) => {
      p.rules!.unshift({ id: "first_use", on: { verb: "use" }, once: true, do: { say: "Hm." } });
    });
    expect(codes(once)).not.toContain("rule.shadowed");
  });

  it("does not report shadowing among event rules", () => {
    const diagnostics = diagnose((p) => {
      p.rules!.push({ id: "e1", on: { event: "enter" }, do: { say: "a" } });
      p.rules!.push({ id: "e2", on: { event: "enter", room: "study" }, do: { say: "b" } });
    });
    expect(codes(diagnostics)).not.toContain("rule.shadowed");
  });

  it("accepts counters bounded in the rule's when, through not, or inside an if", () => {
    const bounded = diagnose((p) => {
      p.rules!.push({
        id: "tick",
        on: { event: "turn" },
        when: { not: { counter: { name: "knocks", gte: 5 } } },
        do: { counter: { name: "knocks", add: 1 } },
      });
      p.rules!.push({
        id: "tock",
        on: { event: "turn" },
        // biome-ignore lint/suspicious/noThenProperty: 'then' is a pack data key, not a thenable
        do: { if: { when: { counter: { name: "knocks", lt: 5 } }, then: [{ counter: { name: "knocks", add: 1 } }] } },
      });
      p.rules!.push({
        id: "down",
        on: { event: "turn" },
        when: { all: [{ flag: "lamp_lit" }, { counter: { name: "knocks", gt: 0 } }] },
        do: { counter: { name: "knocks", add: -1 } },
      });
    });
    expect(codes(bounded)).not.toContain("counter.unbounded-turn-rule");
  });

  it("flags an 'any' that bounds only one branch", () => {
    const diagnostics = diagnose((p) => {
      p.rules!.push({
        id: "tick",
        on: { event: "turn" },
        when: { any: [{ flag: "lamp_lit" }, { counter: { name: "knocks", lt: 5 } }] },
        do: { counter: { name: "knocks", add: 1 } },
      });
    });
    expect(codes(diagnostics)).toContain("counter.unbounded-turn-rule");
  });

  it("checks walkthrough 'go' against exits of any room and 'choose' against any dialogue", () => {
    const ok = diagnose((p) => void p.walkthrough.push("go south", "choose back"));
    expect(codes(ok)).not.toContain("walkthrough.malformed");
  });

  it("returns diagnostics sorted by path, deterministically", () => {
    const mutate = (p: PackInput) => {
      p.walkthrough[0] = "fly";
      p.start.room = "nowhere_room";
      p.rooms.attic = { name: "Attic", description: "Dusty." };
      p.rules![1]!.do = { learn: "note" };
      p.flags!.zzz = false;
    };
    const first = diagnose(mutate);
    expect(diagnose(mutate)).toEqual(first);
    const paths = first.map((d) => d.path);
    expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("orders numeric indices numerically", () => {
    const diagnostics = diagnose((p) => {
      for (let i = 0; i < 11; i++) p.walkthrough.push(`bad${i} x y z`);
    });
    const indices = diagnostics.filter((d) => d.code === "walkthrough.malformed").map((d) => d.path);
    expect(indices[0]).toBe("walkthrough[11]");
    expect(indices[indices.length - 1]).toBe("walkthrough[21]");
  });
});
