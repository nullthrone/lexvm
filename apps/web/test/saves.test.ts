import { describe, expect, it } from "vitest";
import {
  createSave,
  isGameState,
  MAX_SAVE_FILE,
  parseSaveFile,
  sanitizeHints,
  saveFileName,
  serializeSave,
  validateSave,
  validateStoredSave,
} from "../src/logic/saves.ts";
import { sampleState } from "./fixtures.ts";

const save = createSave(
  { id: "locked-study", version: "1.0.0" },
  "abc123",
  sampleState(),
  ["go west", "pull red_book", "take brass_key"],
  new Date("2026-10-23T13:30:00Z"),
);

describe("save files", () => {
  it("round-trips through serialisation", () => {
    const parsed = parseSaveFile(serializeSave(save));
    expect(parsed).toEqual({ ok: true, save });
    expect(save.savedAt).toBe("2026-10-23T13:30:00.000Z");
    expect(save.format).toBe("lexvm-save/1");
  });

  it("copies the log", () => {
    const log = ["wait"];
    const s = createSave({ id: "p", version: "1.0.0" }, "h", sampleState(), log, new Date(0));
    log.push("look");
    expect(s.log).toEqual(["wait"]);
  });

  it("rejects malformed saves", () => {
    expect(parseSaveFile("not json").ok).toBe(false);
    expect(validateSave({ ...save, format: "lexvm-save/2" }).ok).toBe(false);
    expect(validateSave({ ...save, pack: { id: "locked-study", version: "1.0.0" } }).ok).toBe(false);
    expect(validateSave({ ...save, log: [1, 2] }).ok).toBe(false);
    expect(validateSave({ ...save, state: { ...save.state, v: 2 } }).ok).toBe(false);
    expect(validateSave({ ...save, state: sampleState({ pack: { id: "other", version: "1.0.0" } }) }).ok).toBe(false);
    expect(validateSave({ ...save, savedAt: 5 }).ok).toBe(false);
    // Oversized files are refused before JSON.parse.
    expect(parseSaveFile(" ".repeat(MAX_SAVE_FILE + 1))).toEqual({ ok: false, reason: "file too large" });
  });

  it("checks the game state structure", () => {
    expect(isGameState(sampleState())).toBe(true);
    expect(isGameState(sampleState({ dialogue: { id: "graves_talk", node: "hello" }, ended: "found_uncle" }))).toBe(
      true,
    );
    expect(isGameState({ ...sampleState(), flags: { a: "yes" } })).toBe(false);
    expect(isGameState({ ...sampleState(), objects: { a: { location: "hall" } } })).toBe(false);
    expect(isGameState({ ...sampleState(), turn: -1 })).toBe(false);
    expect(isGameState({ ...sampleState(), counters: { a: Number.NaN } })).toBe(false);
    expect(isGameState(null)).toBe(false);
  });
});

describe("stored saves", () => {
  it("keeps valid hint counts only", () => {
    expect(sanitizeHints({ a: 2, b: 0, c: -1, d: 1.5, e: "3" })).toEqual({ a: 2 });
    expect(sanitizeHints(null)).toEqual({});
  });

  it("validates the stored record", () => {
    expect(validateStoredSave({ save, hints: { find_key: 2 } })).toEqual({ save, hints: { find_key: 2 } });
    expect(validateStoredSave({ save: { ...save, format: "x" }, hints: {} })).toBeNull();
    expect(validateStoredSave(undefined)).toBeNull();
  });
});

describe("saveFileName", () => {
  it("uses the pack id and local date", () => {
    expect(saveFileName("locked-study", new Date(2026, 9, 23, 9, 5))).toBe("locked-study-2026-10-23-0905.lexsave.json");
    expect(saveFileName("../evil", new Date(2026, 0, 2, 3, 4))).toBe("evil-2026-01-02-0304.lexsave.json");
  });
});
