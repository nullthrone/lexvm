/**
 * Autosaves across tabs: a tab writes only over the save it knows. Runs on
 * the in-memory storage backend (no IndexedDB or localStorage in Node).
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

describe("writeSaveIfCurrent", () => {
  it("writes over the save this tab knows and refuses one another tab wrote", async () => {
    const key = "builtin:two-tabs";
    // Tab A starts a game; tab B opens it and plays a move.
    expect(await writeSaveIfCurrent(key, stored("2026-10-23T10:00:00.000Z", 0), null)).toBe("written");
    expect(await writeSaveIfCurrent(key, stored("2026-10-23T10:00:01.000Z", 20), "2026-10-23T10:00:00.000Z")).toBe(
      "written",
    );
    // Tab A, still at the first save, makes a move: that would silently replace B's progress.
    expect(await writeSaveIfCurrent(key, stored("2026-10-23T10:00:02.000Z", 1), "2026-10-23T10:00:00.000Z")).toBe(
      "conflict",
    );
    expect((await readSave(key))?.save.state.turn).toBe(20);
    // A fresh tab without a known save does not overwrite one either.
    expect(await writeSaveIfCurrent(key, stored("2026-10-23T10:00:03.000Z", 0), null)).toBe("conflict");
    // Choosing "keep playing here" writes unconditionally.
    expect(await writeSave(key, stored("2026-10-23T10:00:04.000Z", 1))).toBe(true);
    expect((await readSave(key))?.save.state.turn).toBe(1);
  });

  it("chains quick writes of one tab without conflicts", async () => {
    const key = "builtin:quick";
    const writes = [0, 1, 2, 3].map((i) =>
      writeSaveIfCurrent(
        key,
        stored(`2026-10-23T10:00:0${i + 1}.000Z`, i + 1),
        i === 0 ? null : `2026-10-23T10:00:0${i}.000Z`,
      ),
    );
    expect(await Promise.all(writes)).toEqual(["written", "written", "written", "written"]);
    expect((await readSave(key))?.save.state.turn).toBe(4);
  });
});
