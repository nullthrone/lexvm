# Generating packs with an LLM

LexVM content packs are pure data, so a language model can write them. There
are two ways to do it, and both use the same specification, the same prompts
and the same verification ([ADR 0007](../adr/0007-llm-pipeline-byo-prompt-kit-and-api-generator.md)):

- **Flow A — bring your own LLM.** Copy a prompt into any chat LLM (Claude,
  ChatGPT, Gemini, …), paste the answer into LexVM, paste the diagnostics
  back. No API key, works on a phone.
- **Flow B — the API pipeline.** `lexvm generate` drives the Anthropic API
  through a staged design process and repairs the pack automatically until
  it passes every check.

Neither flow replaces playtesting. Verification proves that a pack is
*winnable without dead ends*; whether it is *good* is decided by people. See
the [authoring guide](guide.md) for what "good" means, and section 15 there
for reviewing a pack.

## The prompt kit

All prompts are assembled from files in the repository at runtime:

| Source | Role |
|---|---|
| [`docs/spec/content-pack.md`](../spec/content-pack.md) | The normative format specification, embedded in full. |
| [`docs/authoring/guide.md`](guide.md) | The regions between `<!-- prompt:begin guide -->` markers form the condensed guide; the `checklist` region is the self-check list. |
| [`packs/locked-study/pack.yaml`](../../packs/locked-study/pack.yaml) | The worked example. |
| [`prompts/templates/`](../../prompts/templates/) | One Markdown template per stage, with placeholders such as `{{SPEC}}`, `{{GUIDE}}`, `{{EXAMPLE}}`, `{{LANG}}`, `{{IDEA}}`, `{{MINUTES}}`, `{{BUDGET}}`, `{{BUDGET_TABLE}}`, `{{FILES}}`, `{{DIAGNOSTICS}}`. |

`npm run prompts` renders the generic one-shot prompt to
[`prompts/oneshot.md`](../../prompts/oneshot.md), which the web app bundles
for its "copy prompt" button. A test fails while that file is out of date, so
run `npm run prompts` after changing a template, the guide, the spec or the
example. Rendering fails loudly if a template uses a placeholder that has no
value, so a prompt can never ship with a hole in it.

The stages:

| Stage | Template | Asks the model for |
|---|---|---|
| `oneshot` | `oneshot.md` | A short design (concept, puzzle dependency chart), one complete `pack.yaml`, a self-check against the checklist. |
| `concept` | `concept.md` | `design/concept.md`: title, voice, premise, cast, chapters, locations, key items and clues. |
| `puzzles` | `puzzles.md` | `design/puzzles.md`: a Mermaid puzzle dependency chart and, per puzzle, signposting, solution, wrong attempts, hints, score. |
| `world` | `world.md` | `pack.yaml` (metadata, start, verbs, flags), `rooms.yaml`, `objects.yaml`. |
| `logic` | `logic.md` | `rules.yaml`, `dialogues.yaml`, `solution.yaml` (endings, hints, walkthrough last), plus any earlier file that must change. |
| `repair` | `repair.md` | Only the changed files, complete, given the diagnostics and the current files. |

The staged prompts share one system prompt (`system.md`: the guide, the
checklist, the spec and the example). It contains nothing run-specific, so
the API can cache it across all calls of a run.

### Play time budget

Generated packs should roughly hit their target length, so every prompt
gives the model a size budget up front. The budget comes from
`budgetForMinutes` in the engine, the inverse of the play time estimate
(spec section 17): for a target length and language it gives a range of
walkthrough steps and of player-visible words, plus the typical proportions
(about a quarter of the steps are dialogue choices, about 60% of the words
appear along the walkthrough).

- The stage prompts (`concept`, `puzzles`, `world`, `logic`) contain the
  budget for `--minutes` (`{{BUDGET}}`); without `--lang` they list it for
  German and English packs.
- The generic one-shot prompt contains a table for 15, 30, 45 and 60 minutes
  (`{{BUDGET_TABLE}}`, plus the `--minutes` value if it is another one) and
  tells the model to pick the row matching the requested length, 30 minutes
  if the idea names none.
