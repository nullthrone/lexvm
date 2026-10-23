/**
 * End-to-end: every built-in pack of the catalog is won by tapping through its
 * walkthrough in the shipped UI, with no typing.
 *
 * Each walkthrough step (a canonical command) becomes the taps a player makes:
 * - `verb object [with]`: the object's chip under "Here", an in-text reference,
 *   or its entry in the inventory or notebook drawer; then the verb in the action
 *   sheet and, for two-object verbs, the second object in the target picker;
 * - `go x`: the exit chip; `choose x`: the dialogue option; `wait`: the menu;
 *   `look`: the room title; `inventory`: the inventory drawer.
 *
 * The engine replays the same steps alongside as an oracle. It only says where an
 * object is (as the screen shows it); after every step the screen must show the
 * oracle's room, score, conversation and output, and at the end its winning ending.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Command,
  loadPack,
  newGame,
  type OutputBlock,
  type Pack,
  parseCanonical,
  step,
  type View,
  view,
} from "@lexvm/engine";
import { expect, type Page, test } from "@playwright/test";
import { watchPolicyViolations } from "./support.ts";

interface CatalogEntry {
  id: string;
  title: string;
  file: string;
}

/** The built-in packs as built into dist/ (the build the e2e run serves). */
const PACKS = new URL("../dist/packs/", import.meta.url);
const catalog = JSON.parse(readFileSync(fileURLToPath(new URL("index.json", PACKS)), "utf8")) as {
  packs: CatalogEntry[];
};

function readPack(entry: CatalogEntry): Pack {
  return loadPack(JSON.parse(readFileSync(fileURLToPath(new URL(entry.file, PACKS)), "utf8")));
}

const transcript = (page: Page) => page.getByRole("log");
const actionSheet = (page: Page) => page.locator("dialog.action-sheet");
const drawer = (page: Page) => page.getByRole("dialog");

/** A line of the step's output to find in the transcript (proves the UI ran this very command). */
function outputLine(output: OutputBlock[]): string | null {
  for (const block of output) {
    if (block.kind === "echo") continue;
    const line = block.spans
      .map((s) => s.text)
      .join("")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (line) return line.length > 60 ? line.slice(0, 60) : line;
  }
  return null;
}

/** The layout fits the phone's width: the page never scrolls sideways. */
async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.content, `page width ${where}`).toBeLessThanOrEqual(width.viewport);
}

/**
 * Where the newest turn sits in the transcript's visible area: "ok" when it can be read, i.e. it is
 * wholly visible or, if taller than the area, starts at its top. Nothing (such as the dock with a
 * conversation's options) may cover it.
 */
function newestTurnPlacement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const log = document.querySelector('[role="log"]');
    const turn = log?.querySelector("section.turn:last-of-type");
    if (!log || !turn) return "no transcript";
    const area = log.getBoundingClientRect();
    const box = turn.getBoundingClientRect();
    if (box.top < area.top - 1) return `starts ${Math.round(area.top - box.top)}px above the visible area`;
    if (box.height <= area.height ? box.bottom > area.bottom + 1 : box.top > area.top + 48) {
      return `${Math.round(box.bottom - area.bottom)}px hidden below the visible area`;
    }
    return "ok";
  });
}

type Route = "dock" | "ref" | "inventory" | "notebook" | "exit" | "option" | "menu" | "title";

