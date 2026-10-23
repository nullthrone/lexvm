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
import { compileSource, readPackSource } from "../sources.ts";
import { color, err, formatDiagnostic } from "../term.ts";

export const PLAY_HELP = `Usage: lexvm play <packDir|file.yaml|file.lexpack.json> [options]

Play a content pack in the terminal. After every turn a compact block lists
the room, the objects here (id "name" [verbs]), inventory, clues and exits,
or the numbered dialogue options.

Input: free text in the pack's language ("take the key"), canonical commands
with ids ("use brass_key study_door", "go north", "choose ask_uncle"), a
number to pick a dialogue option, or a meta command: undo, restart, hint,
help, quit.

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

/** The affordance block printed after each turn: what a tap UI would offer. */
export function affordances(v: View): string[] {
  if (v.ended !== null) {
    const score = v.score === null ? "" : `, score ${v.score.value}/${v.score.max}`;
    return [`-- THE END: ${v.ended.title} (${v.ended.win ? "won" : "lost"}${score}). Type restart, undo or quit.`];
  }
  if (v.dialogue !== null) {
    const lines = [`-- talking${v.dialogue.npc ? ` to ${v.dialogue.npc}` : ""}; pick a number or "choose <id>":`];
    v.dialogue.options.forEach((o, i) => {
      lines.push(`   ${i + 1}) ${o.id}: ${o.text}`);
    });
    return lines;
  }
  const exits = v.exits.map((e) => (e.label === e.id ? e.id : `${e.id} (${e.label})`)).join(", ") || "none";
  const score = v.score === null ? "" : ` | score ${v.score.value}/${v.score.max}`;
  const items = v.inventory.filter((o) => o.kind !== "clue");
  const clues = v.inventory.filter((o) => o.kind === "clue");
  const lines = [`-- ${v.room.name} (${v.room.id}) | exits: ${exits}${score}`];
  lines.push(`   here: ${v.objects.map(objectLabel).join("; ") || "nothing"}`);
  lines.push(`   inventory: ${items.map(objectLabel).join("; ") || "empty"}`);
  if (clues.length > 0) lines.push(`   clues: ${clues.map((o) => `${o.id} "${o.name}"`).join("; ")}`);
  return lines;
}

/** One game in the terminal. Writes to stdout and keeps a plain-text transcript. */
class Session {
  readonly pack: Pack;
  readonly canonical: boolean;
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
  }

  emit(text: string, style?: (s: string) => string): void {
    this.transcript.push(text);
    process.stdout.write(`${style ? style(text) : text}\n`);
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
    for (const line of affordances(view(this.pack, this.state))) this.emit(line, color.dim);
  }

  /** Handle one input line. `echo`: print the line (non-interactive mode). */
  input(raw: string, echo: boolean): void {
    const text = raw.trim();
    if (text === "" || text.startsWith("#")) return;
    // "»" marks raw input; the engine's own echo block shows how it was understood.
    if (echo) this.emit(`» ${text}`, color.bold);
    else this.transcript.push(`» ${text}`);

    const meta = META_WORDS[text.toLowerCase()];
    if (meta !== undefined) {
      this.meta(meta);
      return;
    }
    const command = this.resolve(text);
    if (command !== null) this.execute(command);
  }

  private resolve(text: string): Command | null {
    // A number picks a dialogue option, like tapping it.
    if (this.state.dialogue !== null && /^\d+$/.test(text)) {
      const options = view(this.pack, this.state).dialogue?.options ?? [];
      const option = options[Number(text) - 1];
      if (option !== undefined) return { verb: "choose", object: option.id };
      this.emit(`There is no option ${text}.`);
      return null;
    }
    if (this.canonical) {
      const command = parseCanonical(text);
      if (command === null) {
        this.emit(`Malformed canonical command: "${text}" (expected "verb [object [with]]" with ids).`);
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
    const verbs = new Set(view(this.pack, this.state).verbs.map((v) => v.id));
    if (!verbs.has(command.verb)) return false;
    if (command.verb === "go" || command.verb === "choose") return true;
    return [command.object, command.with].every((id) => id === undefined || this.pack.objects[id] !== undefined);
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
          this.emit("Nothing to undo.");
          return;
        }
        this.state = previous;
        this.emit("Undone.");
        this.status();
        return;
      }
      case "restart":
        this.emit("Restarting.");
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
        this.emit("Saving and loading are not available in the terminal player; use undo and restart.");
    }
  }

  private showHint(): void {
    const current = hint(this.pack, this.state);
    if (current === null || current.steps.length === 0) {
      this.emit("No hint right now.");
      return;
    }
    const shown = this.hintProgress.get(current.id) ?? 0;
    const index = Math.min(shown, current.steps.length - 1);
    this.hintProgress.set(current.id, index + 1);
    const more = index + 1 < current.steps.length ? " (type hint again for more)" : "";
    this.emit(`Hint ${index + 1}/${current.steps.length}: ${current.steps[index]}${more}`);
  }

  private showHelp(): void {
    const v = view(this.pack, this.state);
    const verbs = v.verbs.map((verb) => {
      const shape =
        verb.arity === 0 ? "" : verb.arity === 1 ? " <object>" : ` <object> ${verb.prep ?? "with"} <object>`;
      return `${verb.id}${shape} (${verb.label})`;
    });
    this.emit("Type a command in the pack's language, a canonical command with ids, or a meta command.");
    this.emit(`Verbs: ${verbs.join(", ")}`);
    this.emit(
      'Canonical examples: "look", "look brass_key", "take brass_key", "use brass_key study_door", "go north".',
    );
    this.emit('In a dialogue: type the option number or "choose <option_id>".');
    this.emit("Meta: undo, restart, hint (repeat for the next step), help, quit.");
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
    err(`${target} is not a valid pack; run "lexvm validate ${target}" for details.`);
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
    err(`engine error: ${e instanceof Error ? e.message : String(e)}`);
    session.failed = true;
  } finally {
    const transcriptPath = stringOption(args, "transcript");
    if (transcriptPath !== undefined) writeFileSync(transcriptPath, `${session.transcript.join("\n")}\n`);
  }
  return session.failed ? 1 : 0;
}
