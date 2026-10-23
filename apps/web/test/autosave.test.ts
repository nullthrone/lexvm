/**
 * Autosaves across tabs: a tab writes only over the save it started from or
 * its own. Runs on the in-memory storage backend (no IndexedDB or
 * localStorage in Node); the tabs are simulated with explicit writer ids.
 */
import { describe, expect, it } from "vitest";
import type { StoredSave } from "../src/logic/saves.ts";
import { readSave, writeSave, writeSaveIfCurrent } from "../src/services/saves.ts";
import { sampleState } from "./fixtures.ts";

function stored(savedAt: string, turn: number): StoredSave {
  return {
    save: {
      format: "lexvm-save/1",
      pack: { id: "locked-study", version: "1.0.0", hash: "h" },
      state: sampleState({ turn }),
      log: [],
      savedAt,
    },
    hints: {},
  };
}

const at = (second: number) => `2026-10-23T10:00:${String(second).padStart(2, "0")}.000Z`;

describe("writeSaveIfCurrent", () => {
  it("writes over the save a tab started from or its own, and refuses another tab's", async () => {
    const key = "builtin:two-tabs";
    // Tab A starts a new game and plays two moves.
    expect(await writeSaveIfCurrent(key, stored(at(0), 0), null, "A")).toBe("written");
    expect(await writeSaveIfCurrent(key, stored(at(1), 1), null, "A")).toBe("written");
    // Tab B opens that game (starting from A's save) and plays on.
    expect(await writeSaveIfCurrent(key, stored(at(2), 20), at(1), "B")).toBe("written");
    expect(await writeSaveIfCurrent(key, stored(at(3), 21), at(1), "B")).toBe("written");
    // Tab A moves again: that would silently replace B's progress.
    expect(await writeSaveIfCurrent(key, stored(at(4), 2), null, "A")).toBe("conflict");
    expect((await readSave(key))?.save.state.turn).toBe(21);
    expect((await readSave(key))?.writer).toBe("B");
    // A chooses to keep playing in its tab: written unconditionally, and its later moves save again.
    expect(await writeSave(key, stored(at(5), 2), "A")).toBe(true);
    expect(await writeSaveIfCurrent(key, stored(at(6), 3), null, "A")).toBe("written");
    // Now B is the stale one.
    expect(await writeSaveIfCurrent(key, stored(at(7), 22), at(1), "B")).toBe("conflict");
    expect((await readSave(key))?.save.state.turn).toBe(3);
  });

  it("chains quick writes of one tab without conflicts", async () => {
    const key = "builtin:quick";
    const writes = [1, 2, 3, 4].map((turn) => writeSaveIfCurrent(key, stored(at(turn), turn), null, "A"));
    expect(await Promise.all(writes)).toEqual(["written", "written", "written", "written"]);
    expect((await readSave(key))?.save.state.turn).toBe(4);
  });
});
