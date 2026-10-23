/** Optional vibration feedback (navigator.vibrate), controlled by the haptics setting. */
import { settings } from "./settings.ts";

export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function vibrate(pattern: number | number[]): void {
  if (!settings.get().haptics || !hapticsSupported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore: some browsers throw when called without user activation.
  }
}

/** A command was accepted. */
export function tapFeedback(): void {
  vibrate(8);
}

/** A command was rejected or could not be understood. */
export function rejectFeedback(): void {
  vibrate([12, 60, 12]);
}
