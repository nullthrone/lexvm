# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes to the content pack format are listed with the format version they
belong to (see the [specification](docs/spec/content-pack.md#16-versioning-of-this-format)).

## [Unreleased]

First release in preparation: v0.1 "Playable".

### Added

- Content pack format `lexvm-pack/1`: normative
  [specification](docs/spec/content-pack.md), zod schema as the single source
  of truth, generated JSON Schema for editors and LLM tooling.
- Engine (`@lexvm/engine`): YAML-to-JSON compiler with multi-file packs,
  semantic validator with machine- and LLM-readable diagnostics, pure and
  deterministic runtime (`newGame`, `step`, `view`, `hint`), German and
  English parser, content hash for saves.
- Verifier: walkthrough replay and breadth-first exploration of the whole
  state space, enforcing the `forgiving` policy (no losing endings, no dead
  ends).
- CLI (`lexvm`): `validate`, `build`, `check`, `play`, `new`, `schema`,
  `prompt` and `generate` (staged generation with the Anthropic API and a
  validate and repair loop).
- Prompt kit in `prompts/` for generating content packs with any LLM by copy
  and paste, without an API key.
- Player (`@lexvm/web`): offline-first PWA for phones and tablets with
  tap-first object action sheets, optional text parser, dialogue choices,
  progressive hints, score, saves and undo, content pack import, in-app
  prompt kit, book typography with sepia, light and dark themes, German and
  English UI.
- Play time estimate (`estimatePlaytime`, `budgetForMinutes`): `lexvm check`
  prints it and warns when a pack misses its `playtime` by more than 25%,
  `lexvm build` writes `estimatedMinutes` to the catalog, the prompts carry a
  size budget for the target length, `lexvm generate` enforces `--minutes`,
  and the player shows the estimate on library cards and after an import.
- Single-file offline build `lexvm-offline.html`.
- Demo content pack `locked-study` (English, CC0-1.0), the reference example
  for authors and prompts.
- First German content pack (in progress).
- Deployment to GitHub Pages, release workflow attaching the single-file
  build and compiled content packs, CI with lint, typecheck, unit and
  end-to-end tests, pack verification and a prompt kit freshness check.
- Community files: contributing guide, code of conduct, security policy,
  issue forms, pull request template, labels and milestones as code,
  architecture overview and architecture decision records 0001 to 0010.

[Unreleased]: https://github.com/nullthrone/lexvm/commits/main
