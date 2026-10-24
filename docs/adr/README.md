# Architecture decision records

An architecture decision record (ADR) captures one significant decision: the
situation that forced it, what was decided, what follows from it, and what
else was considered. ADRs explain *why* LexVM is built the way it is, so that
later contributors can build on decisions or revisit them deliberately
instead of by accident ([ADR 0001](0001-record-architecture-decisions.md)).

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-tap-first-interaction-with-optional-parser.md) | Tap-first interaction with an optional parser | Accepted |
| [0003](0003-packs-are-declarative-data.md) | Content packs are declarative data | Accepted |
| [0004](0004-yaml-source-json-runtime-zod-schema.md) | YAML source, JSON runtime, zod schema as source of truth | Accepted |
| [0005](0005-forgiving-policy-verified-by-exploration.md) | Forgiving policy, verified by state-space exploration | Accepted |
| [0006](0006-offline-first-pwa-on-github-pages.md) | Offline-first PWA on GitHub Pages | Accepted |
| [0007](0007-llm-pipeline-byo-prompt-kit-and-api-generator.md) | LLM pipeline: bring-your-own prompt kit and API generator | Accepted |
| [0008](0008-language-policy.md) | Language policy | Accepted |
| [0009](0009-vanilla-typescript-ui.md) | Vanilla TypeScript UI without a framework | Accepted |
| [0010](0010-content-licensing.md) | Content licensing | Proposed |
| [0011](0011-text-first-optional-svg-vignettes.md) | Text first, optional SVG vignettes later | Accepted |
| [0012](0012-narrative-pacing.md) | Narrative pacing: calibrate play time by reading share, write story before data | Accepted |

## When to write an ADR

Write an ADR for a decision that is hard to reverse or that contributors will
ask about later, for example:

- any change to the content pack format or the save format;
- a change to a [project principle](../../CONTRIBUTING.md#project-principles);
- a new runtime dependency, framework, hosting or build approach;
- a change to how content is generated, verified, licensed or reviewed.

Issues that need a decision are labelled `type: decision`.

## Process

1. Copy the template below to `NNNN-short-title.md` with the next free
   number. Numbers are never reused.
2. Open a pull request with status **Proposed**. For format changes, the same
   pull request also changes the specification and the schema (see
   [CONTRIBUTING.md](../../CONTRIBUTING.md#changing-the-content-pack-format)).
3. On merge, the status becomes **Accepted** (or **Rejected**, which is also
   worth recording).
4. Accepted ADRs are not rewritten. To change a decision, write a new ADR
   and set the old one's status to `Superseded by NNNN`, linking the new ADR.
   Fixing typos and links is fine.

Statuses: Proposed, Accepted, Rejected, Deprecated, Superseded.

## Template

```markdown
# NNNN. Title in the imperative or as a noun phrase

- Status: Proposed
- Date: YYYY-MM-DD

## Context

What is the situation and the problem? Which forces and constraints apply
(technical, product, community, legal)? Keep it factual.

## Decision

What we do, stated precisely. "We will ..."

## Consequences

What becomes easier and what becomes harder. Follow-up work, risks, and how
we will notice if the decision turns out wrong.

## Alternatives considered

- **Alternative A.** Why it was not chosen.
- **Alternative B.** Why it was not chosen.
```

The format is a light version of [MADR](https://adr.github.io/madr/).
