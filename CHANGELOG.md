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
- German noir content pack *Die letzte Nacht der Reichsmark*
  (`letzte-nacht-der-reichsmark`, CC-BY-4.0): Hamburg, the night before the
  1948 currency reform; clues combined into deductions, interrogations and
  two winning endings. About 45 minutes (estimated 47), a 74-step
  walkthrough, 25 points, 6,869 explored states without a dead end; revised
  after a first playtest round (design notes and change log in its
  `design/` directory).
- End-to-end test that wins every built-in pack of the catalog by tapping
  alone (object chips, in-text references, inventory and notebook, the
  target picker, exits, dialogue options) on iPhone and Pixel viewports,
  checking after every step that the screen shows the engine's state, the
  newest text is readable and the page never scrolls sideways.
- Deployment to GitHub Pages, release workflow attaching the single-file
  build and compiled content packs, CI with lint, typecheck, unit and
  end-to-end tests, pack verification and a prompt kit freshness check.
- Community files: contributing guide, code of conduct, security policy,
  issue forms, pull request template, labels and milestones as code,
  architecture overview and architecture decision records 0001 to 0010.
- Parser: bare exit ids and labels of listed exits ("ueberfahrt"), vehicles
  named like a listed exit ("nimm die Straßenbahn", "fahr mit der Bahn",
  "steig ins Boot", "take the tram", "ride", "board"), lighting
  ("zünde X (mit Y) an", "entzünde X"), comparing and connecting
  ("vergleiche/verbinde X mit Y") as `use`, "notizbuch"/"notebook" for the
  inventory, German dative plurals ("Streichhölzern").
- Clues are combined with "Combine with …" ("Kombinieren mit …") in the
  player's action sheet, which lists the other clues first; the notebook
  explains it, and `lexvm play` shows the verbs of clues.
- Engine: `validateState` (a saved state against its pack) and
  `objectDescription` (an object's current description without running a
  turn).

### Changed

- `lexvm check` and the `lexvm generate` gate: an incomplete exploration is
  an error (`--allow-incomplete` makes it a warning); a second exploration
  also drops carried items; `inventory` is no longer an offered action.
  ADR 0005 is amended accordingly.
- `lexvm play` speaks the pack's language: help, hints, endings, the
  affordance block and invalid dialogue numbers are German for German packs.
- GitHub workflows run the build with read-only tokens and pin actions to
  commit SHAs.

### Fixed

From the pre-release code review, security review and playtests:

- Rules that fan out (an enter rule entering the next room several times)
  are bounded by a per-call work budget; dialogues that run out of options
  end instead of soft-locking; turn rules stop once one of them starts a
  dialogue; ids such as `constructor` are never looked up on prototypes.
- Explorer: non-portable objects carried in a container are tracked when
  dropping is explored; options behind reduced state are no longer reported
  as unreached; one maxScore mistake gives one warning.
- Player: imported or stored saves with invalid states no longer break the
  game; `#/play/…/new` links ask before replacing a saved game; two tabs on
  one game ask instead of overwriting each other; undo also removes the
  undone output; notebook texts no longer run a turn.
- Player layout: on 390-pixel-wide phones a long pack title widened the game
  screen, so it panned sideways and taps missed; new text no longer slides
  under a conversation's options, the "did you mean" row or the input line
  when the dock grows, and a turn that just fits is shown whole.

### Security

- Content-Security-Policy with Trusted Types in both builds, verified by the
  end-to-end tests; pack text is made safe for terminals in the CLI.

[Unreleased]: https://github.com/nullthrone/lexvm/commits/main
