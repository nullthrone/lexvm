# Prompt kit

Prompts for writing LexVM content packs with any LLM. See
[docs/authoring/pipeline.md](../docs/authoring/pipeline.md) for how to use
them.

- `templates/` — the **source**: one Markdown template per stage (`oneshot`,
  `concept`, `puzzles`, `world`, `logic`, `repair`) plus `system.md`, the
  shared head of the staged prompts. Placeholders such as `{{SPEC}}` are
  filled at runtime from `docs/spec/content-pack.md`,
  `docs/authoring/guide.md` (its `prompt:begin` regions) and
  `packs/locked-study/pack.yaml`. Lines starting with `<!-- template:` are
  notes for maintainers and are removed when rendering.
- `oneshot.md` — **generated** by `npm run prompts`; do not edit it by hand.
  It is the generic one-shot prompt that the web app copies to the clipboard.
  A test fails while it is out of date.

Print any other prompt with `npm run lexvm -- prompt --stage <stage>`.
