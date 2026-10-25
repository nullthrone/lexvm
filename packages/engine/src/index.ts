/**
 * @lexvm/engine public API.
 *
 * Everything here is pure, synchronous and deterministic. The package has no
 * DOM or Node dependencies and runs unchanged in the browser, in Node and in
 * workers.
 */

export { analyze } from "./analyze.ts";
export { TEXT_LIMITS, textLimits } from "./analyze-text.ts";
export { commandLabel, formatCommand, parseCanonical } from "./commands.ts";
export { compile } from "./compile.ts";
export { explore } from "./explore.ts";
export { packHash, stateKey } from "./hash.ts";
export { loadPack, PackError } from "./load.ts";
export { parseCommand } from "./parser.ts";
export {
  BUDGET_DEFAULTS,
  budgetForMinutes,
  countWords,
  DEFAULT_PACING,
  estimatePlaytime,
  PACING_BAND,
  PACING_READING_SHARE,
  PLAYTIME_DEFAULTS,
} from "./playtime.ts";
export { hint, newGame, step, view } from "./runtime.ts";
export * from "./schema.ts";
export { objectDescription, objectName, plainText, renderPlain } from "./text.ts";
export { type Transcript, walkthroughTranscript } from "./transcript.ts";
export * from "./types.ts";
export { validateState } from "./validate-state.ts";
export { runWalkthrough } from "./walkthrough.ts";
