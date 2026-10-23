# 0005. Forgiving policy, verified by state-space exploration

- Status: Accepted
- Date: 2026-10-23

## Context

Many early adventure games were "cruel": the player could die, or lose an
item needed to win and only find out hours later. LucasArts adopted the
opposite rule for its games: the player cannot die, and cannot get stuck in
an unwinnable state. Ron Gilbert's 1989 essay "Why Adventure Games Suck"
argues for this approach.

For LexVM the rule matters even more:

- Players play in short sessions on phones and should not need to save
  defensively.
- LLM-generated packs are especially prone to dead ends, for example a key
  that is consumed before its second use, or a one-time dialogue option that
  hides the only clue.
- Manual playtesting cannot cover every order of actions.

Because packs are declarative data with a deterministic engine
([ADR 0003](0003-packs-are-declarative-data.md)), the state space of a pack
can be explored mechanically.

## Decision

- The only policy is `forgiving`: every ending must be a winning ending, and
  from every reachable state a winning ending must remain reachable.
- `lexvm check` verifies this in two ways:
  1. **Walkthrough replay**: the pack's `walkthrough` must be accepted
     command by command and end in a winning ending.
  2. **State-space exploration**: a breadth-first search over all reachable
     logical states (deduplicated by `stateKey`, which ignores the turn
     counter) using every action the engine offers, except `drop`. It
     reports dead ends and losing endings with the command path that leads
     there, and content that is never reached.
- A pack is publishable only when `lexvm check` reports no errors. CI runs
  it for every pack in the repository.

## Consequences

- Players can experiment freely; there is no need for defensive saving.
- Authors get concrete counterexamples ("after `give lamp graves`, the cellar
  can no longer be reached") instead of vague bug reports. The same
  diagnostics drive LLM repair loops.
- Pack design is constrained: no death, no permanent loss of required items,
  and counters changed every turn must be bounded.
- Large packs can exceed the state limit (200,000 states by default). The
  result is then incomplete, not a proof (an error since the amendment
  below).
- `drop` is excluded from the main exploration because it multiplies the
  state space. A second, bounded exploration covers it (see the amendment
  below); the explorer's `includeDrop` option includes it in one search.
- The `policy` field leaves room for other policies later; adding one is a
  format change that needs an ADR.

## Amendment (2026-10-23): incomplete explorations and `drop`

A review showed that `lexvm check` called a pack publishable although the
exploration had stopped at the state limit, and that tap players could reach
dead ends by dropping items, which the action sheets offer. Therefore:

- An incomplete exploration proves nothing and is an error
  (`explore.incomplete`). `lexvm check --allow-incomplete` reports it as a
  warning for packs that are knowingly too large to verify.
- When the main exploration is complete and clean, `lexvm check` and the
  `lexvm generate` gate run a second exploration that also drops carried
  items, with a smaller state budget (20 times the main exploration's
  states, at least 20,000). Its dead ends are errors; if it cannot finish,
  an info (`explore.drop-incomplete`) says so.
- `inventory` is not an offered action: the player's inventory button only
  shows the bag, so a solution that needs the command is not a solution for
  tap players.

## Alternatives considered

- **Allow losing endings and rely on undo and saves.** Simpler for authors,
  but frustrating on phones and contrary to the project's design goals.
- **Playtesting only.** Necessary for quality, but cannot cover all action
  orders, especially for generated packs.
- **Static analysis only** (for example checking that every required item is
  obtainable). Cheaper, but misses dead ends that come from interactions
  between rules.
- **Symbolic model checking** (SAT or SMT solvers). Could scale further, but
  adds heavy dependencies and complexity; breadth-first search is sufficient
  for the pack sizes we target.
