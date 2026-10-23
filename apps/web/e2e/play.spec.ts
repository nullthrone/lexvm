/**
 * End-to-end: play the English demo pack (packs/locked-study) on phone-sized
 * viewports. Requires the built app with the built-in packs (see playwright.config.ts).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { waitForAutosave, watchPolicyViolations } from "./support.ts";

const PACK = "The Locked Study";

const here = (page: Page) => page.getByRole("region", { name: "Here" });
const exits = (page: Page) => page.getByRole("region", { name: "Exits" });
const sheet = (page: Page) => page.getByRole("dialog");
const transcript = (page: Page) => page.getByRole("log");

function packCard(page: Page): Locator {
  return page.getByRole("article", { name: PACK });
}

async function startNewGame(page: Page): Promise<void> {
  await packCard(page).getByRole("button", { name: "New game" }).tap();
  await expect(transcript(page)).toContainText("Entrance Hall");
}

/** Tap an object chip in the dock, then a verb in its action sheet. */
async function act(page: Page, object: string, verb: RegExp): Promise<void> {
  await here(page).getByRole("button", { name: object, exact: true }).tap();
  await sheet(page).getByRole("button", { name: verb }).tap();
  await expect(sheet(page)).toHaveCount(0);
}

/** Open the inventory drawer, tap an item, then a verb. */
async function actOnHeld(page: Page, item: RegExp, verb: RegExp): Promise<void> {
  await page.getByRole("button", { name: /^Inventory/ }).tap();
  await sheet(page).getByRole("button", { name: item }).tap();
  await sheet(page).getByRole("button", { name: verb }).tap();
}

async function go(page: Page, direction: RegExp): Promise<void> {
  await exits(page).getByRole("button", { name: direction }).tap();
}

async function say(page: Page, option: RegExp): Promise<void> {
  await page
    .getByRole("region", { name: /Conversation/ })
    .getByRole("button", { name: option })
    .tap();
}

async function expectWinningEnding(page: Page): Promise<void> {
  const ending = page.getByRole("dialog", { name: "The Observatory" });
  await expect(ending).toBeVisible();
  await expect(ending).toContainText("3 of 3 points");
  await expect(ending.getByRole("button", { name: "Back to library" })).toBeVisible();
  await expect(ending.getByRole("button", { name: "Play again" })).toBeVisible();
}

/** Content-Security-Policy and Trusted Types violations of the current test (both builds carry a policy). */
let violations: string[] = [];

test.beforeEach(async ({ page }) => {
  violations = await watchPolicyViolations(page);
  await page.goto("./");
  await expect(packCard(page)).toBeVisible();
});

test.afterEach(() => {
  expect(violations).toEqual([]);
});

const CSP = 'meta[http-equiv="Content-Security-Policy"]';

