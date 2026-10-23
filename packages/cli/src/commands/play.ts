import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import {
  type Command,
  type GameState,
  hint,
  type MetaCommand,
  newGame,
  type ObjectView,
  type Pack,
  parseCanonical,
  parseCommand,
  renderPlain,
  step,
  type View,
  view,
} from "@lexvm/engine";
import { flag, parseArgs, stringOption, UsageError } from "../args.ts";
import { fillText, type PlayText, playText } from "../play-text.ts";
import { compileSource, readPackSource } from "../sources.ts";
import { clean, color, err, formatDiagnostic } from "../term.ts";

export const PLAY_HELP = `Usage: lexvm play <packDir|file.yaml|file.lexpack.json> [options]

Play a content pack in the terminal. After every turn a compact block lists
the room, the objects here (id "name" [verbs]), inventory, clues and exits,
or the numbered dialogue options.

Input: free text in the pack's language ("take the key"), canonical commands
with ids ("use brass_key study_door", "go north", "choose ask_uncle"), a
number to pick a dialogue option, or a meta command: undo, restart, hint,
help, quit (or the pack language's words for them). Game texts are in the
pack's language.

Without a terminal (piped stdin) or with --commands/--file, all lines are run
and the full transcript is printed.

Options:
  --commands "<a; b>"   Run these commands (separated by ';' or newlines)
  --file <path>         Run the commands in this file (one per line, # comments)
  --canonical           Interpret lines as canonical command strings only;
                        exit 1 if any command is rejected
  --transcript <path>   Also write the transcript to this file
  -h, --help            Show this help`;

const META_WORDS: Record<string, MetaCommand> = {
  undo: "undo",
  restart: "restart",
  hint: "hint",
  help: "help",
  quit: "quit",
  exit: "quit",
};

function objectLabel(o: ObjectView): string {
  return `${o.id} "${o.name}"${o.verbs.length > 0 ? ` [${o.verbs.join(" ")}]` : ""}`;
}

/**
 * The affordance block printed after each turn: what a tap UI would offer,
 * labelled in the pack's language (`t`, English by default). Clues show their
 * verbs like every other object: `use` combines two of them.
 */
export function affordances(v: View, t: PlayText = playText("en")): string[] {
  if (v.ended !== null) {
    const score = v.score === null ? "" : fillText(t.endScore, { value: v.score.value, max: v.score.max });
    return [fillText(t.ended, { title: v.ended.title, result: v.ended.win ? t.won : t.lost, score })];
  }
  if (v.dialogue !== null) {
    const npc = v.dialogue.npc ? fillText(t.talkingWith, { npc: v.dialogue.npc }) : "";
    const lines = [fillText(t.talking, { npc })];
    v.dialogue.options.forEach((o, i) => {
      lines.push(`   ${i + 1}) ${o.id}: ${o.text}`);
    });
    return lines;
  }
  const exits = v.exits.map((e) => (e.label === e.id ? e.id : `${e.id} (${e.label})`)).join(", ") || t.none;
  const score = v.score === null ? "" : ` | ${t.score} ${v.score.value}/${v.score.max}`;
  const items = v.inventory.filter((o) => o.kind !== "clue");
  const clues = v.inventory.filter((o) => o.kind === "clue");
  const lines = [`-- ${v.room.name} (${v.room.id}) | ${t.exits}: ${exits}${score}`];
  lines.push(`   ${t.here}: ${v.objects.map(objectLabel).join("; ") || t.nothing}`);
  lines.push(`   ${t.inventory}: ${items.map(objectLabel).join("; ") || t.empty}`);
  if (clues.length > 0) lines.push(`   ${t.clues}: ${clues.map(objectLabel).join("; ")}`);
  return lines;
}

/** One game in the terminal. Writes to stdout and keeps a plain-text transcript. */
class Session {
  readonly pack: Pack;
  readonly canonical: boolean;
  readonly t: PlayText;
  state!: GameState;
  history: GameState[] = [];
  hintProgress = new Map<string, number>();
  transcript: string[] = [];
  /** A --canonical command was rejected or malformed. */
  failed = false;
  quit = false;