- `lexvm check` prints the estimate, and warns (`playtime.too-short`,
  `playtime.too-long`) when it misses `playtime` by more than 25%, with
  concrete numbers: how many puzzles, walkthrough commands or words to add or
  cut. Paste these warnings back like any other diagnostic.

## Flow A: bring your own LLM

1. **Get the prompt.** In the web app, open *Create* and copy the prompt. Or
   open [`prompts/oneshot.md`](../../prompts/oneshot.md), or print a prompt
   with your idea already filled in:

   ```sh
   npm run lexvm -- prompt --idea "Hamburg 1948: ein Kommissar sucht …" --lang de --minutes 40
   npm run lexvm -- prompt --out my-prompt.md      # write to a file instead of stdout
   ```

2. **Paste it into a chat** with the most capable model you have access to.
   If you used the generic prompt, write your idea after "My idea:" at the
   very end — in any language. The pack language defaults to the language of
   your idea (`de` or `en`); say so if you want the other one.

3. **Save the YAML.** The answer contains a short design section, one
   ```` ```yaml ```` block and a self-check list. Save the block as
   `packs/<id>/pack.yaml` (the `id` inside the file is a good directory name),
   or paste it into the import screen of the web app.

   If the answer was cut off, ask the model to "continue exactly where the
   YAML block stopped" and join the parts, or ask for a shorter game.

4. **Check it.**

   ```sh
   npm run lexvm -- check packs/<id>
   ```

   The import screen of the web app runs the same checks.

5. **Repair.** Paste the diagnostics back into the *same* chat. The one-shot
   prompt already tells the model what to do with them; a short message is
   enough:

   > `lexvm check` reported these problems. Fix every error (and the warnings
   > where that is easy) and answer with the complete corrected `pack.yaml` in
   > one yaml block, then one line per fix.
   >
   > *(diagnostics)*

   In a new chat, or for a multi-file pack, generate a self-contained repair
   prompt instead. It contains the spec, your files and the diagnostics (it
   runs the checks itself unless you pass `--diagnostics <file>`):

   ```sh
   npm run lexvm -- prompt --stage repair --pack packs/<id> --out repair.md
   ```

6. **Repeat** until there are no errors, then play the game.

**More control.** Instead of the one-shot prompt you can run the stages one
by one in the same chat (`--stage concept`, then `puzzles`, `world`,
`logic`), reviewing and editing each answer before you continue. With
`--pack packs/<id>` the later stage prompts include what is already on disk
(`design/concept.md`, `design/puzzles.md`, the YAML files), so they also work
in a fresh chat.

## Flow B: the API pipeline

```sh
ANTHROPIC_API_KEY=... LEXVM_MODEL=<model id> \
  npm run lexvm -- generate --idea "Hamburg 1948: …" --lang de --minutes 40 --out packs/hamburg-1948
```

**Model.** There is deliberately no default model. Pass `--model <id>` or set
`LEXVM_MODEL` to a current Claude model id from Anthropic's
[model overview](https://platform.claude.com/docs/en/about-claude/models/overview).
Without one, the command exits with code 2. More capable models produce
better puzzles and need fewer repair rounds. The pipeline requests adaptive
thinking; use `--no-thinking` for a model that does not support it, and
`--effort <level>` to trade quality against cost and time on models that
support effort levels.

**API key.** Read from `ANTHROPIC_API_KEY` only, never printed, never written
to any file.

| Option | Default | Meaning |
|---|---|---|
| `--idea <text>` / `--idea-file <path>` | — | The idea, in any language. |
| `--out <dir>` | — | Output directory. Its name is the pack id (kebab-case). |
| `--lang de\|en` | language of the idea | Pack language. |
| `--minutes <n>` | 30 | Target play time: written to `playtime`, sizes the budget in the prompts, checked by the play time estimate. |
| `--model <id>` | `LEXVM_MODEL` | Claude model id (required). |
| `--max-repairs <n>` | 6 | Repair rounds after the first check. |
| `--from-stage <stage>` | `concept` | Resume at `concept`, `puzzles`, `world`, `logic` or `verify`. |
| `--max-states <n>` | 200000 | State limit of the exploration gate. |
| `--max-tokens <n>` | 64000 | Output token limit per request. |
| `--effort <level>` | model default | `low`, `medium`, `high`, `xhigh` or `max`. |
| `--no-thinking` | off | Do not request adaptive thinking. |
| `--author <name>` | `LexVM contributors` | Written to `author` as "*name* (written with an LLM)". |
| `--license <spdx>` | `CC-BY-4.0` | Content license. |
| `--force` | off | Start from scratch in a directory that already holds a pack. |

Exit codes: `0` the pack passes every gate, `1` generation or verification
failed, `2` usage error (including a missing model or API key).

### Stages and artifacts

```
packs/<id>/
  pack.yaml  rooms.yaml  objects.yaml          # world stage
  rules.yaml  dialogues.yaml  solution.yaml    # logic stage
  design/
    concept.md                                 # concept stage
    puzzles.md                                 # puzzles stage
    run.json                                   # log of every run
