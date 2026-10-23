# Contributing to LexVM

Thank you for helping. This document explains how to contribute and what we
expect from a contribution. By participating you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

Contents:

- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Project principles](#project-principles)
- [Workflow](#workflow)
- [Commit messages](#commit-messages)
- [Changing the content pack format](#changing-the-content-pack-format)
- [Contributing a content pack](#contributing-a-content-pack)
- [Review process](#review-process)
- [Labels and milestones](#labels-and-milestones)
- [Licensing of contributions](#licensing-of-contributions)

## Ways to contribute

- **Play and report.** Play on your phone or tablet and
  [open an issue](https://github.com/nullthrone/lexvm/issues/new/choose) for
  bugs, confusing puzzles or typos. A command log or a save file makes any
  bug reproducible, because the engine is deterministic.
- **Content packs.** Write or generate an adventure. Start with a
  [content pack proposal](https://github.com/nullthrone/lexvm/issues/new?template=content_pack_proposal.yml),
  then read [Contributing a content pack](#contributing-a-content-pack).
- **Engine** (`packages/engine`): runtime, parser, compiler, verifier.
- **Player** (`apps/web`): the PWA, its accessibility and its behaviour on
  real devices.
- **CLI and generation pipeline** (`packages/cli`, `prompts/`): authoring
  tools and the LLM prompt kit.
- **Documentation** (`docs/`): the specification, guides and ADRs.
- **Translations.** The player UI is available in German and English. A new
  UI language needs UI strings in `apps/web`. A new *content* language also
  needs engine messages and a parser vocabulary in `packages/engine`; open an
  issue first, since it touches the format (the `language` field).

Issues labelled
[`good first issue`](https://github.com/nullthrone/lexvm/labels/good%20first%20issue)
and [`help wanted`](https://github.com/nullthrone/lexvm/labels/help%20wanted)
are a good starting point.

## Development setup

Requirements: Node.js 22 (see [`.nvmrc`](.nvmrc)) and npm. The repository is
an npm workspace with three packages:

| Path | Package | Contents |
|---|---|---|
| `packages/engine` | `@lexvm/engine` | Schema, compiler, runtime, parser, verifier. No DOM, no Node APIs. |
| `packages/cli` | `@lexvm/cli` | The `lexvm` command line tool. |
| `apps/web` | `@lexvm/web` | The player (PWA). |

```sh
npm ci                                        # install exactly what package-lock.json says
npm run dev                                   # compile packs, start the player dev server
npm run lexvm -- play packs/locked-study      # play a pack in the terminal
```

| Script | Purpose |
|---|---|
| `npm run dev` | Compile content packs and start the Vite dev server. |
| `npm run build` | Production build into `apps/web/dist`. |
| `npm test` | Unit tests (Vitest). Tests live in `packages/*/test` and `apps/*/test`. |
| `npm run e2e -w @lexvm/web` | Playwright end-to-end tests. Run `npx playwright install chromium` once. |
| `npm run lint` | Biome lint and format check. `npm run format` fixes formatting. |
| `npm run typecheck` | TypeScript checks for all workspaces. |
| `npm run check:packs` | `lexvm check` for every pack in `packs/`. |
| `npm run prompts` | Regenerate the prompt kit in `prompts/`. |
| `npm run lexvm -- <command>` | Run the CLI from source (`--help` lists the commands). |

Editor support: content pack YAML files reference the generated JSON Schema
in `schema/`, so editors with a YAML language server offer completion and
validation.

## Project principles

These principles decide most design discussions. A change that breaks one of
them needs an [ADR](docs/adr/README.md).

1. **Determinism.** The engine is a pure function of pack, state and command.
   No clocks, no randomness, no I/O, no mutation of inputs. Game state is
   plain JSON. Anything that would make two runs differ is a bug.
2. **Content packs are data.** Packs contain no code. Game logic uses the
   closed set of conditions and effects in the
   [specification](docs/spec/content-pack.md). Packs from strangers or LLMs
   must be safe to load.
3. **Offline-first.** After the first visit the player works with no network
   connection. The player makes no network requests at runtime beyond its own
   assets: no analytics, no fonts or scripts from third parties.
4. **Accessibility.** Semantic HTML, screen reader support for the story
   output, touch targets of at least 44 by 44 CSS pixels, visible focus,
   respect for system font size, colour scheme and reduced motion. The target
   is WCAG 2.2 level AA.
5. **Small dependency footprint.** The engine depends on `yaml` and `zod`
   only; the player uses no UI framework. Every new runtime dependency needs a
   reason in the pull request.
6. **Mobile-first.** Design and test for a phone in portrait mode first, then
   tablets, then desktops.

## Workflow

1. **Open an issue first** for anything non-trivial (new features, format
   changes, new dependencies, large refactorings) so we can agree on the
   approach before you invest time. Typo fixes and small bug fixes can go
   straight to a pull request.
2. **Fork and branch.** Work on a branch in your fork.
3. **Keep pull requests small** and focused on one concern. Several small PRs
   are reviewed faster than one large one.
4. **Tests are required** for behaviour changes in the engine and CLI, and
   end-to-end tests for user-facing flows in the player. A bug fix comes with a
   test that fails without it; engine bugs are best captured as a command log
   against a small test pack.
5. **Run the checks before pushing:**

   ```sh
   npm run lint && npm run typecheck && npm test && npm run check:packs
   ```

   CI runs the same checks plus the production build, the end-to-end tests
   and a check that the prompt kit in `prompts/` is up to date. If you change
   the specification, the schema or the authoring guide, run
   `npm run prompts` and commit the result.
6. **Open the pull request** using the template. Link the issue
   (`Closes #123`). For UI changes, add screenshots from a phone viewport
   (for example 390 by 844 CSS pixels).

## Commit messages

There is no strict convention. Write commit messages in the imperative mood,
concise and specific:

```
Add German parser synonyms for "untersuche"

Players typed "untersuche" and "untersuch" and got "unknown verb".
```

- Subject line in the imperative ("Fix", "Add", "Remove"), at most about 72
  characters, no trailing period.
- A body when the reason is not obvious: what was wrong and why this is the
  fix.
- Reference issues in the body (`Fixes #42`).

Pull requests are usually squash-merged, so the pull request title becomes
the commit subject. Write it in the same style.

## Changing the content pack format

The content pack format is a public contract: content packs written by
people and LLMs depend on it, and saves are bound to it. A format change
therefore goes through a decision record.

1. Open an issue labelled `type: decision` describing the problem.
2. In **one pull request**, change all of:
   - an ADR in [`docs/adr/`](docs/adr/README.md) (context, decision,
     consequences, alternatives),
   - the specification [`docs/spec/content-pack.md`](docs/spec/content-pack.md),
   - the zod schema in [`packages/engine/src/schema.ts`](packages/engine/src/schema.ts)
     and the generated JSON Schema (`npm run lexvm -- schema`),
   - the engine, the validator and tests,
   - the prompt kit (`npm run prompts`) and the authoring guide,
   - [`CHANGELOG.md`](CHANGELOG.md).
3. Follow the versioning rules of the specification
   ([section 16](docs/spec/content-pack.md#16-versioning-of-this-format)):
   - **Breaking changes** (a valid pack becomes invalid or behaves
     differently) get a new format string, for example `lexvm-pack/2`.
   - **Additive, backwards-compatible changes** keep `lexvm-pack/1` and are
     listed in the changelog.

If the specification and the schema disagree, that is a bug; fix both in the
same pull request.

## Contributing a content pack

Content packs live in `packs/<pack-id>/`; see [packs/README.md](packs/README.md)
for the layout and the [authoring guide](docs/authoring/guide.md) for how to
write one. To be merged, a content pack must:

- **Pass verification:** `npm run lexvm -- check packs/<pack-id>` reports no
  errors. Warnings need a reason in the pull request.
- **Declare its language** in `language` (BCP 47, currently `de` or `en`).
- **Declare its license** in `license` as an SPDX identifier. We recommend
  `CC-BY-4.0` for community packs (see
  [ADR 0010](docs/adr/0010-content-licensing.md)). The license must allow the
  project to redistribute the pack, including bundled into the player and
  release files, so non-commercial and no-derivatives licenses are not
  accepted. You must have the right to license the content: no text copied
  from other works, no characters or settings from copyrighted franchises.
- **State its provenance honestly** in `author` and `generator`. If an LLM
  wrote or co-wrote the pack, say so in `generator.pipeline` (for example
  "prompt kit, one-shot" or "lexvm generate") and describe the human editing
  in `generator.notes`. Undisclosed generated content will not be merged.
- **Have been played by a human** from start to end, in addition to the
  automatic checks. Say who played it and on which device.
- **Follow the content guidelines:**
  - No hateful content: nothing that demeans people for who they are.
  - No sexual content involving minors, in any form.
  - No real private individuals. Public historical figures may appear when
    they are portrayed fairly and the pack does not invent defamatory facts.
  - Historical settings (for example war, persecution, colonialism) are
    handled respectfully and with care for the people affected; atrocities
    are not used as puzzles or decoration.
  - Mature themes are fine when the pack's `description` makes them clear to
    players.

Bump `version` on every content change after a pack has been published, since
saves are bound to the pack version and content hash.

## Review process

- A maintainer reviews every pull request. At least one approval and green CI
  are required to merge.
- Reviewers check correctness, tests, the principles above and, for UI
  changes, behaviour on a phone viewport.
- Content packs get a content review: a reviewer plays the pack, checks the
  content guidelines, license and provenance, and may ask for edits to
  wording, hints or puzzle fairness.
- Format changes need an accepted ADR before the implementation is merged.
- This is a volunteer project. Reviews may take a few days; a polite ping
  after a week is fine.

## Labels and milestones

Labels and milestones are managed as code. Edit
[`.github/labels.json`](.github/labels.json) or
[`.github/milestones.json`](.github/milestones.json) in a pull request; after
the merge, the `Repo sync` workflow creates or updates them. It never deletes
labels or milestones; remove obsolete ones by hand.

| Label family | Meaning |
|---|---|
| `type: …` | Kind of work: `feature`, `bug`, `docs`, `chore`, `decision` (needs an ADR), `research`. |
| `area: …` | Part of the project: `engine`, `web`, `cli`, `pipeline`, `content`, `infra`, `community`. |
| `priority: …` | `high`, `medium`, `low`. |
| `content-pack` | Proposal or review of a content pack. |
| `good first issue`, `help wanted` | Entry points for new contributors. |

Milestones follow the [roadmap in the README](README.md#status): v0.1
Playable, v0.2 Authoring & Polish, v0.3 Community Pipeline, v1.0 Stable
Format.

## Licensing of contributions

- **Code and documentation** contributions are licensed under the project's
  [MIT License](LICENSE). There is no contributor license agreement.
- **Content packs** are licensed under the license declared in their
  `pack.yaml`.