/** Plays one walkthrough step by tapping. Returns how the step was reached. */
async function tapStep(page: Page, command: Command, current: View, line: string): Promise<Route> {
  const { verb, object, with: second } = command;

  if (verb === "go" && object) {
    await page.getByRole("region", { name: "Exits" }).locator(`[data-exit="${object}"]`).tap();
    return "exit";
  }
  if (verb === "choose" && object) {
    await page.locator(`.dialogue [data-option="${object}"]`).tap();
    return "option";
  }
  if (verb === "wait" && !object) {
    await page.getByRole("button", { name: "Menu" }).tap();
    await drawer(page).getByRole("button", { name: "Wait" }).tap();
    return "menu";
  }
  if (verb === "look" && !object) {
    await page.getByRole("button", { name: `Look around: ${current.room.name}` }).tap();
    return "title";
  }
  if (!object) throw new Error(`Step "${line}": no tap route for a verb without an object`);

  // Where the object is: on the dock, in the newest text, or in a drawer.
  const here = current.objects.some((o) => o.id === object);
  const held = current.inventory.find((o) => o.id === object);
  const ref = transcript(page).locator(`button.ref[data-ref="${object}"]:not([aria-disabled="true"])`).last();
  let route: Route;
  if (verb === "look" && (await ref.count()) > 0) {
    // Examining is what tapping a highlighted word in the story is for.
    await ref.tap();
    route = "ref";
    if (!here && !held) return route; // Not present: the reference examines it directly.
  } else if (here) {
    await page.getByRole("region", { name: "Here" }).locator(`[data-object="${object}"]`).tap();
    route = "dock";
  } else if (held) {
    route = held.kind === "clue" ? "notebook" : "inventory";
    await page.getByRole("button", { name: route === "notebook" ? /^Notebook/ : /^Inventory/ }).tap();
    await drawer(page).locator(`[data-object="${object}"]`).tap();
  } else {
    throw new Error(`Step "${line}": "${object}" is neither on the dock, in a drawer nor in the text`);
  }

  await actionSheet(page).locator(`[data-verb="${verb}"]`).tap();
  if (second) {
    await actionSheet(page).locator(`.targets [data-object="${second}"]`).tap();
  } else if ((await actionSheet(page).locator(".targets").count()) > 0) {
    // A verb that may take a second object, used alone ("just use it").
    await actionSheet(page).getByRole("button", { name: "just use it" }).tap();
  }
  return route;
}

for (const entry of catalog.packs) {
  test(`“${entry.title}” is won by tapping through its walkthrough`, async ({ page }) => {
    const pack = readPack(entry);
    test.setTimeout(30_000 + pack.walkthrough.length * 3_000);
    const violations = await watchPolicyViolations(page);

    await page.goto("./");
    const card = page.getByRole("article", { name: entry.title });
    await expect(card).toBeVisible();
    await expectNoSidewaysScroll(page, "in the library");
    await card.getByRole("button", { name: "New game" }).tap();

    let { state } = newGame(pack);
    await expect(page.getByRole("button", { name: `Look around: ${view(pack, state).room.name}` })).toBeVisible();
    await expectNoSidewaysScroll(page, "at the start");

    const routes = new Map<Route, number>();
    for (const [index, line] of pack.walkthrough.entries()) {
      const command = parseCanonical(line);
      if (!command) throw new Error(`Walkthrough step ${index + 1} "${line}" is not a canonical command`);
      const before = view(pack, state);
      const route = await test.step(`${index + 1}. ${line}`, () => tapStep(page, command, before, line));
      routes.set(route, (routes.get(route) ?? 0) + 1);

      // `inventory` only opens the drawer: nothing to replay.
      if (command.verb === "inventory") {
        await drawer(page).getByRole("button", { name: "Close" }).tap();
        continue;
      }
      const result = step(pack, state, command);
      expect(result.status, `oracle accepts step ${index + 1} "${line}"`).toBe("ok");
      state = result.state;
      const after = view(pack, state);

      const expected = outputLine(result.output);
      if (expected) await expect(transcript(page), `output of step ${index + 1} "${line}"`).toContainText(expected);
      if (after.ended) break;
      await expect(actionSheet(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Look around: ${after.room.name}` })).toBeVisible();
      if (after.score) await expect(page.getByLabel(`Score: ${after.score.value} of ${after.score.max}`)).toBeVisible();
      if (after.dialogue) {
        const first = after.dialogue.options[0]?.id ?? "";
        await expect(page.locator(`.dialogue [data-option="${first}"]`)).toBeVisible();
      } else {
        await expect(page.getByRole("region", { name: "Here" })).toBeVisible();
      }
      await expect
        .poll(() => newestTurnPlacement(page), { message: `newest text readable after step ${index + 1} "${line}"` })
        .toBe("ok");
      await expectNoSidewaysScroll(page, `after step ${index + 1} "${line}"`);
    }

    const ended = view(pack, state).ended;
    expect(ended?.win, "the walkthrough reaches a winning ending").toBe(true);
    const ending = page.getByRole("dialog", { name: ended?.title ?? "" });
    await expect(ending).toBeVisible();
    const score = view(pack, state).score;
    if (score) await expect(ending).toContainText(`${score.value} of ${score.max} points`);
    await expect(ending.getByRole("button", { name: "Play again" })).toBeVisible();
    await expectNoSidewaysScroll(page, "at the ending");

    test.info().annotations.push({
      type: "taps",
      description: [...routes].map(([route, n]) => `${route} ${n}`).join(", "),
    });
    expect(violations).toEqual([]);
  });
}