  constructor(pack: Pack, canonical: boolean) {
    this.pack = pack;
    this.canonical = canonical;
    this.t = playText(pack.language);
  }

  /** Print a line (pack text included, so control characters are made visible first). */
  emit(text: string, style?: (s: string) => string): void {
    const safe = clean(text);
    this.transcript.push(safe);
    process.stdout.write(`${style ? style(safe) : safe}\n`);
  }

  start(): void {
    const game = newGame(this.pack);
    this.state = game.state;
    this.history = [];
    this.hintProgress.clear();
    this.emit(renderPlain(game.output).trimEnd());
    this.status();
  }

  status(): void {
    for (const line of affordances(view(this.pack, this.state), this.t)) this.emit(line, color.dim);
  }

  /** Handle one input line. `echo`: print the line (non-interactive mode). */
  input(raw: string, echo: boolean): void {
    const text = raw.trim();
    if (text === "" || text.startsWith("#")) return;
    // "»" marks raw input; the engine's own echo block shows how it was understood.
    if (echo) this.emit(`» ${text}`, color.bold);
    else this.transcript.push(clean(`» ${text}`));

    const word = text.toLowerCase();
    const meta = Object.hasOwn(META_WORDS, word) ? META_WORDS[word] : undefined;
    if (meta !== undefined) {
      this.meta(meta);
      return;
    }
    const command = this.resolve(text);
    if (command !== null) this.execute(command);
  }

  private resolve(text: string): Command | null {
    // A number picks a dialogue option, like tapping it; the engine's parser knows the options
    // and words its error in the pack's language.
    if (this.state.dialogue !== null && /^\d+$/.test(text)) {
      const parsed = parseCommand(this.pack, this.state, text);
      if (parsed.ok && "command" in parsed) return parsed.command;
      if (!parsed.ok) this.emit(parsed.message);
      return null;
    }
    if (this.canonical) {
      const command = parseCanonical(text);
      if (command === null) {
        this.emit(fillText(this.t.malformed, { text }));
        this.failed = true;
      }
      return command;
    }
    const parsed = parseCommand(this.pack, this.state, text);
    if (parsed.ok) {
      if ("meta" in parsed) {
        this.meta(parsed.meta);
        return null;
      }
      return parsed.command;
    }
    // Ids from the affordance block are accepted too ("take brass_key"), but only when the
    // parser did not understand the words: its not-here / incomplete / ambiguous messages are
    // better than the engine's rejection of the same command.
    const understood = parsed.error !== "unknown-verb" && parsed.error !== "unknown-object";
    const canonical = understood && !text.includes("_") ? null : parseCanonical(text);
    if (canonical !== null && this.isKnownCommand(canonical)) return canonical;
    this.emit(parsed.message);
    if (parsed.candidates && parsed.candidates.length > 0) {
      this.emit(`   candidates: ${parsed.candidates.map((c) => `${c.id} "${c.name}"`).join("; ")}`);
    }
    return null;
  }

  private isKnownCommand(command: Command): boolean {
    // "go <exit>" and "choose <option>" are canonical in every language, like the ids they take.
    if (command.verb === "go" || command.verb === "choose") return command.object !== undefined;
    const verbs = new Set(view(this.pack, this.state).verbs.map((v) => v.id));
    if (!verbs.has(command.verb)) return false;
    return [command.object, command.with].every((id) => id === undefined || Object.hasOwn(this.pack.objects, id));
  }

  private execute(command: Command): void {
    const result = step(this.pack, this.state, command);
    const output = renderPlain(result.output).trimEnd();
    if (output !== "") this.emit(output);
    if (result.status === "ok") {
      this.history.push(this.state);
      this.state = result.state;
    } else if (this.canonical) {
      this.failed = true;
    }
    this.status();
  }

