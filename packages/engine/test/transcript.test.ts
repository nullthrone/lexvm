import { describe, expect, it } from "vitest";
import { walkthroughTranscript } from "../src/transcript.ts";
import { loadLockedStudy } from "./fixtures/runtime/helpers.ts";

describe("walkthroughTranscript", () => {
  it("renders the whole winning play as Markdown, without system lines", () => {
    const pack = loadLockedStudy();
    const t = walkthroughTranscript(pack);
    expect(t.ok).toBe(true);
    expect(t.steps).toBe(pack.walkthrough.length);
    expect(t.markdown.startsWith(`# ${pack.title}\n`)).toBe(true);
    expect(t.markdown).toContain("## Entrance Hall");
    expect(t.markdown).toMatch(/\n> \S/);
    expect(t.markdown).toMatch(/\n### /);
    expect(t.markdown).not.toMatch(/\n\(/);
  });

  it("stops at the first rejected step and says so", () => {
    const pack = { ...loadLockedStudy(), walkthrough: ["go nowhere_at_all"] };
    const t = walkthroughTranscript(pack);
    expect(t.ok).toBe(false);
    expect(t.steps).toBe(0);
    expect(t.markdown).toContain("The walkthrough stops here after 0 accepted steps");
  });
});
