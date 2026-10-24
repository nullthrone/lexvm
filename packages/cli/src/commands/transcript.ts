import { writeFileSync } from "node:fs";
import { walkthroughTranscript } from "@lexvm/engine";
import { flag, parseArgs, stringOption, UsageError } from "../args.ts";
import { compileSource, readPackSource } from "../sources.ts";
import { clean, err, formatDiagnostic } from "../term.ts";

export const TRANSCRIPT_HELP = `Usage: lexvm transcript <packDir|file.yaml|file.lexpack.json> [options]

Replay the pack's walkthrough and print everything a player reads along it,
as Markdown: room titles as headings, the player's commands as quotes. This is
the text to read (or give to an editor) when reviewing the story: can a reader
follow what happens, and why?

Options:
  --out <path>   Write the transcript to this file instead of stdout
  -h, --help     Show this help

Exit codes: 0 the walkthrough reaches a winning ending, 1 it does not or the
pack is invalid, 2 usage error.`;

export function runTranscript(argv: string[]): number {
  const args = parseArgs(argv, {
    out: { type: "string", short: "o" },
    help: { type: "boolean", short: "h" },
  });
  if (flag(args, "help")) {
    process.stdout.write(`${TRANSCRIPT_HELP}\n`);
    return 0;
  }
  if (args.positionals.length !== 1) throw new UsageError("transcript needs exactly one pack");
  const target = args.positionals[0]!;
  const source = readPackSource(target);
  const result = compileSource(source);
  if (result.pack === null) {
    for (const d of result.diagnostics) if (d.severity === "error") err(formatDiagnostic(d, source.baseDir, target));
    err(clean(`${target} is not a valid pack; run "lexvm validate ${target}" for details.`));
    return 1;
  }
  const transcript = walkthroughTranscript(result.pack);
  const outPath = stringOption(args, "out");
  if (outPath === undefined) process.stdout.write(clean(transcript.markdown));
  else writeFileSync(outPath, transcript.markdown);
  if (!transcript.ok) err(`${target}: the walkthrough does not reach a winning ending; the transcript is partial.`);
  return transcript.ok ? 0 : 1;
}
