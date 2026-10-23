# Content packs

This directory holds the content packs that ship with LexVM. Each content
pack is a complete text adventure expressed as data, following the
[content pack specification](../docs/spec/content-pack.md) (`lexvm-pack/1`).
Every pack here is compiled into the player, verified in CI and attached to
releases as `<pack-id>.lexpack.json`.

## Current packs

| Pack | Language | Length | License | Status |
|---|---|---|---|---|
| [`letzte-nacht-der-reichsmark`](letzte-nacht-der-reichsmark/pack.yaml): *Die letzte Nacht der Reichsmark* | German | 45 minutes (estimated 47, speedrun 24; 74-step walkthrough) | CC-BY-4.0 | Noir mystery, Hamburg 1948; design notes in [`design/`](letzte-nacht-der-reichsmark/design/) |
| [`locked-study`](locked-study/pack.yaml): *The Locked Study* | English | 5 minutes (estimated 6; 17-step walkthrough) | CC0-1.0 | Demo and reference example for authors and the prompt kit |
| [`gertrud-rollt-nach-norden`](gertrud-rollt-nach-norden/pack.yaml): *Gertrud rollt nach Norden* | German | 120 minutes (estimated 100, speedrun 78; 331-step walkthrough) | CC-BY-4.0 | Comedy road trip, Santa Monica to San Francisco; seven stops, a grandfather's postcard hunt, a rival family |

Length is the pack's `playtime` target, shown on its library card; the
estimate is what `lexvm check` computes from the texts and the walkthrough.

## Layout

One directory per pack. The directory name is the pack id (kebab-case, for
example `hamburg-1948`) and must match `id` in `pack.yaml`.

```
packs/<pack-id>/
  pack.yaml        required: metadata (and optionally everything else)
  rooms.yaml       optional: any number of additional *.yaml files
  objects.yaml
  dialogues.yaml
  design/          optional: design notes, puzzle charts, never compiled
```

The compiler reads `pack.yaml` first, then the other `*.yaml` and `*.json`
files of the directory (not subdirectories) in name order, and merges them by
top-level key. Split large packs by topic (rooms, objects, dialogues) to keep
files reviewable. Keep design documents, such as a puzzle dependency chart,
in `design/`.

Start `pack.yaml` with a schema reference so editors with a YAML language
server can validate and complete it:

```yaml
# yaml-language-server: $schema=../../schema/lexvm-pack-1.schema.json
```

## Adding a pack

1. Propose the idea in a
   [content pack proposal](https://github.com/nullthrone/lexvm/issues/new?template=content_pack_proposal.yml)
   to get feedback on premise, scope and license early.
2. Scaffold it: `npm run lexvm -- new <pack-id>`.
3. Write it by hand following the [authoring guide](../docs/authoring/guide.md),
   or generate it with an LLM following the
   [generation pipeline](../docs/authoring/pipeline.md).
4. Verify and play it:

   ```sh
   npm run lexvm -- check packs/<pack-id>
   npm run lexvm -- play packs/<pack-id>
   npm run dev          # play it in the player
   ```

5. Open a pull request using the content pack section of the template.

## Verification requirements

A pack is merged only when `npm run lexvm -- check packs/<pack-id>` reports
no errors. The check covers:

1. **Schema**: structure and types.
2. **Semantics**: every reference resolves, flags and counters are declared,
   and so on.
3. **Walkthrough**: the `walkthrough` replays to a winning ending.
4. **Exploration**: every reachable state can still reach a winning ending
   and no losing ending exists (the `forgiving` policy). An exploration that
   hits the state limit proves nothing and is an error.

Warnings (for example long texts or unreached content) need a reason in the
pull request. CI runs `npm run check:packs` for all packs on every push and
pull request. The player's end-to-end tests
([`walkthroughs.spec.ts`](../apps/web/e2e/walkthroughs.spec.ts)) also play
the walkthrough of every pack in the catalog to its winning ending by
tapping alone, on phone viewports.

Automatic checks prove that a pack can be won; they do not prove that it is
good. Every pack is also played through by a human and reviewed against the
content guidelines in [CONTRIBUTING.md](../CONTRIBUTING.md#contributing-a-content-pack).

## Licensing

Each pack declares its own license in `license` as an SPDX identifier,
independently of the MIT License of the code. The recommended license for
community packs is `CC-BY-4.0`; the license must allow the project to
redistribute the pack (see [ADR 0010](../docs/adr/0010-content-licensing.md)).
`author` and `generator` record who wrote the pack and how, including any
LLM involvement.

## Versioning

Bump `version` (semver) on every content change to a published pack. Saves
are bound to the pack id, version and content hash; when a pack changes, the
player replays the save's command log against the new version, so avoid
renaming ids that existing walkthroughs and saves refer to.
