# 0009. Vanilla TypeScript UI without a framework

- Status: Accepted
- Date: 2026-10-23

## Context

The player's user interface is small: a library, a story view, action
sheets, a parser field, a hint panel, menus for saves, settings and the
prompt kit. All game logic lives in the engine; the UI renders `view` and the
output blocks of `step`.

Constraints:

- It must start fast and stay responsive on older, low-end phones.
- It must ship as a single HTML file as well as a PWA.
- It should be maintainable for years by volunteers, with few dependency
  upgrades and a small supply-chain surface.
- Pack text must never be rendered as HTML ([SECURITY.md](../../SECURITY.md)).

## Decision

The player is written in **vanilla TypeScript** with the DOM API and no UI
framework:

- small rendering functions per view that create elements and set
  `textContent`;
- explicit state held by the application, re-rendering only the parts that
  change;
- CSS with custom properties for the themes (sepia, light, dark) and book
  typography;
- tooling: **Vite** for development and builds (with a single-file build
  plug-in), **Biome** for linting and formatting, **Vitest** for unit tests,
  **Playwright** for end-to-end tests.

## Consequences

- Small bundle, fast start, no framework upgrade treadmill.
- Contributors need only TypeScript and the DOM API.
- No `innerHTML` by default makes the "text, never HTML" rule easy to follow
  and to review.
- More manual code for DOM updates, focus management and accessibility that
  a framework or component library would partly provide; we accept that and
  cover it with end-to-end tests.
- If the UI grows much larger (for example an in-browser pack workshop in
  v0.2), this decision should be revisited in a new ADR.

## Alternatives considered

- **React or Preact.** Large ecosystem and familiar to many contributors, but
  more runtime and tooling than the UI needs; Preact would be small, but
  still adds a component model and JSX.
- **Svelte or Solid.** Small output, but a compiler or reactive runtime and
  framework-specific knowledge.
- **Lit and web components.** Close to the platform, but adds a dependency
  and the shadow DOM complicates styling with book typography and themes.
- **A UI framework with a component library** (for example Ionic). Fast to
  build standard mobile screens, but heavy and visually generic, which does
  not fit a book-like reading experience.
