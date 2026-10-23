# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-10-23

## Context

LexVM is an open-source project that expects contributors who were not there
when its foundations were laid. Several early decisions (content packs as
data, the forgiving policy, the hosting model, no UI framework) constrain
almost every later change. Without a record of why they were made, they get
re-litigated in pull requests or silently eroded.

The content pack format is also a public contract with authors and with LLM
pipelines. Changes to it need a deliberate, reviewable decision.

## Decision

We will record significant decisions as architecture decision records in
`docs/adr/`, numbered sequentially, using the light MADR-style template in
[the ADR index](README.md). Each ADR states context, decision, consequences
and alternatives considered.

An ADR is required for changes to the content pack or save format, to the
project principles, and for new runtime dependencies, frameworks or hosting
approaches. Accepted ADRs are immutable except for typo and link fixes; a
changed decision gets a new ADR that supersedes the old one.

## Consequences

- New contributors can read why things are as they are before proposing
  changes.
- Format changes carry their rationale in the same pull request as the
  specification and schema change.
- Writing an ADR costs time; small, reversible decisions do not need one.
- The ADR index must be kept up to date in the same pull request.

## Alternatives considered

- **Decisions in issues and pull requests only.** Searchable, but scattered
  and hard to find as a coherent picture.
- **A single design document.** Easier to read once, but it gets rewritten
  over time and loses the history of why something changed.
- **A wiki.** Not versioned with the code and not reviewed in pull requests.