```

Each stage's prompt contains the outputs of the previous stages: the puzzle
designer sees the concept, the world builder sees concept and puzzles, the
logic writer sees both documents and the world files. Progress is printed per
stage to stderr. Every artifact is written as soon as it exists.

The model returns files as fenced code blocks whose info string names the
file (```` ```yaml file=rooms.yaml ````). The parser ignores prose between
blocks and tolerates common variations (missing language tag, the name on the
line before the block, longer fences), but it only accepts plain file names
with a `.yaml` extension (`.md` for design documents): no directories, no
`..`, nothing else. Rejected blocks are reported and logged; nothing is ever
written outside the output directory.

### Verification gates

After the logic stage, the pipeline verifies the pack in-process with the
engine, in this order, stopping at the first gate with errors:

1. **Compile** — schema (structure and types) and semantics (references,
   declarations, doors, dialogues, text references, endings).
2. **Walkthrough** — replaying the walkthrough from a new game accepts every
   command and ends in a winning ending.
3. **Exploration** — a breadth-first search over all reachable states proves
   that a win is always still reachable (no dead ends) and that no losing
   ending exists; a second search also drops carried items. If the state
   space exceeds `--max-states`, the result is incomplete and reported as an
   error (`explore.incomplete`): an incomplete exploration proves neither
   winnability nor its absence, so it never reports "not winnable", but the
   pack is not verified either. Bound counters changed by turn rules, or raise
   `--max-states`.

Once the walkthrough gate passes, the play time estimate runs against the
`--minutes` target. The pipeline writes that target to `playtime` in
`pack.yaml` after the world stage and restores it before every check, so a
repair round cannot move the goalposts.

### The repair loop

When a gate reports errors, the pipeline sends a repair prompt with the
diagnostics — all errors first, then the most important warnings (play time
first, then exploration and walkthrough findings, style and text-length notes
last) —
together with the current files and the design documents. The model returns
only the files it changed, each in full; they replace the files on disk, and
the pack is verified again. This repeats until no errors remain or
`--max-repairs` rounds are used up. Warnings never block success, but the
model is asked to fix them where that is easy. If the verifier itself crashes
twice in the same way (an engine bug, not a pack problem), the loop stops
early.

The length is the one warning the loop acts on by itself: when a pack passes
every gate but its estimated play time misses the target by more than 25%
(`playtime.too-short` / `playtime.too-long`), the pipeline spends one more
repair round on the length, if `--max-repairs` leaves one. If that round
breaks the pack and the remaining rounds cannot fix it, the last passing
version is restored, so a length repair never costs a working pack.

On failure, look at the remaining diagnostics (`npm run lexvm -- check
packs/<id>`), fix what you can by hand, and continue with
`--from-stage verify --max-repairs <n>`; or regenerate a later stage.

### Resuming

`--from-stage <stage>` reruns that stage and everything after it, reusing
the artifacts of the earlier stages from disk:

| Stage | Needs on disk |
|---|---|
| `puzzles` | `design/concept.md` |
| `world` | `design/concept.md`, `design/puzzles.md` (the world stage replaces all existing `*.yaml` files) |
| `logic` | the design documents and `pack.yaml` |
| `verify` | the pack files |

