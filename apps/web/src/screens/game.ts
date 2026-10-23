/**
 * The game screen: top bar, transcript, dock. Owns the running GameSession,
 * autosaves after every accepted command and keeps an in-memory undo stack.
 */
import {
  type Command,
  commandLabel,
  type MetaCommand,
  type OutputBlock,
  objectDescription,
  PackError,
  parseCommand,
  type SaveGame,
  type View,
} from "@lexvm/engine";
import { navigate, replaceRouteSilently, type Screen } from "../app.ts";
import { kindLabel, openActionSheet } from "../components/actionSheet.ts";
import { choiceDialog, confirmDialog } from "../components/confirm.ts";
import { Dock } from "../components/dock.ts";
import { openEndingCard } from "../components/endingCard.ts";
import { openHintModal } from "../components/hintModal.ts";
import { closeAllSheets, openSheet, type SheetHandle } from "../components/sheet.ts";
import { toast } from "../components/toast.ts";
import { Transcript } from "../components/transcript.ts";
import { h, replaceChildren } from "../dom.ts";
import { GameSession, replayLog, restoreSession, UNDO_LIMIT } from "../game/session.ts";
import { type StringKey, t } from "../i18n.ts";
import { type IconName, icon } from "../icons.ts";
import { clueTexts, findObject, optionByNumber, showNotebook } from "../logic/actions.ts";
import { MAX_SAVE_FILE, parseSaveFile, type StoredSave, saveFileName, serializeSave } from "../logic/saves.ts";
import { blockText, disambiguate, stripMarkup } from "../logic/text.ts";
import { engine } from "../services/engine.ts";
import { downloadText, pickFiles, readText } from "../services/files.ts";
import { rejectFeedback, tapFeedback } from "../services/haptics.ts";
import { findEntry, type LibraryEntry, loadEntryPack } from "../services/packs.ts";
import { readSave, writeSave, writeSaveIfCurrent } from "../services/saves.ts";
import { settings, updateSettings } from "../services/settings.ts";

const MAX_TURNS = 400;

interface ActiveGame {
  key: string;
  entry: LibraryEntry;
  session: GameSession;
  /** Transcript history (engine output per turn), kept so the screen can be re-mounted. */
  turns: OutputBlock[][];
  /** Number of clues the player has seen in the notebook. */
  seenClues: number;
  /**
   * `savedAt` of the stored save this tab last read or wrote (null: none). A
   * different one in storage means another tab or window has played on.
   */
  savedAt: string | null;
  /** turns.length before each undoable command, so undo also takes its output back. */
  undoTurns: number[];
}

/** The last played game survives navigation to settings/about and back. */
let active: ActiveGame | null = null;

/** Keys of games the player chose to start anew in the library (it asked already). */
const freshConfirmed = new Set<string>();

/**
 * The library calls this before opening #/play/…/new: the player confirmed
 * there (or had no save). The route alone (a link from anywhere) asks first.
 */
export function confirmFreshStart(key: string): void {
  freshConfirmed.add(key);
}

function newActive(
  key: string,
  entry: LibraryEntry,
  session: GameSession,
  turns: OutputBlock[][],
  seenClues: number,
  savedAt: string | null,
): ActiveGame {
  return { key, entry, session, turns, seenClues, savedAt, undoTurns: [] };
}

const KIND_ICON: Record<string, IconName> = {
  npc: "npc",
  container: "container",
  item: "item",
  clue: "clue",
  scenery: "scenery",
};

