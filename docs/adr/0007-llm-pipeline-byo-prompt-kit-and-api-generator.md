# 0007. LLM pipeline: bring-your-own prompt kit and API generator

- Status: Accepted
- Date: 2026-10-23

## Context

A goal of LexVM is that anyone can create an adventure with the help of an
LLM. The people we want to reach differ:

- Players with a chat subscription to some LLM, but no API key, no
  programming background and maybe only a phone.
- Authors and maintainers who want repeatable, higher-quality generation and
  are comfortable with a terminal and an API key.

The player must keep its guarantees: no network access at runtime, no
accounts, no secrets in the browser ([ADR 0006](0006-offline-first-pwa-on-github-pages.md)).
Generated packs must pass the same verification as hand-written ones
([ADR 0005](0005-forgiving-policy-verified-by-exploration.md)).

The engine's diagnostics are precise and explain how to fix each problem,
which makes a validate and repair loop practical.

## Decision

We provide two pipelines that share the specification, the prompts and the
diagnostics:

1. **Prompt kit, bring your own LLM.** Prompts generated from the
   specification, the authoring guide and the demo pack live in `prompts/`
   and in the player. The player shows the prompt to copy into any LLM chat,
   accepts the pasted result, validates it, and, on errors, produces a repair
   prompt containing the diagnostics to paste back. No API key, no network
   access by the player.
2. **`lexvm generate`.** A CLI command that generates a pack in stages with
   the Anthropic API (key from `ANTHROPIC_API_KEY`), runs the validator,
   walkthrough replay and exploration after each stage, and feeds the
   diagnostics back to the model until the pack passes or an iteration limit
   is reached.

The prompt kit is generated, not hand-written: `npm run prompts` rebuilds it,
and CI fails if `prompts/` is out of date. Details are in the
[generation pipeline guide](../authoring/pipeline.md).

## Consequences

- Anyone with access to an LLM chat can create a pack on a phone, without an
  API key.
- The specification is written to be sufficient for an LLM on its own, and
  diagnostics are part of the user experience for LLMs as much as for people.
- Format changes must update the prompt kit; CI enforces this.
- Generated packs still need human playtesting and review; verification
  proves winnability, not quality.
- `lexvm generate` is tied to one API vendor. Other vendors can be added
  behind the same stages later; the prompt kit already works with any LLM.
- Provenance must be disclosed in the pack (`author`, `generator`), see
  [CONTRIBUTING.md](../../CONTRIBUTING.md#contributing-a-content-pack).

## Alternatives considered

- **API calls from the browser with the user's key.** Convenient, but puts
  secrets into browser storage, needs network access at runtime and breaks
  the offline model.
- **A hosted generation service.** Easiest for users, but needs a backend,
  accounts, abuse handling and money.
- **Prompt kit only.** Lower barrier, but no automated repair loop for
  maintainers and no reproducible pipeline for CI-driven generation (planned
  for v0.3).
- **API generator only.** Excludes people without API access.
