# 0004. YAML source, JSON runtime, zod schema as source of truth

- Status: Accepted
- Date: 2026-10-23

## Context

Content packs are written by people and by LLMs, and read by the engine in
the browser, by the CLI and by editors. The requirements differ:

- **Writing** needs a format with little punctuation noise, comments,
  multi-line strings and the ability to split a pack into several files.
- **Running** needs a fast, unambiguous format with one canonical shape, so
  the engine does not handle alternative spellings at runtime.
- **Validation** needs one definition of the format that produces TypeScript
  types, runtime checks with precise error paths, and a JSON Schema for
  editors and LLM tooling. Keeping several definitions in sync by hand fails.

## Decision

- **Source format: YAML.** Packs are authored as one or more YAML files in
  `packs/<pack-id>/`, merged by top-level key.
- **Runtime format: JSON.** The compiler writes one normalised
  `<pack-id>.lexpack.json` per pack. Lenient input forms (a single condition
  instead of a list, a single effect instead of a list) are normalised so the
  runtime sees exactly one shape. The player can also import YAML directly;
  it passes through the same compiler.
- **Schema: zod**, in `packages/engine/src/schema.ts`, is the single source
  of truth. TypeScript types are inferred from it. The JSON Schema in
  `schema/` is generated from it (`lexvm schema`) and referenced from pack
  files for editor completion.
- The normative prose is the [specification](../spec/content-pack.md). If the
  specification and the schema disagree, that is a bug, fixed in the same
  pull request.

## Consequences

- Authors and LLMs write a readable format; the runtime stays simple.
- One schema produces types, validation and the JSON Schema; drift is
  limited to the specification prose, which reviews must check.
- Diagnostics can point to a file and line in the YAML source.
- The engine depends on the `yaml` and `zod` libraries (also in the browser
  bundle).
- YAML has known pitfalls (implicit typing such as `no` and `on`,
  indentation errors). The schema catches type errors, and the compiler uses
  the YAML 1.2 core schema, where `no` and `on` are strings.

## Alternatives considered

- **JSON only.** One format, no compiler, but noisy to write, no comments, no
  multi-line strings; LLMs make more bracket and escaping errors.
- **TOML.** Pleasant for flat configuration, awkward for deeply nested
  structures such as dialogues and effects.
- **A custom DSL** (in the spirit of Inform 7 or ink). Most readable, but
  needs its own parser, editor support and documentation, and LLMs know it
  less well than YAML.
- **JSON Schema as the source** with generated types (for example with
  `ajv`). Standard, but less ergonomic for normalisation and for precise,
  helpful error messages.
- **Other validation libraries** (Valibot, TypeBox). Viable; zod was chosen
  for its maturity, error reporting and built-in JSON Schema generation.
