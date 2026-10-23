# 0003. Content packs are declarative data

- Status: Accepted
- Date: 2026-10-23

## Context

LexVM plays content packs from many sources: the repository, other people,
and LLMs. Players import packs from files or paste them from an LLM chat. We
want four properties:

1. **Safety.** Loading a pack from a stranger or an LLM cannot run code.
2. **Determinism.** The same commands always produce the same game.
3. **Verifiability.** Tools can prove that a pack is winnable and has no dead
   ends.
4. **Generatability.** An LLM can write a correct pack from the specification
   alone.

Executable game logic (scripts) breaks all four: sandboxing code in a browser
is hard, scripts can be non-deterministic, arbitrary code cannot be explored
exhaustively, and LLMs write subtly broken code more often than subtly broken
data, with errors that are hard to explain back to them.

## Decision

A content pack contains **no code**. All game logic is expressed with a
**closed vocabulary** of conditions and effects defined in the
[specification](../spec/content-pack.md): every condition and every effect is
an object with exactly one known key (`{ has: brass_key }`,
`{ set: book_moved }`). Rules are triggered by commands or by the events
`start`, `enter` and `turn`. Unknown keys are rejected with a precise
message.

The engine interprets this vocabulary; it never evaluates strings from a
pack as code.

## Consequences

- Packs are safe to load from any source (see [SECURITY.md](../../SECURITY.md)).
- Every pack can be validated, statically analysed and explored
  (see [ADR 0005](0005-forgiving-policy-verified-by-exploration.md)).
- Validation errors are specific (the exact path, the unknown key, the
  allowed keys), which makes LLM repair loops converge.
- Expressiveness is limited to what the vocabulary offers. Some game designs
  (real-time events, randomness, arithmetic-heavy puzzles) are not possible.
- Extending the vocabulary is a format change that needs an ADR, a
  specification update and a schema update. This is deliberate: the
  vocabulary grows from real content needs, not speculation.

## Alternatives considered

- **Embedded JavaScript** in packs. Maximum flexibility, but unsafe without
  heavy sandboxing, not verifiable, and error-prone for LLMs.
- **A sandboxed scripting language** (Lua, a WebAssembly interpreter).
  Safer, but adds a large runtime, still defeats exhaustive verification and
  is harder for LLMs to get right than data.
- **Existing interactive fiction formats** (Z-machine or Glulx story files
  compiled from Inform, ink, Twine). Mature and expressive, but compiled
  formats are opaque to verification and editing, choice-based formats lack a
  world model, and none of them is designed for tap-first play or for LLM
  generation with machine-checkable feedback.
- **An open, extensible condition and effect set** (plug-ins). Would make
  packs depend on engine extensions and break portability and verification.
