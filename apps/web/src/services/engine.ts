/**
 * The engine as used by the app. Nothing here calls into the engine at import
 * time. The compiler (which pulls in the YAML parser) is loaded on demand so
 * it stays out of the main chunk.
 */
import { formatCommand, hint, newGame, parseCanonical, step, validateState, view } from "@lexvm/engine";
import type { EngineApi } from "../game/session.ts";

export const engine: EngineApi = { newGame, step, view, hint, formatCommand, parseCanonical, validateState };

export type CompileFn = typeof import("@lexvm/engine/compile")["compile"];

let compilerPromise: Promise<CompileFn> | null = null;

/** Lazily load the pack compiler (separate chunk). */
export function loadCompiler(): Promise<CompileFn> {
  compilerPromise ??= import("@lexvm/engine/compile").then((m) => m.compile);
  compilerPromise.catch(() => {
    compilerPromise = null;
  });
  return compilerPromise;
}