test("plays the demo to the winning ending using taps only", async ({ page }) => {
  await startNewGame(page);

  await act(page, "Graves", /^Talk/);
  await say(page, /Where is my uncle/);
  await say(page, /I see/);
  await say(page, /Nothing, thank you/);
  await expect(page.getByRole("button", { name: /^Notebook/ })).toBeVisible();

  await go(page, /west/i);
  await expect(transcript(page)).toContainText("Library");
  await act(page, "red book", /^Pull/);
  await act(page, "brass key", /^Take/);
  await go(page, /east/i);

  // Two-object verb from the inventory: "Use brass key with …" → oak door.
  await actOnHeld(page, /brass key/, /^Use/);
  await expect(sheet(page)).toContainText("Use brass key with");
  await sheet(page).getByRole("button", { name: "oak door" }).tap();
  await expect(sheet(page)).toHaveCount(0);

  await act(page, "oak door", /^Open/);
  await go(page, /north/i);
  await act(page, "desk", /^Open/);
  await act(page, "letter", /^Take/);
  await actOnHeld(page, /letter/, /^Read/);
  await expect(transcript(page)).toContainText("Perihelion");
  await go(page, /south/i);

  await act(page, "Graves", /^Talk/);
  await say(page, /Perihelion/);
  await expectWinningEnding(page);

  // Back in the library, the finished game can be continued (reviewed).
  await page.getByRole("dialog", { name: "The Observatory" }).getByRole("button", { name: "Back to library" }).tap();
  await expect(packCard(page).getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(packCard(page)).toContainText("Finished");
});

test("plays the demo with typed commands", async ({ page }) => {
  await startNewGame(page);
  await page.getByRole("button", { name: "Keyboard" }).tap();
  const input = page.getByRole("textbox", { name: "Command" });
  await expect(input).toBeVisible();

  const type = async (command: string) => {
    await input.fill(command);
    await input.press("Enter");
  };

  await type("help");
  await expect(transcript(page)).toContainText("Also understood");

  // Dialogue options can be chosen by number.
  for (const command of [
    "talk to graves",
    "1",
    "1",
    "2",
    "go west",
    "pull red book",
    "take brass key",
    "go east",
    "use brass key with oak door",
    "open oak door",
    "go north",
    "open desk",
    "take letter",
    "read letter",
    "go south",
    "talk to graves",
    "2",
  ]) {
    await type(command);
  }
  await expectWinningEnding(page);
});

test("the menu offers waiting", async ({ page }) => {
  await expect(packCard(page)).toContainText("about 5 min");
  await startNewGame(page);
  await page.getByRole("button", { name: "Menu" }).tap();
  await sheet(page).getByRole("button", { name: "Wait" }).tap();
  await expect(sheet(page)).toHaveCount(0);
  await expect(transcript(page)).toContainText("Time passes.");
  // Inside a conversation only dialogue choices work, so waiting is disabled.
  await act(page, "Graves", /^Talk/);
  await page.getByRole("button", { name: "Menu" }).tap();
  await expect(sheet(page).getByRole("button", { name: "Wait" })).toBeDisabled();
});

test("undo takes back the last move", async ({ page }) => {
  await startNewGame(page);
  await go(page, /west/i);
  await expect(page.getByRole("button", { name: "Look around: Library" })).toBeVisible();
  await expect(transcript(page)).toContainText("Shelves full of unread classics");
  await page.getByRole("button", { name: "Undo" }).tap();
  await expect(page.getByRole("button", { name: "Look around: Entrance Hall" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  // The undone move's output goes too, also after leaving the game screen and coming back.
  await expect(transcript(page)).not.toContainText("Shelves full of unread classics");
  await page.getByRole("button", { name: "Menu" }).tap();
  await sheet(page).getByRole("button", { name: "Settings" }).tap();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Look around: Entrance Hall" })).toBeVisible();
  await expect(transcript(page)).not.toContainText("Shelves full of unread classics");
});

test("a link to a new game asks before it replaces the saved one", async ({ page }) => {
  await startNewGame(page);
  await go(page, /west/i);
  await expect(page.getByRole("button", { name: "Look around: Library" })).toBeVisible();
  await page.goto("./#/play/builtin/locked-study/new");
  const confirm = page.getByRole("dialog", { name: "Start a new game?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).tap();
  // The saved game continues.
  await expect(page.getByRole("button", { name: "Look around: Library" })).toBeVisible();
  await expect(page).toHaveURL(/#\/play\/builtin\/locked-study$/);
});

test("works offline after the first visit", async ({ page, context }) => {
  await expect(page.getByText("Ready offline ✓")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(packCard(page)).toBeVisible();
  await startNewGame(page);
  await act(page, "Graves", /^Talk/);
  await expect(page.getByRole("region", { name: /Conversation/ })).toBeVisible();
  await context.setOffline(false);
});

test("the single-file offline version runs from file://", async ({ page }) => {
  const file = fileURLToPath(new URL("../dist/lexvm-offline.html", import.meta.url));
  await page.goto(pathToFileURL(file).href);
  await expect(packCard(page)).toBeVisible();
  await expect(page.getByText(/Offline edition/)).toBeVisible();
  // Inline code runs by hash only; nothing may be loaded from anywhere.
  const policy = await page.locator(CSP).getAttribute("content");
  expect(policy).toContain("default-src 'none'");
  expect(policy).toMatch(/script-src 'sha256-[^']+' 'sha256-[^']+';/);
  expect(policy).toContain("require-trusted-types-for 'script'");
  await startNewGame(page);
  await go(page, /west/i);
  await expect(transcript(page)).toContainText("Library");
  await act(page, "red book", /^Pull/);
  await page.getByRole("button", { name: "Library", exact: true }).tap();
  await page.getByRole("button", { name: "Create your own" }).tap();
  await expect(page.getByRole("heading", { name: "Create your own adventure" })).toBeVisible();
});

test("the PWA runs under its Content-Security-Policy", async ({ page }) => {
  const policy = await page.locator(CSP).getAttribute("content");
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("script-src 'self' 'sha256-");
  expect(policy).toContain("trusted-types lexvm");
  // The service worker registers through the Trusted Types policy.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined))
    .toBe(true);
  await startNewGame(page);
  await act(page, "Graves", /^Talk/);
  await say(page, /Where is my uncle/);
  // The create screen is a lazily loaded chunk with its own code.
  await page.getByRole("button", { name: "Library", exact: true }).tap();
  await page.getByRole("button", { name: "Create your own" }).tap();
  await expect(page.getByRole("heading", { name: "Create your own adventure" })).toBeVisible();
});

test("imports a pasted pack, checks its walkthrough and plays it", async ({ page }) => {
  // Without playtime, the library card shows the estimate computed at import.
  const yaml = readFileSync(fileURLToPath(new URL("../../../packs/locked-study/pack.yaml", import.meta.url)), "utf8")
    .replace("id: locked-study", "id: my-study")
    .replace("title: The Locked Study", "title: My Study")
    .replace(/^playtime: \d+\n/m, "");
  await page.getByRole("button", { name: "Create your own" }).tap();
  await expect(page.getByRole("heading", { name: "Create your own adventure" })).toBeVisible();
  await page.getByRole("textbox", { name: /paste here/i }).fill(yaml);
  await page.getByRole("button", { name: "Check and import" }).tap();
  await expect(page.getByText(/Walkthrough verified: 17 moves/)).toBeVisible();
  await expect(page.getByText(/Estimated play time: about \d+ min \(speedrun: \d+ min\)/)).toBeVisible();
  await expect(page.getByText(/Suggest playtime: \d+/)).toBeVisible();
  await expect(page.getByText("“My Study” is now in your library.")).toBeVisible();
  await page.getByRole("button", { name: "Play now" }).tap();
  await expect(transcript(page)).toContainText("Entrance Hall");

  await page.getByRole("button", { name: "Library", exact: true }).tap();
  const card = page.getByRole("article", { name: "My Study" });
  await expect(card).toContainText("imported");
  await expect(card).toContainText(/about \d+ min/);
  await card.getByRole("button", { name: /Delete/ }).tap();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).tap();
  await expect(card).toHaveCount(0);
});

test("two tabs on one game do not silently overwrite each other's progress", async ({ page, context }) => {
  await startNewGame(page);
  await go(page, /west/i);
  await expect(page.getByRole("button", { name: "Look around: Library" })).toBeVisible();

  // A second tab continues the same game and plays on.
  const other = await context.newPage();
  await other.goto("./#/play/builtin/locked-study");
  await expect(other.getByRole("button", { name: "Look around: Library" })).toBeVisible();
  await other.getByRole("region", { name: "Here" }).getByRole("button", { name: "red book", exact: true }).tap();
  await other.getByRole("dialog").getByRole("button", { name: /^Pull/ }).tap();
  await expect(other.getByLabel("Score: 1 of 3")).toBeVisible();

  // The first tab, still before that move, moves too: it asks instead of overwriting.
  await go(page, /east/i);
  const question = page.getByRole("dialog", { name: "Continued in another tab" });
  await expect(question).toBeVisible();
  await question.getByRole("button", { name: "Continue from there" }).tap();
  await expect(page.getByRole("button", { name: "Look around: Library" })).toBeVisible();
  await expect(page.getByLabel("Score: 1 of 3")).toBeVisible();
  await other.close();
});

const CLUE_PACK = `format: lexvm-pack/1
id: zollkanal
version: 1.0.0
title: Am Zollkanal
description: Zwei Notizen, ein Schluss.
language: de
author: tests
license: CC0-1.0
start: { room: kai }
flags: { geloest: false }
rooms:
  kai: { name: Am Kai, description: Regen auf dem Kopfsteinpflaster. }
objects:
  los: { name: Los 4471, location: inventory, clue: true, description: Eine Losnummer auf einer Kiste. }
  liste: { name: Löschliste, location: inventory, clue: true, description: "Zweihundert Kisten, gelöscht am Donnerstag." }
  schirm: { name: Schirm, location: inventory, portable: true }
rules:
  - on: { verb: use, object: los, with: liste }
    do: [{ say: "Das Los kam am Donnerstag an Land." }, { end: geloest }]
hints:
  - { id: h, until: { flag: geloest }, steps: [Kombiniere das Los mit der Löschliste.] }
endings:
  geloest: { title: Gelöst, text: Der Fall ist klar., win: true }
walkthrough: [use los liste]
`;

test("clues in the notebook are combined with “Kombinieren mit …”", async ({ page }) => {
  await page.getByRole("button", { name: "Create your own" }).tap();
  await page.getByRole("textbox", { name: /paste here/i }).fill(CLUE_PACK);
  await page.getByRole("button", { name: "Check and import" }).tap();
  await page.getByRole("button", { name: "Play now" }).tap();
  await expect(transcript(page)).toContainText("Am Kai");

  await page.getByRole("button", { name: /^Notebook/ }).tap();
  await expect(sheet(page)).toContainText(
    "Tippe einen Eintrag an und wähle »Kombinieren mit …«, um Schlüsse zu ziehen.",
  );
  await expect(sheet(page)).toContainText("Eine Losnummer auf einer Kiste.");
  await sheet(page)
    .getByRole("button", { name: /Los 4471/ })
    .tap();
  await sheet(page).getByRole("button", { name: "Kombinieren mit …" }).tap();
  await expect(sheet(page)).toContainText("Los 4471 kombinieren mit …");
  // The other clue comes first.
  const chips = sheet(page).locator("[data-object]");
  await expect(chips.first()).toHaveAttribute("data-object", "liste");
  await chips.first().tap();
  await expect(transcript(page)).toContainText("Das Los kam am Donnerstag an Land.");
  await expect(page.getByRole("dialog", { name: "Gelöst" })).toBeVisible();
});

test("continues the autosaved game after a reload", async ({ page }) => {
  await startNewGame(page);
  await go(page, /west/i);
  await act(page, "red book", /^Pull/);
  // The autosave is asynchronous: reload only once both moves are stored.
  await waitForAutosave(page, 2);
  await page.reload();
  await expect(page.getByRole("button", { name: "Look around: Library" })).toBeVisible();
  // The transcript is rebuilt by replaying the command log.
  await expect(transcript(page)).toContainText("The book tilts forward");
  await expect(here(page).getByRole("button", { name: "brass key", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Library", exact: true }).tap();
  await packCard(page).getByRole("button", { name: "Continue" }).tap();
  await expect(page.getByRole("button", { name: "Look around: Library" })).toBeVisible();
  await expect(page.getByLabel("Score: 1 of 3")).toBeVisible();
});

test("exports and imports a saved game", async ({ page }) => {
  await startNewGame(page);
  await go(page, /west/i);

  await page.getByRole("button", { name: "Menu" }).tap();
  const downloading = page.waitForEvent("download");
  await sheet(page).getByRole("button", { name: "Export saved game" }).tap();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^locked-study-\d{4}-\d{2}-\d{2}-\d{4}\.lexsave\.json$/);
  const file = await download.path();

  await go(page, /east/i);
  await expect(page.getByRole("button", { name: "Look around: Entrance Hall" })).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).tap();
  const choosing = page.waitForEvent("filechooser");
  await sheet(page).getByRole("button", { name: "Import saved game" }).tap();
  await (await choosing).setFiles(file);
  await expect(page.getByRole("button", { name: "Look around: Library" })).toBeVisible();
  await expect(transcript(page)).toContainText("Saved game loaded.");
});