function errorMessage(error: unknown): string {
  if (error instanceof PackError) {
    return error.diagnostics
      .slice(0, 8)
      .map((d) => `${d.path}: ${d.message}`)
      .join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function packHasClues(game: ActiveGame): boolean {
  return Object.values(game.session.pack.objects).some((o) => o.clue === true);
}

export function createGameScreen(key: string, fresh: boolean): Screen {
  const srTitle = h("h1", { class: "visually-hidden", attrs: { tabindex: -1 }, text: t("common.loading") });
  const packTitle = h("span", { class: "topbar__pack" });
  const roomName = h("span", { class: "topbar__room" });
  const titleButton = h(
    "button",
    { class: "topbar__title", type: "button", on: { click: () => run({ verb: "look" }) } },
    packTitle,
    roomName,
  );
  const score = h("span", { class: "topbar__score", hidden: true });
  const topbar = h(
    "header",
    { class: "topbar" },
    h(
      "button",
      {
        class: "icon-button",
        type: "button",
        attrs: { "aria-label": t("nav.library") },
        on: { click: () => navigate({ name: "library" }) },
      },
      icon("back"),
    ),
    titleButton,
    score,
    h(
      "button",
      {
        class: "icon-button",
        type: "button",
        attrs: { "aria-label": t("game.menu"), "aria-haspopup": "dialog" },
        on: { click: () => openMenu() },
      },
      icon("menu"),
    ),
  );
  const stage = h(
    "main",
    { class: "game__stage" },
    h("p", { class: "game__loading muted", text: t("common.loading") }),
  );
  const el = h("div", { class: "screen screen--game" }, srTitle, topbar, stage);

  let game: ActiveGame | null = null;
  let transcript: Transcript | null = null;
  let dock: Dock | null = null;
  let view: View | null = null;
  let endingSheet: SheetHandle | null = null;
  let destroyed = false;

  const lang = () => game?.entry.language ?? "und";

  // ---------------------------------------------------------------------------
  // Error states
  // ---------------------------------------------------------------------------

  function showFatal(messageKey: StringKey, error?: unknown): void {
    if (error) console.error(error);
    closeAllSheets();
    srTitle.textContent = t(messageKey);
    replaceChildren(
      stage,
      h(
        "div",
        { class: "game__fatal" },
        h(
          "div",
          { class: "notice notice--error" },
          h("p", { class: "notice__title", text: t(messageKey) }),
          error
            ? h(
                "details",
                { class: "notice__details" },
                h("summary", { text: t("common.details") }),
                h("pre", { text: errorMessage(error) }),
              )
            : null,
          h("button", {
            class: "button",
            type: "button",
            text: t("game.toLibrary"),
            on: { click: () => navigate({ name: "library" }) },
          }),
        ),
      ),
    );
  }

  /** Run engine code; on an exception show the engine error screen. */
  function guard<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (error) {
      showFatal("game.engineError", error);
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  let conflictOpen = false;

  /**
   * Autosave. Writes only over the save this tab knows: if another tab or
   * window played on in the meantime, the player decides which game to keep.
   */
  function persist(): void {
    if (!game || conflictOpen) return;
    const current = game;
    const stored = current.session.toStored(new Date());
    const expected = current.savedAt;
    current.savedAt = stored.save.savedAt;
    void writeSaveIfCurrent(current.key, stored, expected).then((result) => {
      if (result === "conflict") void resolveConflict(current);
    });
  }

  async function resolveConflict(conflicted: ActiveGame): Promise<void> {
    if (conflictOpen || destroyed || game !== conflicted) return;
    conflictOpen = true;
    const answer = await choiceDialog({
      title: t("game.otherTabTitle"),
      message: t("game.otherTabText"),
      choices: [
        { id: "keep", label: t("game.otherTabKeep") },
        { id: "load", label: t("game.otherTabLoad"), primary: true },
      ],
    });
    conflictOpen = false;
    if (destroyed || game !== conflicted) return;
    if (answer === "keep") {
      const stored = conflicted.session.toStored(new Date());
      conflicted.savedAt = stored.save.savedAt;
      void writeSave(conflicted.key, stored);
    } else if (answer === "load") {
      // Drop this tab's game and continue from the stored one.
      if (active === conflicted) active = null;
      navigate({ name: "play", key: conflicted.key, fresh: false }, { replace: true });
    }
    // Dismissed: nothing is written; the next move asks again.
  }

  function pushTurn(output: OutputBlock[]): void {
    if (!game) return;
    game.turns.push(output);
    if (game.turns.length > MAX_TURNS) {
      const dropped = game.turns.length - MAX_TURNS;
      game.turns.splice(0, dropped);
      game.undoTurns = game.undoTurns.map((n) => Math.max(0, n - dropped));
    }
  }

  function refRenderable(id: string): boolean {
    if (!game || !view) return false;
    if (findObject(view, id)) return true;
    const session = game.session;
    try {
      return session.preview({ verb: "look", object: id }).status === "ok";
    } catch {
      return false;
    }
  }

  function refresh(): void {
    if (!game || !dock || !transcript) return;
    const current = guard(() => game?.session.view());
    if (!current) return;
    view = current;
    const counts = current.inventory.filter((o) => o.kind === "clue").length;
    roomName.textContent = current.room.name;
    titleButton.setAttribute("aria-label", `${t("game.lookAround")}: ${current.room.name}`);
    titleButton.disabled = current.dialogue !== null || current.ended !== null;
    if (current.score) {
      score.hidden = false;
      score.textContent = `${current.score.value}/${current.score.max}`;
      score.setAttribute("aria-label", t("game.score", { value: current.score.value, max: current.score.max }));
      score.title = t("game.score", { value: current.score.value, max: current.score.max });
    } else {
      score.hidden = true;
    }
    dock.update({
      view: current,
      lang: lang(),
      canUndo: game.session.canUndo,
      notebook: showNotebook(packHasClues(game), current),
      newClues: counts > game.seenClues,
      keyboard: settings.get().keyboard,
    });
    transcript.updateRefs(refRenderable);
  }

  function endingTitle(): string | undefined {
    return view?.ended?.title;
  }

  function showEnding(): void {
    if (!game || !view?.ended) return;
    const title = view.ended.title;
    const lastTurn = game.turns.at(-1) ?? [];
    const paragraphs = lastTurn
      .filter((b) => b.kind === "ending")
      .map(blockText)
      .filter((text) => text.trim() !== title.trim());
    endingSheet?.close();
    endingSheet = openEndingCard({
      title,
      paragraphs,
      lang: lang(),
      score: view.score,
      onLibrary: () => navigate({ name: "library" }),
      onPlayAgain: () => restart(false),
    });
  }

  /** Show a game. False when the engine fails on it (the error screen is shown instead). */
  function mount(newGame: ActiveGame, extraLine?: string): boolean {
    game = newGame;
    active = newGame;
    const { entry } = newGame;
    srTitle.textContent = entry.title;
    packTitle.textContent = entry.title;
    packTitle.lang = entry.language;
    roomName.lang = entry.language;
    transcript = new Transcript({
      lang: entry.language,
      label: entry.title,
      onRef: (id) => onRef(id),
    });
    dock = new Dock({
      onObject: (id) => openObject(id),
      onExit: (id) => run({ verb: "go", object: id }),
      onChoose: (id) => run({ verb: "choose", object: id }),
      onInventory: () => openInventory(false),
      onNotebook: () => openInventory(true),
      onHint: () => openHint(),
      onToggleKeyboard: () => toggleKeyboard(),
      onUndo: () => undo(),
      onSubmit: (text) => submit(text),
      onLibrary: () => navigate({ name: "library" }),
      onPlayAgain: () => restart(false),
    });
    replaceChildren(stage, transcript.el, dock.el);
    const current = guard(() => newGame.session.view());
    if (!current) return false;
    view = current;
    // Clues already held when a saved game is restored count as seen.
    if (!Number.isFinite(newGame.seenClues)) {
      newGame.seenClues = current.inventory.filter((o) => o.kind === "clue").length;
    }
    transcript.renderAll(newGame.turns, endingTitle());
    if (extraLine) transcript.appendUiLine("system", extraLine);
    refresh();
    if (view?.ended) showEnding();
    return view !== null;
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /** Execute a command. `typed` is the player's input, echoed if the engine rejects the command. */
  function run(command: Command, typed?: string): void {
    if (!game || !transcript) return;
    const session = game.session;
    const wasEnded = view?.ended !== null && view?.ended !== undefined;
    const result = guard(() => session.exec(command));
    if (!result) return;
    dock?.hideCandidates();
    if (result.status === "ok") {
      tapFeedback();
      game.undoTurns.push(game.turns.length);
      if (game.undoTurns.length > UNDO_LIMIT) game.undoTurns.splice(0, game.undoTurns.length - UNDO_LIMIT);
      persist();
    } else {
      rejectFeedback();
    }
    // Rejected commands carry no engine echo; show what was attempted.
    const output: OutputBlock[] =
      result.status === "ok" || result.output.some((b) => b.kind === "echo")
        ? result.output
        : [{ kind: "echo", spans: [{ text: typed ?? safeLabel(command) }] }, ...result.output];
    pushTurn(output);
    const next = guard(() => session.view());
    if (!next) return;
    view = next;
    transcript.appendTurn(output, { endingTitle: endingTitle() });
    refresh();
    if (!wasEnded && view?.ended) showEnding();
  }

  function safeLabel(command: Command): string {
    if (!game) return command.verb;
    try {
      return commandLabel(game.session.pack, command);
    } catch {
      return [command.verb, command.object, command.with].filter(Boolean).join(" ");
    }
  }

  function onRef(id: string): void {
    if (!view) return;
    if (findObject(view, id)) openObject(id);
    else run({ verb: "look", object: id });
  }

  /** A clue's current description, read from the pack without running a turn. */
  function clueParagraphs(id: string): string[] {
    if (!game) return [];
    try {
      return objectDescription(game.session.pack, game.session.state, id);
    } catch {
      return [];
    }
  }

  function clueText(id: string): HTMLElement | null {
    const paragraphs = clueParagraphs(id);
    if (paragraphs.length === 0) return null;
    return h("div", { class: "clue-text", lang: lang() }, ...paragraphs.map((p) => h("p", { text: p })));
  }

  function openObject(id: string): void {
    if (!view) return;
    const isClue = view.inventory.some((o) => o.id === id && o.kind === "clue");
    openActionSheet({
      view,
      lang: lang(),
      objectId: id,
      run: (command) => run(command),
      extra: isClue ? clueText(id) : null,
    });
  }

  function openInventory(notebook: boolean): void {
    if (!view || !game) return;
    const items = view.inventory.filter((o) => (notebook ? o.kind === "clue" : o.kind !== "clue"));
    if (notebook) {
      game.seenClues = items.length;
      refresh();
    }
    const sheet = openSheet({ title: notebook ? t("game.notebook") : t("game.inventory") });
    if (items.length === 0) {
      sheet.setBody(h("p", { class: "muted", text: notebook ? t("game.notebookEmpty") : t("game.inventoryEmpty") }));
      sheet.focusFirst();
      return;
    }
    // Combining entries is how deductions are made; say so where the entries are (in the pack's language,
    // like the "Combine with …" button it names).
    const combinable = notebook && items.length >= 2 && items.some((o) => o.verbs.includes("use"));
    sheet.setBody(
      combinable
        ? h("p", { class: "notebook__explainer muted", lang: lang(), text: clueTexts(lang()).explainer })
        : null,
      h(
        "ul",
        { class: "inventory" },
        ...items.map((item) =>
          h(
            "li",
            null,
            h(
              "button",
              {
                class: "inventory__item",
                type: "button",
                dataset: { object: item.id },
                on: {
                  click: () => {
                    sheet.close();
                    openObject(item.id);
                  },
                },
              },
              icon(KIND_ICON[item.kind] ?? "item"),
              h(
                "span",
                { class: "inventory__text" },
                h("span", { class: "inventory__name", lang: lang(), text: item.name }),
                notebook
                  ? h("span", { class: "inventory__desc", lang: lang(), text: clueParagraphs(item.id).join(" ") })
                  : h("span", { class: "inventory__kind", text: kindLabel(item.kind) }),
              ),
              icon("chevron", { class: "inventory__chevron" }),
            ),
          ),
        ),
      ),
    );
    sheet.focusFirst();
  }

  function openHint(): void {
    if (!game) return;
    const session = game.session;
    const current = guard(() => session.hint());
    if (current === undefined) return;
    openHintModal({
      hint: current,
      revealed: current ? session.revealedHints(current.id) : 0,
      lang: lang(),
      stepText: (step) =>
        stripMarkup(step, (id) =>
          Object.hasOwn(session.pack.objects, id) ? session.pack.objects[id]?.name : undefined,
        ),
      onReveal: (id, count) => {
        session.setRevealed(id, count);
        persist();
      },
    });
  }

  function toggleKeyboard(): void {
    updateSettings({ keyboard: !settings.get().keyboard });
    refresh();
    if (settings.get().keyboard) dock?.focusInput();
  }

  function undo(): void {
    if (!game || !transcript) return;
    if (!game.session.undo()) {
      transcript.appendUiLine("system", t("game.nothingToUndo"));
      return;
    }
    endingSheet?.close();
    persist();
    // Take the undone command's output back too, so the transcript matches the state (and a re-mount or
    // reload, which rebuild it from the log).
    const mark = game.undoTurns.pop();
    if (mark !== undefined && mark < game.turns.length) game.turns.length = mark;
    view = guard(() => game?.session.view()) ?? view;
    transcript.renderAll(game.turns, endingTitle());
    transcript.appendUiLine("system", t("game.undone"));
    refresh();
  }

  function restart(confirmFirst: boolean): void {
    void (async () => {
      if (!game || !transcript) return;
      if (
        confirmFirst &&
        !(await confirmDialog({
          title: t("game.restartTitle"),
          message: t("game.restartText"),
          confirm: t("game.restart"),
          danger: true,
        }))
      ) {
        return;
      }
      const session = game.session;
      const output = guard(() => session.restart());
      if (!output) return;
      endingSheet?.close();
      game.turns = [output];
      game.undoTurns = [];
      game.seenClues = 0;
      persist();
      refresh();
      transcript.renderAll(game.turns, endingTitle());
      transcript.updateRefs(refRenderable);
    })();
  }

  function exportSave(): void {
    if (!game) return;
    const now = new Date();
    const name = saveFileName(game.session.pack.id, now);
    downloadText(name, serializeSave(game.session.toSave(now)));
    toast(t("game.saveExported", { file: name }));
  }

  async function importSave(): Promise<void> {
    if (!game) return;
    const [file] = await pickFiles(".json,.lexsave.json,application/json");
    if (!file || !game) return;
    if (file.size > MAX_SAVE_FILE) {
      toast(t("game.saveInvalid"));
      return;
    }
    const parsed = parseSaveFile(await readText(file));
    if (!parsed.ok) {
      toast(t("game.saveInvalid"));
      return;
    }
    if (parsed.save.pack.id !== game.session.pack.id) {
      toast(t("game.saveOtherPack", { pack: parsed.save.pack.id }));
      return;
    }
    try {
      const current = game;
      const next = await restoreFrom(current.entry, current.session, {
        save: parsed.save,
        hints: current.session.hints,
      });
      if (next && !destroyed) {
        // The imported game replaces the stored one of this tab.
        next.game.savedAt = current.savedAt;
        // Only a game that could be shown is saved: a broken one must not become the autosave.
        if (mount(next.game, next.line ?? t("game.saveImported"))) persist();
      }
    } catch (error) {
      showFatal("game.engineError", error);
    }
  }

  function submit(text: string): void {
    if (!game || !transcript || !view) return;
    const session = game.session;
    const option = optionByNumber(view, text);
    if (option) {
      run({ verb: "choose", object: option });
      return;
    }
    const parsed = guard(() => parseCommand(session.pack, session.state, text));
    if (!parsed) return;
    if (parsed.ok && "command" in parsed) {
      run(parsed.command, text);
      return;
    }
    if (parsed.ok && "meta" in parsed) {
      handleMeta(parsed.meta);
      return;
    }
    if (parsed.ok) return;
    rejectFeedback();
    transcript.appendUiLine("echo", text, { lang: lang() });
    transcript.appendUiLine("system", parsed.message, { lang: lang() });
    if (parsed.error === "ambiguous" && parsed.candidates && parsed.candidates.length > 0) {
      dock?.showCandidates(parsed.candidates, lang(), (id, name) => {
        const rewritten = disambiguate(text, name);
        if (rewritten) {
          const again = guard(() => parseCommand(session.pack, session.state, rewritten));
          if (again?.ok && "command" in again) {
            run(again.command, rewritten);
            return;
          }
        }
        if (view && findObject(view, id)) openObject(id);
      });
    }
  }

  function handleMeta(meta: MetaCommand): void {
    switch (meta) {
      case "undo":
        undo();
        return;
      case "restart":
        restart(true);
        return;
      case "hint":
        openHint();
        return;
      case "save":
        exportSave();
        return;
      case "load":
        void importSave();
        return;
      case "quit":
        navigate({ name: "library" });
        return;
      default: {
        const examples = lang().startsWith("de") ? t("game.helpExamples.de") : t("game.helpExamples.en");
        transcript?.appendUiLine("system", t("game.help"));
        transcript?.appendUiLine("system", examples);
        transcript?.appendUiLine("system", t("game.helpMeta"));
      }
    }
  }

  function openMenu(): void {
    if (!game) return;
    const sheet = openSheet({ title: t("game.menu"), className: "menu-sheet" });
    const item = (iconName: IconName, label: string, action: () => void, disabled = false) =>
      h(
        "li",
        null,
        h(
          "button",
          {
            class: "menu__item",
            type: "button",
            attrs: { disabled },
            on: {
              click: () => {
                sheet.close();
                action();
              },
            },
          },
          icon(iconName),
          h("span", { text: label }),
        ),
      );
    const ended = view?.ended !== null && view?.ended !== undefined;
    // `wait` (arity 0) is an offered action like look around; it lives here to keep the dock uncluttered.
    const canWait = !ended && view?.dialogue === null && (view?.verbs.some((v) => v.id === "wait") ?? false);
    sheet.setBody(
      h(
        "ul",
        { class: "menu" },
        item("hourglass", t("game.wait"), () => run({ verb: "wait" }), !canWait),
        item("bulb", t("game.hint"), openHint, ended),
        item("undo", t("game.undo"), undo, !game.session.canUndo),
        item("restart", t("game.restart"), () => restart(true)),
        item("download", t("game.exportSave"), exportSave),
        item("upload", t("game.importSave"), () => void importSave()),
        item("sliders", t("nav.settings"), () => navigate({ name: "settings" })),
        item("book", t("nav.library"), () => navigate({ name: "library" })),
      ),
    );
    sheet.focusFirst();
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /** Restore a save, asking to replay if the pack changed. Null if the player cancelled. */
  async function restoreFrom(
    entry: LibraryEntry,
    base: { pack: GameSession["pack"]; hash: string },
    stored: StoredSave,
  ): Promise<{ game: ActiveGame; line?: string } | null> {
    const result = restoreSession(engine, base.pack, base.hash, stored);
    const savedAt = stored.save.savedAt;
    if (result.kind === "restored") {
      return { game: newActive(key, entry, result.session, result.turns, Number.POSITIVE_INFINITY, savedAt) };
    }
    if (result.kind === "state-only") {
      const look = result.session.preview({ verb: "look" });
      const turns = look.status === "ok" ? [look.output.filter((b) => b.kind !== "echo")] : [];
      return { game: newActive(key, entry, result.session, turns, Number.POSITIVE_INFINITY, savedAt) };
    }
    if (result.kind === "repaired") {
      console.warn("LexVM: saved state rejected", result.problems);
      return {
        game: newActive(key, entry, result.session, result.turns, Number.POSITIVE_INFINITY, savedAt),
        line: t("game.saveRepaired", { n: result.session.log.length }),
      };
    }
    return replayChanged(entry, base, result.save, stored.hints, savedAt);
  }

  async function replayChanged(
    entry: LibraryEntry,
    base: { pack: GameSession["pack"]; hash: string },
    save: SaveGame,
    hints: Record<string, number>,
    savedAt: string,
  ): Promise<{ game: ActiveGame; line?: string } | null> {
    const answer = await choiceDialog({
      title: t("game.packChangedTitle"),
      message: t("game.packChangedText", {
        saved: save.pack.version,
        current: base.pack.version,
        n: save.log.length,
      }),
      choices: [
        { id: "cancel", label: t("common.cancel") },
        { id: "new", label: t("library.newGame") },
        { id: "replay", label: t("game.replay"), primary: true },
      ],
    });
    if (answer === null || answer === "cancel") return null;
    if (answer === "new") {
      const started = GameSession.start(engine, base.pack, base.hash);
      return { game: newActive(key, entry, started.session, [started.output], 0, savedAt) };
    }
    const replay = replayLog(engine, base.pack, save.log);
    const session = new GameSession(engine, base.pack, base.hash, replay.state, replay.log, hints);
    return {
      game: newActive(key, entry, session, replay.turns, Number.POSITIVE_INFINITY, savedAt),
      line: t("game.replayResult", { applied: replay.applied, total: replay.total }),
    };
  }

  async function load(): Promise<void> {
    const entry = await findEntry(key);
    if (destroyed) return;
    if (!entry) {
      showFatal("game.notFound");
      return;
    }
    packTitle.textContent = entry.title;
    packTitle.lang = entry.language;
    srTitle.textContent = entry.title;
    document.title = `${entry.title} – ${t("app.name")}`;
    if (!fresh && active && active.key === key && active.entry.version === entry.version) {
      mount(active);
      return;
    }
    let loaded: Awaited<ReturnType<typeof loadEntryPack>>;
    try {
      loaded = await loadEntryPack(entry);
    } catch (error) {
      if (!destroyed) showFatal("game.loadError", error);
      return;
    }
    if (destroyed) return;
    try {
      const stored = await readSave(key);
      if (destroyed) return;
      if (fresh && stored && !freshConfirmed.has(key)) {
        // #/play/…/new from a link or a bookmark: ask before the saved game is overwritten, as the library does.
        const ok = await confirmDialog({
          title: t("library.confirmNewTitle"),
          message: t("library.confirmNewText", { title: entry.title }),
          confirm: t("library.confirmNewOk"),
          danger: true,
        });
        if (destroyed) return;
        if (!ok) {
          navigate({ name: "play", key, fresh: false }, { replace: true });
          return;
        }
      }
      freshConfirmed.delete(key);
      if (!fresh && stored) {
        const restored = await restoreFrom(entry, loaded, stored);
        if (destroyed) return;
        if (!restored) {
          navigate({ name: "library" }, { replace: true });
          return;
        }
        if (mount(restored.game, restored.line) && restored.line) persist();
        return;
      }
      const started = GameSession.start(engine, loaded.pack, loaded.hash);
      // A new game replaces the stored one the player agreed to overwrite.
      const savedAt = stored?.save.savedAt ?? null;
      if (mount(newActive(key, entry, started.session, [started.output], 0, savedAt))) persist();
      if (fresh) replaceRouteSilently({ name: "play", key, fresh: false });
    } catch (error) {
      showFatal("game.engineError", error);
    }
  }

  const onKey = (event: KeyboardEvent) => {
    if (!view?.dialogue || document.querySelector("dialog[open]")) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const option = optionByNumber(view, event.key);
    if (option) {
      event.preventDefault();
      run({ verb: "choose", object: option });
    }
  };
  document.addEventListener("keydown", onKey);

  void load();

  return {
    el,
    title: "",
    focus: srTitle,
    destroy() {
      destroyed = true;
      document.removeEventListener("keydown", onKey);
      endingSheet?.close();
    },
  };
}