  private meta(meta: MetaCommand): void {
    switch (meta) {
      case "undo": {
        const previous = this.history.pop();
        if (previous === undefined) {
          this.emit(this.t.nothingToUndo);
          return;
        }
        this.state = previous;
        this.emit(this.t.undone);
        this.status();
        return;
      }
      case "restart":
        this.emit(this.t.restarting);
        this.start();
        return;
      case "hint":
        this.showHint();
        return;
      case "help":
        this.showHelp();
        return;
      case "quit":
        this.quit = true;
        return;
      default:
        this.emit(this.t.noSaving);
    }
  }

  private showHint(): void {
    const current = hint(this.pack, this.state);
    if (current === null || current.steps.length === 0) {
      this.emit(this.t.noHint);
      return;
    }
    const shown = this.hintProgress.get(current.id) ?? 0;
    const index = Math.min(shown, current.steps.length - 1);
    this.hintProgress.set(current.id, index + 1);
    const more = index + 1 < current.steps.length ? this.t.hintMore : "";
    const text = fillText(this.t.hint, { i: index + 1, n: current.steps.length, text: current.steps[index] ?? "" });
    this.emit(`${text}${more}`);
  }

  private showHelp(): void {
    const h = this.t.help;
    const v = view(this.pack, this.state);
    const verbs = v.verbs.map((verb) => {
      const shape =
        verb.arity === 0 ? "" : verb.arity === 1 ? ` ${h.object}` : ` ${h.object} ${verb.prep ?? h.with} ${h.object}`;
      return `${verb.label}${shape} [${verb.id}]`;
    });
    this.emit(h.intro);
    this.emit(`${h.verbs}: ${verbs.join(", ")}`);
    this.emit(h.canonical);
    this.emit(h.dialogue);
    if (Object.values(this.pack.objects).some((o) => o.clue === true)) this.emit(h.clues);
    this.emit(h.meta);
  }
}

function splitCommands(text: string): string[] {
  return text.split(/[;\n]/).map((s) => s.replace(/\r$/, ""));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function runPlay(argv: string[]): Promise<number> {
  const args = parseArgs(argv, {
    commands: { type: "string", short: "c" },
    file: { type: "string", short: "f" },
    canonical: { type: "boolean" },
    transcript: { type: "string", short: "t" },
    help: { type: "boolean", short: "h" },
  });
  if (flag(args, "help")) {
    process.stdout.write(`${PLAY_HELP}\n`);
    return 0;
  }
  if (args.positionals.length !== 1) throw new UsageError("play needs exactly one pack");
  const target = args.positionals[0]!;
  const source = readPackSource(target);
  const result = compileSource(source);
  if (result.pack === null) {
    for (const d of result.diagnostics) if (d.severity === "error") err(formatDiagnostic(d, source.baseDir, target));
    err(clean(`${target} is not a valid pack; run "lexvm validate ${target}" for details.`));
    return 1;
  }

  const session = new Session(result.pack, flag(args, "canonical"));
  const commandsArg = stringOption(args, "commands");
  const fileArg = stringOption(args, "file");
  let batch: string[] | null = null;
  if (commandsArg !== undefined) batch = splitCommands(commandsArg);
  if (fileArg !== undefined) batch = [...(batch ?? []), ...readFileSync(fileArg, "utf8").split(/\r?\n/)];
  if (batch === null && process.stdin.isTTY !== true) batch = (await readStdin()).split(/\r?\n/);

  try {
    session.start();
    if (batch !== null) {
      for (const line of batch) {
        session.input(line, true);
        if (session.quit) break;
      }
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "» " });
      rl.prompt();
      for await (const line of rl) {
        session.input(line, false);
        if (session.quit) break;
        rl.prompt();
      }
      rl.close();
    }
  } catch (e) {
    err(clean(`engine error: ${e instanceof Error ? e.message : String(e)}`));
    session.failed = true;
  } finally {
    const transcriptPath = stringOption(args, "transcript");
    if (transcriptPath !== undefined) writeFileSync(transcriptPath, `${session.transcript.join("\n")}\n`);
  }
  return session.failed ? 1 : 0;
}
