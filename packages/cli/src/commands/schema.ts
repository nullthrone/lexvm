import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PACK_FORMAT, PackSchema } from "@lexvm/engine";
import { flag, parseArgs, stringOption } from "../args.ts";
import { color, out } from "../term.ts";

export const SCHEMA_FILE = "schema/lexvm-pack-1.schema.json";
export const SCHEMA_ID = `https://raw.githubusercontent.com/nullthrone/lexvm/main/${SCHEMA_FILE}`;

export const SCHEMA_HELP = `Usage: lexvm schema [--out <file>]

Write the JSON Schema of the content pack format, generated from the zod
schema (input form: lenient shapes allowed, defaults optional). Editors use it
via "# yaml-language-server: $schema=../../${SCHEMA_FILE}".

Options:
  --out <file>     Output file, or - for stdout (default: ${SCHEMA_FILE})
  -h, --help       Show this help`;

/** Absolute path of the schema file in this repository. */
export function schemaFilePath(): string {
  // packages/cli/src/commands -> repository root
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..", SCHEMA_FILE);
}

type Json = Record<string, unknown>;

function isJsonObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rewrite every "$ref" through `rename`, recursively. */
function rewriteRefs(value: unknown, rename: (ref: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => rewriteRefs(v, rename));
  if (!isJsonObject(value)) return value;
  const out: Json = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === "$ref" && typeof v === "string" ? rename(v) : rewriteRefs(v, rename);
  }
  return out;
}

function hasProperties(value: unknown, ...keys: string[]): boolean {
  return isJsonObject(value) && isJsonObject(value.properties) && keys.every((k) => k in (value.properties as Json));
}

/** Conditions and effects are single-key objects: a zod refinement that JSON Schema output cannot carry. */
function addSingleKeyRule(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(addSingleKeyRule);
  if (!isJsonObject(value)) return value;
  const out: Json = {};
  for (const [k, v] of Object.entries(value)) out[k] = addSingleKeyRule(v);
  if (hasProperties(value, "has", "flag") || hasProperties(value, "say", "goto")) {
    out.minProperties = 1;
    out.maxProperties = 1;
  }
  return out;
}

/** zod names recursive definitions __schema0, __schema1, …; give them readable names. */
function polishDefinitions(schema: Json): Json {
  const defs = isJsonObject(schema.$defs) ? schema.$defs : {};
  const names = new Map<string, string>();
  for (const [name, def] of Object.entries(defs)) {
    if (hasProperties(def, "has", "flag")) names.set(name, "Condition");
    else if (JSON.stringify(def).includes('"goto":')) names.set(name, "Effects");
  }
  const rename = (ref: string) => {
    const name = ref.replace("#/$defs/", "");
    return names.has(name) ? `#/$defs/${names.get(name)}` : ref;
  };
  const rewritten = addSingleKeyRule(rewriteRefs(schema, rename)) as Json;
  if (isJsonObject(rewritten.$defs)) {
    const renamed: Json = {};
    for (const [name, def] of Object.entries(rewritten.$defs)) renamed[names.get(name) ?? name] = def;
    rewritten.$defs = renamed;
  }
  return rewritten;
}

export function packJsonSchema(): Json {
  const generated = polishDefinitions(PackSchema.toJSONSchema({ io: "input", unrepresentable: "any" }) as Json);
  const { $schema, ...rest } = generated;
  return {
    $schema,
    $id: SCHEMA_ID,
    title: `LexVM content pack (${PACK_FORMAT})`,
    description:
      "A LexVM text adventure as declarative data. Normative semantics: docs/spec/content-pack.md. Generated from packages/engine/src/schema.ts by 'lexvm schema'; do not edit by hand.",
    ...rest,
  };
}

export function runSchema(argv: string[]): number {
  const args = parseArgs(argv, { out: { type: "string", short: "o" }, help: { type: "boolean", short: "h" } });
  if (flag(args, "help")) {
    out(SCHEMA_HELP);
    return 0;
  }
  const json = `${JSON.stringify(packJsonSchema(), null, 2)}\n`;
  const target = stringOption(args, "out") ?? SCHEMA_FILE;
  if (target === "-") {
    process.stdout.write(json);
    return 0;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json);
  out(`${color.green("wrote")}  ${target}`);
  return 0;
}
