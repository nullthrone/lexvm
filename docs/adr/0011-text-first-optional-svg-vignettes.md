# 0011. Text first, optional SVG vignettes later

- Status: Accepted
- Date: 2026-10-23

## Context

LexVM plays text adventures on phones and tablets, offline, from a cache the
browser may evict under storage pressure
([ADR 0006](0006-offline-first-pwa-on-github-pages.md)). Content packs are
written largely by LLMs and verified automatically
([ADR 0003](0003-packs-are-declarative-data.md),
[ADR 0005](0005-forgiving-policy-verified-by-exploration.md)).

Players and contributors will ask for pictures: room illustrations, character
portraits, item icons. Pictures would add atmosphere, but they change the
economics of the project:

- **Size.** A compiled pack of 30 to 45 minutes is roughly 100 to 200 KB of
  JSON. One raster illustration per room (10 to 12 rooms) adds several
  megabytes, which multiplies the offline cache and the single-file build.
- **Generation and review.** Text is generated, validated and diffed in pull
  requests. Images need a different pipeline (image models, licensing,
  provenance, accessibility descriptions) and cannot be checked by the
  verifier.
- **Accessibility.** Every image needs a text alternative; the game must stay
  fully playable without seeing it.
- **Consistency.** Mixed-quality images undermine the book typography the
  player is designed around.

## Decision

1. **LexVM stays text first.** The format `lexvm-pack/1` contains no images,
   and every game must be fully playable as text.
2. **Optional vignettes may come later as a format extension.** If added, they
   are small, inline **SVG** decorations (for example a chapter vignette or a
   room ornament), not raster illustrations:
   - declared per pack and per room, never required;
   - size-budgeted (a per-file and a per-pack limit enforced by `lexvm check`);
   - sanitised to a safe SVG subset (no scripts, no external references, no
     foreign objects), rendered without `innerHTML` and compatible with the
     player's Content-Security-Policy;
   - with a text alternative, and hidden when the player turns them off.
3. **Raster images are out of scope** until a separate ADR addresses size,
   provenance and licensing.

## Consequences

- Packs remain small, diffable, verifiable and cheap to cache offline.
- LLM generation stays a text-only task; no image pipeline is needed for v0.x.
- Atmosphere comes from writing and typography. The player's themes and type
  carry the visual identity.
- A future vignette extension is additive and keeps `lexvm-pack/1`
  compatible: packs without vignettes are unaffected.

## Alternatives considered

- **Raster illustrations per room.** Strongest atmosphere, but multiplies
  pack size and the offline cache, needs an image pipeline and licensing
  review, and cannot be verified.
- **ASCII art.** Tiny and text-native, but reads poorly with proportional
  serif type, breaks on narrow screens and is hard for screen readers.
- **Images loaded from the network.** Keeps packs small, but contradicts
  offline-first play and the no-network-at-runtime rule.
