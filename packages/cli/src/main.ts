#!/usr/bin/env node
/**
 * LexVM command line. Hand-rolled argument parsing, no framework.
 * Exit codes: 0 ok, 1 errors found, 2 usage error.
 */
import { readFileSync } from "node:fs";
import { UsageError } from "./args.ts";
import { runBuild } from "./commands/build.ts";
import { runCheck } from "./commands/check.ts";
import { runNew } from "./commands/new.ts";
import { runPlay } from "./commands/play.ts";
import { runSchema } from "./commands/schema.ts";
import { runValidate } from "./commands/validate.ts";
import { err, out } from "./term.ts";

const HELP = `LexVM: deterministic, offline-first text adventures as data.

Usage: lexvm <command> [options]

Commands:
  validate   Schema and semantic checks of content packs
  build      Compile content packs to .lexpack.json plus index.json
  check      validate + walkthrough replay + state-space exploration
  play       Play a content pack in the terminal
  new        Scaffold a new content pack
  schema     Write the JSON Schema of the content pack format
  prompt     Assemble the prompt kit for any LLM
  generate   Generate a content pack with the Anthropic API
  help       Show this help

Run "lexvm <command> --help" for the options of a command.
Exit codes: 0 ok, 1 errors found, 2 usage error.`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

type Runner = (argv: string[]) => number | Promise<number>;

const COMMANDS: Record<string, Runner> = {
  validate: runValidate,
  build: runBuild,
  check: runCheck,
  play: runPlay,
  new: runNew,
  schema: runSchema,
  // Owned by the generation pipeline; loaded lazily so the other commands never need the API client.
  generate: async (argv) => (await import("./generate/index.ts")).runGenerate(argv),
  prompt: async (argv) => (await import("./generate/prompt.ts")).runPrompt(argv),
};

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    out(HELP);
    return command === undefined ? 2 : 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    out(version());
    return 0;
  }
  const run = COMMANDS[command];
  if (run === undefined) {
    err(`lexvm: unknown command "${command}". Run "lexvm help" for the list of commands.`);
    return 2;
  }
  try {
    return await run(rest);
  } catch (e) {
    if (e instanceof UsageError) {
      err(`lexvm ${command}: ${e.message}`);
      err(`Run "lexvm ${command} --help" for usage.`);
      return 2;
    }
    err(`lexvm ${command}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