The idea, language, play time, author and license are taken from
`design/run.json` unless given again on the command line. This makes a
human-in-the-loop workflow easy: generate, read `design/puzzles.md`, improve
the chart by hand, then `--from-stage world`. Without `--from-stage`, the
command refuses to overwrite a directory that already contains a pack
(use `--force` to start over).

The client retries rate limits, overload and connection errors with
backoff, including errors that arrive in the middle of a streamed answer. If
a run is interrupted anyway, resume it from the stage that did not finish.

### `design/run.json`

The run log makes a generated pack reviewable in a pull request. It records
the parameters (idea, language, play time, limits, author, license), every
run with its starting stage and result, and per stage: timestamps, duration,
token usage (input, output, cache reads and writes), stop reason, the files
written, parser notes, and for each check the diagnostics counts per gate.
`totals` sums the token usage. It never contains the API key or other
secrets, and by repository policy no model identifiers; mention the model in
the pull request if you want to.

### Time and cost

A run makes four stage calls plus one call per repair round. Every call
sends the shared system prompt (the spec, guide and example — cached after
the first call, which makes later calls cheaper) and the artifacts of the
previous stages; repair rounds resend all pack files. Most of the output, and
of the cost, goes into the world and logic stages and into repair rounds.
Expect a run to take from several minutes to well over half an hour, and to
cost roughly as much as a few long chat conversations with the same model.
Larger models and higher effort cost more per call but usually need fewer
repairs. The token totals in `run.json` and the usage page of the Anthropic
Console show what a run actually used.

## Provenance

Be honest about how a pack was made ([ADR 0010](../adr/0010-content-licensing.md),
[CONTRIBUTING.md](../../CONTRIBUTING.md)):

- **`author`** names the people responsible, followed by "(written with an
  LLM)" — both flows fill this in. If you rewrite large parts by hand, say so
  (e.g. "Jane Doe (drafted with an LLM, edited by hand)").
- **`generator`** records the pipeline: `pipeline: lexvm generate` or
  `pipeline: lexvm one-shot prompt`, and `notes` with anything a reviewer
  should know (human edits, which stages were rewritten).
- **`design/`** — commit the design documents and `run.json` together with
  the pack, so reviewers can follow the design and the verification history.

## Licensing

Every pack declares the license of its content as an SPDX identifier in
`license`. For community packs the repository suggests `CC-BY-4.0` (the
default of both flows); packs in this repository must be redistributable by
the project, so non-commercial and no-derivatives licenses are not accepted.
Packs must not copy text from other works or use characters or settings from
copyrighted franchises.

Whether purely machine-generated text is protected by copyright at all
depends on the jurisdiction and on how much human creative control went into
it; human selection, arrangement and editing may be protected even where the
raw output is not. Read the terms of use of the LLM provider you use. See
[ADR 0010](../adr/0010-content-licensing.md) for the project policy. **This
is not legal advice.**

## Troubleshooting

| Symptom | What to do |
|---|---|
| `no model given` | Pass `--model <id>` or set `LEXVM_MODEL` (see the model overview linked above). |
| `not found — check the model id` | The model id is wrong or not available to your API key. |
| `ANTHROPIC_API_KEY is not set` / `authentication failed` | Export a valid API key. |
| "the answer was cut off at the output token limit" | Raise `--max-tokens` (within the model's limit) or ask for a shorter game. |
| Errors about `thinking` | The model does not support adaptive thinking: add `--no-thinking`. |
| The repair loop does not converge | Read the diagnostics; often the design itself has a dead end. Fix `design/puzzles.md` and rerun `--from-stage world`, or fix the YAML by hand and rerun `--from-stage verify`. |
| `yaml.*` errors in a chat-generated pack | See "YAML pitfalls" in the [guide](guide.md): usually an unquoted `: ` or `, ` inside `{ … }`. |
| `playtime.too-short` / `playtime.too-long` | The pack misses its target length; the message says how many puzzles, commands or words to add or cut. If the length is right and the target was wrong, change `playtime` instead (by hand; `lexvm generate` keeps it at `--minutes`). |
