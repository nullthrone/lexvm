import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Command,
  compile,
  formatCommand,
  type GameState,
  hint,
  newGame,
  type Pack,
  packHash,
  parseCanonical,
  type StepResult,
  step,
  validateState,
  view,
} from "@lexvm/engine";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  type EngineApi,
  GameSession,
  replayLog,
  restoreSession,
  UNDO_LIMIT,
} from "../src/game/session.ts";
import { sampleState } from "./fixtures.ts";

/** A tiny fake engine: every command increments the turn; "bad" is rejected. */
function fakeEngine(): EngineApi {
  return {
    newGame: () => ({ state: sampleState({ turn: 0 }), output: [{ kind: "text", spans: [{ text: "start" }] }] }),
    step: (_pack, state, command): StepResult =>
      command.verb === "bad"
        ? { state, status: "rejected", output: [{ kind: "system", spans: [{ text: "no" }] }] }
        : {
            state: { ...state, turn: state.turn + 1 },
            status: "ok",
            output: [{ kind: "echo", spans: [{ text: command.verb }] }],
          },
    view: () => {
      throw new Error("unused");
    },
    hint: () => null,
    formatCommand: (c: Command) => [c.verb, c.object, c.with].filter(Boolean).join(" "),
    parseCanonical: (text: string) => (text.trim() ? { verb: text.split(" ")[0] ?? "" } : null),
    validateState: () => [],
  };
}

const fakePack = {} as Pack;

describe("GameSession (fake engine)", () => {
  it("logs accepted commands only and undoes them", () => {
    const { session } = GameSession.start(fakeEngine(), fakePack, "h");
    session.exec({ verb: "wait" });
    expect(session.exec({ verb: "bad" }).status).toBe("rejected");
    session.exec({ verb: "look" });
    expect(session.log).toEqual(["wait", "look"]);
    expect(session.state.turn).toBe(2);
    expect(session.undo()).toBe(true);
    expect(session.log).toEqual(["wait"]);
    expect(session.state.turn).toBe(1);
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(false);
    expect(session.state.turn).toBe(0);
  });

  it(`keeps at most ${UNDO_LIMIT} undo steps`, () => {
    const { session } = GameSession.start(fakeEngine(), fakePack, "h");
    for (let i = 0; i < UNDO_LIMIT + 20; i += 1) session.exec({ verb: "wait" });
    expect(session.undoDepth).toBe(UNDO_LIMIT);
    while (session.undo());
    expect(session.state.turn).toBe(20);
    expect(session.log).toHaveLength(20);
  });

  it("restart clears log and undo history", () => {
    const { session } = GameSession.start(fakeEngine(), fakePack, "h");
    session.exec({ verb: "wait" });
    session.restart();
    expect(session.log).toEqual([]);
    expect(session.canUndo).toBe(false);
  });

  it("remembers revealed hint steps, never decreasing", () => {
    const { session } = GameSession.start(fakeEngine(), fakePack, "h");
    session.setRevealed("find_key", 2);
    session.setRevealed("find_key", 1);
    expect(session.revealedHints("find_key")).toBe(2);
    expect(session.toStored(new Date(0)).hints).toEqual({ find_key: 2 });
  });

  it("replay stops at the first rejected or malformed command", () => {
    const replay = replayLog(fakeEngine(), fakePack, ["wait", "look", "bad", "wait"]);
    expect(replay.applied).toBe(2);
    expect(replay.stoppedAt).toBe(2);
    expect(replay.log).toEqual(["wait", "look"]);
    expect(replay.turns).toHaveLength(3);
  });

  it("canonicalJson ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3] } })).toBe(canonicalJson({ a: { c: [3], d: 2 }, b: 1 }));
  });
});

function demoPack(): Pack {
  const path = fileURLToPath(new URL("../../../packs/locked-study/pack.yaml", import.meta.url));
  const result = compile([{ name: "pack.yaml", text: readFileSync(path, "utf8") }]);
  if (!result.pack) throw new Error(JSON.stringify(result.diagnostics));
  return result.pack;
}

const realEngine: EngineApi = { newGame, step, view, hint, formatCommand, parseCanonical, validateState };

describe("GameSession with the engine and the demo pack", () => {
  const pack = demoPack();
  const hash = packHash(pack);

  function playWalkthrough(session: GameSession): void {
    for (const line of pack.walkthrough) {
      const command = parseCanonical(line);
      if (!command) throw new Error(line);
      expect(session.exec(command).status, line).toBe("ok");
    }
  }

  it("plays the walkthrough to the winning ending and logs canonical commands", () => {
    const { session } = GameSession.start(realEngine, pack, hash);
    playWalkthrough(session);
    expect(session.state.ended).toBe("found_uncle");
    expect(session.log).toEqual(pack.walkthrough);
  });

  it("restores a save by replaying its log, rebuilding the transcript", () => {
    const { session } = GameSession.start(realEngine, pack, hash);
    for (const line of pack.walkthrough.slice(0, 7)) session.exec(parseCanonical(line) as Command);
    session.setRevealed("open_door", 1);
    const stored = session.toStored(new Date());
    const restored = restoreSession(realEngine, pack, hash, structuredClone(stored));
    expect(restored.kind).toBe("restored");
    if (restored.kind !== "restored") return;
    expect(canonicalJson(restored.session.state)).toBe(canonicalJson(session.state));
    expect(restored.turns).toHaveLength(8);
    expect(restored.session.revealedHints("open_door")).toBe(1);
  });

  it("falls back to the saved state when the log does not reproduce it", () => {
    const { session } = GameSession.start(realEngine, pack, hash);
    session.exec({ verb: "go", object: "west" });
    const stored = session.toStored(new Date());
    const tampered: GameState = { ...stored.save.state, score: 2 };
    const result = restoreSession(realEngine, pack, hash, { ...stored, save: { ...stored.save, state: tampered } });
    expect(result.kind).toBe("state-only");
  });

  it("does not trust a saved state with unknown ids or a dialogue without options", () => {
    const { session } = GameSession.start(realEngine, pack, hash);
    session.exec({ verb: "go", object: "west" });
    const stored = session.toStored(new Date());
    const tampered = (patch: Partial<GameState>) => ({
      ...stored,
      save: { ...stored.save, state: { ...stored.save.state, ...patch } },
    });
    for (const patch of [
      { dialogue: { id: "constructor", node: "x" } },
      { room: "constructor" },
      { objects: {} },
      { ended: "constructor" },
    ] as Array<Partial<GameState>>) {
      const result = restoreSession(realEngine, pack, hash, tampered(patch));
      expect(result.kind, JSON.stringify(patch)).toBe("repaired");
      if (result.kind !== "repaired") continue;
      // The game continues from what the log reproduces, and the engine can show it.
      expect(result.session.state.room).toBe("library");
      expect(result.problems.length).toBeGreaterThan(0);
      expect(() => result.session.view()).not.toThrow();
    }
  });

  it("does not let a hint id such as 'constructor' find Object's constructor", () => {
    const { session } = GameSession.start(realEngine, pack, hash);
    expect(session.revealedHints("constructor")).toBe(0);
    session.setRevealed("constructor", 2);
    expect(session.revealedHints("constructor")).toBe(2);
  });

  it("reports a changed pack so the player can choose to replay", () => {
    const { session } = GameSession.start(realEngine, pack, hash);
    const stored = session.toStored(new Date());
    const result = restoreSession(realEngine, pack, "other-hash", stored);
    expect(result.kind).toBe("pack-changed");
  });
});
