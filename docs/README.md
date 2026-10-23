# LexVM documentation

Start with the [project README](../README.md) for what LexVM is and how to
play. This index lists the documentation by audience.

## Players

- [Play offline](../README.md#play-offline): installing the player on a
  phone or tablet, and the single-file offline version.

## Content pack authors

| Document | Contents |
|---|---|
| [Content pack specification](spec/content-pack.md) | The normative definition of the format `lexvm-pack/1`. |
| [Authoring guide](authoring/guide.md) | How to design and write a content pack: structure, puzzles, hints, text style, verification. |
| [Generation pipeline](authoring/pipeline.md) | Generating a content pack with an LLM: the prompt kit (any LLM, copy and paste) and `lexvm generate` (CLI). |
| [Prompt kit](../prompts/) | Ready-to-use prompts, generated from the specification and the authoring guide (for example [`oneshot.md`](../prompts/oneshot.md)). |
| [Content packs](../packs/README.md) | How the packs in this repository are organised, verified and licensed. |
| [Demo pack](../packs/locked-study/pack.yaml) | `locked-study`: a short, complete reference example. |

## Contributors

| Document | Contents |
|---|---|
| [Contributing guide](../CONTRIBUTING.md) | Setup, workflow, principles, format changes, content pack requirements, review. |
| [Architecture](architecture.md) | Components, data flow, determinism, verification, offline model, security model, extension points. |
| [Architecture decision records](adr/README.md) | Why LexVM is built the way it is. |
| [Changelog](../CHANGELOG.md) | Notable changes per release. |
| [Security policy](../SECURITY.md) | Supported versions, reporting, threat model. |
| [Code of Conduct](../CODE_OF_CONDUCT.md) | Expected behaviour in the community. |

## Conventions

- Documentation is written in English. Player-facing UI text exists in
  German and English ([ADR 0008](adr/0008-language-policy.md)).
- Terminology: **content pack** (a game as data), **engine** (the
  deterministic runtime in `packages/engine`), **player** (the web app in
  `apps/web`), **CLI** (the `lexvm` command in `packages/cli`).
- The specification is normative. If prose elsewhere contradicts it, the
  specification wins and the other document is fixed.
