import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { PackIdSchema } from "@lexvm/engine";
import { flag, parseArgs, stringOption, UsageError } from "../args.ts";
import { color, out } from "../term.ts";
import { SCHEMA_ID, schemaFilePath } from "./schema.ts";

export const NEW_HELP = `Usage: lexvm new <pack-id> [options]

Create a minimal, valid content pack in <dir>/<pack-id>/pack.yaml: one room,
one object, one rule, one winning ending, a hint and a walkthrough. It passes
"lexvm check" and is a starting point for your own adventure.

Options:
  --dir <dir>      Parent directory (default: packs)
  --lang <de|en>   Language of the pack (default: en)
  -h, --help       Show this help`;

function titleFromId(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface Texts {
  description: string;
  intro: string;
  roomName: string;
  roomDescription: string;
  doorName: string;
  doorSynonyms: string;
  doorDescription: string;
  openSay: string;
  endingTitle: string;
  endingText: string;
  hint1: string;
  hint2: string;
}

const TEXTS: Record<"de" | "en", Texts> = {
  en: {
    description: "A new LexVM adventure.",
    intro: "Your story begins here.",
    roomName: "Small Room",
    roomDescription: "A small, bare room. Daylight shows under a wooden {door}.",
    doorName: "door",
    doorSynonyms: "[wooden door]",
    doorDescription: "A plain wooden door. It is not locked.",
    openSay: "The door swings open. Warm sunlight floods in.",
    endingTitle: "Outside",
    endingText: "You step out into the sunlight. Your adventure can begin.",
    hint1: "There is only one way out.",
    hint2: "Open the door.",
  },
  de: {
    description: "Ein neues LexVM-Abenteuer.",
    intro: "Hier beginnt deine Geschichte.",
    roomName: "Kleiner Raum",
    roomDescription: "Ein kleiner, kahler Raum. Unter einer hölzernen {door|Tür} fällt Tageslicht herein.",
    doorName: "Tür",
    doorSynonyms: "[holztür]",
    doorDescription: "Eine schlichte Holztür. Sie ist nicht verschlossen.",
    openSay: "Die Tür schwingt auf. Warmes Sonnenlicht fällt herein.",
    endingTitle: "Draußen",
    endingText: "Du trittst hinaus ins Sonnenlicht. Dein Abenteuer kann beginnen.",
    hint1: "Es gibt nur einen Weg nach draußen.",
    hint2: "Öffne die Tür.",
  },
};

export function packTemplate(id: string, lang: "de" | "en", schemaRef: string): string {
  const t = TEXTS[lang];
  return `# yaml-language-server: $schema=${schemaRef}
format: lexvm-pack/1
id: ${id}
version: 0.1.0
title: ${titleFromId(id)}
description: ${t.description}
language: ${lang}
author: Unknown
license: CC-BY-4.0
playtime: 1

start:
  room: first_room
  intro: ${t.intro}

rooms:
  first_room:
    name: ${t.roomName}
    description: ${t.roomDescription}

objects:
  door:
    name: ${t.doorName}
    synonyms: ${t.doorSynonyms}
    location: first_room
    openable: true
    open: false
    description: ${t.doorDescription}

rules:
  - id: open_door
    on: { verb: open, object: door }
    do:
      - open: door
      - say: ${t.openSay}
      - end: outside

endings:
  outside:
    title: ${t.endingTitle}
    text: ${t.endingText}
    win: true

hints:
  - id: leave
    until: { isOpen: door }
    steps:
      - ${t.hint1}
      - ${t.hint2}

walkthrough:
  - open door
`;
}

export function runNew(argv: string[]): number {
  const args = parseArgs(argv, {
    dir: { type: "string", short: "d" },
    lang: { type: "string", short: "l" },
    help: { type: "boolean", short: "h" },
  });
  if (flag(args, "help")) {
    out(NEW_HELP);
    return 0;
  }
  if (args.positionals.length !== 1) throw new UsageError("new needs exactly one pack id");
  const id = args.positionals[0]!;
  if (!PackIdSchema.safeParse(id).success) {
    throw new UsageError(`invalid pack id "${id}": use kebab-case, e.g. hamburg-1948`);
  }
  const lang = stringOption(args, "lang") ?? "en";
  if (lang !== "de" && lang !== "en") throw new UsageError(`--lang must be de or en, got "${lang}"`);
  const dir = join(stringOption(args, "dir") ?? "packs", id);
  if (existsSync(join(dir, "pack.yaml"))) {
    out(color.red(`${join(dir, "pack.yaml")} already exists; not overwriting.`));
    return 1;
  }
  mkdirSync(dir, { recursive: true });
  // Inside this repository the schema is referenced by relative path, elsewhere by URL.
  const repoRoot = dirname(dirname(schemaFilePath()));
  const schemaRef = resolve(dir).startsWith(repoRoot + sep)
    ? relative(dir, schemaFilePath()).split(sep).join("/")
    : SCHEMA_ID;
  writeFileSync(join(dir, "pack.yaml"), packTemplate(id, lang, schemaRef));
  out(`${color.green("created")}  ${join(dir, "pack.yaml")}`);
  out(`Next: npm run lexvm -- check ${dir}`);
  return 0;
}
