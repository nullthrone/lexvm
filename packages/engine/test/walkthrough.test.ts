import { describe, expect, it } from "vitest";
import { runWalkthrough, STEP_OUTPUT_MAX } from "../src/walkthrough.ts";
import { loadFixture, loadLockedStudy, makePack } from "./fixtures/runtime/helpers.ts";

const base = {
  start: { room: "hall" },
  rooms: { hall: { name: "Hall", description: "A hall.", exits: { north: { to: "hall" } } } },
  objects: {
    button: { name: "button", location: "hall", verbs: ["push", "pull"] },
    lamp: { name: "lamp", location: "hall", portable: true },
  },
  rules: [
    { on: { verb: "push", object: "button" }, do: { end: "won" } },
    { on: { verb: "pull", object: "button" }, do: { end: "lost" } },
  ],
  endings: {
    won: { title: "Won", text: "Yes.", win: true },
    lost: { title: "Lost", text: "No.", win: false },
  },
};

describe("runWalkthrough", () => {
  describe("names before they are revealed", () => {
    const porter = (sayAtStart: string, talk: string) =>
      makePack({
        ...base,
        flags: { met: false },
        objects: {
          ...base.objects,
          porter: {
            name: [{ when: { flag: "met" }, text: "Graves" }, { text: "porter" }],
            location: "hall",
            npc: true,
            roomText: "A porter waits.",
          },
        },
        rules: [
          ...base.rules,
          { on: { verb: "wait" }, do: { say: sayAtStart } },
          { on: { verb: "talk", object: "porter" }, do: [{ say: talk }, { set: "met" }] },
        ],
        walkthrough: ["wait", "talk porter", "wait", "push button"],
      });
    const codes = (pack: ReturnType<typeof makePack>) =>
      runWalkthrough(pack).diagnostics.filter((d) => d.code === "text.name-before-reveal");

    it("warns when a present character is called by a name the player has not learned", () => {
      const found = codes(porter("Graves yawns.", "»I am Graves.«"));
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ severity: "warning", path: "walkthrough[0]" });
      expect(found[0]?.message).toContain('"Graves"');
      expect(found[0]?.message).toContain('"porter"');
    });

    it("accepts the name in the step that reveals it and afterwards, and its genitive only when known", () => {
      expect(codes(porter("The porter yawns.", "»I am Graves.«"))).toEqual([]);
      expect(codes(porter("Graves's keys jingle.", "»I am Graves.«"))).toHaveLength(1);
      expect(codes(porter("Gravesend is far.", "»I am Graves.«"))).toEqual([]);
    });
  });

  it("accepts the locked-study walkthrough", () => {
    const report = runWalkthrough(loadLockedStudy());
    expect(report.diagnostics).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.ending).toBe("found_uncle");
    expect(report.score).toBe(3);
    expect(report.steps).toHaveLength(17);
    expect(report.steps.every((s) => s.status === "ok")).toBe(true);
    expect(report.steps[0]).toMatchObject({ command: "talk graves" });
    expect(report.steps.at(-1)?.output).toContain("*** The Observatory ***");
  });

  it("keeps at most STEP_OUTPUT_MAX characters of output per step", () => {
    const long = "word ".repeat(2000);
    const pack = makePack({
      ...base,
      rules: [...base.rules, { on: { verb: "wait" }, do: { say: long } }],
      walkthrough: ["wait", "wait", "push button"],
    });
    const report = runWalkthrough(pack);
    expect(report.ok).toBe(true);
    const wait = report.steps[0]!.output;
    expect(wait.startsWith("> Wait\n\nword word")).toBe(true);
    expect(wait.endsWith(" …")).toBe(true);
    expect(wait.length).toBeLessThan(STEP_OUTPUT_MAX + 20);
    expect(report.steps[2]!.output).toContain("*** Won ***");
  });

  it("accepts the German fixture walkthrough", () => {
    const report = runWalkthrough(loadFixture("hafen.yaml"));
    expect(report.ok).toBe(true);
    expect(report.ending).toBe("geloest");
  });

  it("reports malformed commands", () => {
    const report = runWalkthrough(makePack({ ...base, walkthrough: ["take lamp", "Push Button", "push button"] }));
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({ severity: "error", code: "walkthrough.malformed", path: "walkthrough[1]" }),
    ]);
    expect(report.steps).toHaveLength(2);
  });

  it("reports rejected commands with the situation", () => {
    const report = runWalkthrough(makePack({ ...base, walkthrough: ["take lamp", "take ghost", "push button"] }));
    expect(report.ok).toBe(false);
    const d = report.diagnostics[0];
    expect(d).toMatchObject({ severity: "error", code: "walkthrough.rejected", path: "walkthrough[1]" });
    expect(d?.message).toContain('Step 2 "take ghost" was rejected: Unknown object: ghost.');
    expect(d?.message).toContain("Current room: hall.");
    expect(d?.message).toContain("Present objects: button.");
    expect(d?.message).toContain("Inventory: lamp.");
    expect(d?.message).toContain("Exits: north.");
    expect(report.steps.map((s) => s.status)).toEqual(["ok", "rejected"]);
  });

  it("mentions the dialogue options when a step is rejected during a dialogue", () => {
    const report = runWalkthrough(
      makePack({
        ...base,
        objects: { ...base.objects, ann: { name: "Ann", location: "hall", npc: true, dialogue: "d" } },
        dialogues: { d: { start: "a", nodes: { a: { say: "Hi.", options: [{ id: "bye", text: "Bye." }] } } } },
        walkthrough: ["talk ann", "push button"],
      }),
    );
    expect(report.diagnostics[0]?.message).toContain('Active dialogue: d, node a; only "choose <option>"');
    expect(report.diagnostics[0]?.message).toContain("Options: bye.");
  });

  it("reports a game that ends before the last step", () => {
    const report = runWalkthrough(makePack({ ...base, walkthrough: ["push button", "take lamp"] }));
    expect(report.ok).toBe(false);
    expect(report.ending).toBe("won");
    expect(report.diagnostics).toEqual([
      expect.objectContaining({ code: "walkthrough.ended-early", path: "walkthrough[1]" }),
    ]);
  });

  it("warns about steps that only work as typed commands", () => {
    const report = runWalkthrough(
      makePack({
        ...base,
        objects: { ...base.objects, button: { name: "button", location: "hall" } },
        walkthrough: ["take lamp", "push button"],
      }),
    );
    expect(report.ok).toBe(true);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({ severity: "warning", code: "walkthrough.not-offered", path: "walkthrough[1]" }),
    ]);
    expect(report.diagnostics[0]?.message).toContain('Add "push" to objects.button.verbs');
  });

  it("reports walkthroughs that do not reach a winning ending", () => {
    const none = runWalkthrough(makePack({ ...base, walkthrough: ["take lamp"] }));
    expect(none.ok).toBe(false);
    expect(none.ending).toBeNull();
    expect(none.diagnostics).toEqual([expect.objectContaining({ code: "walkthrough.not-won", path: "walkthrough" })]);
    expect(none.diagnostics[0]?.message).toContain("ending: none");
    const lost = runWalkthrough(makePack({ ...base, walkthrough: ["pull button"] }));
    expect(lost.ok).toBe(false);
    expect(lost.ending).toBe("lost");
    expect(lost.diagnostics[0]?.code).toBe("walkthrough.not-won");
    expect(lost.diagnostics[0]?.message).toContain("'lost'");
  });
});
