# 0006. Offline-first PWA on GitHub Pages

- Status: Accepted
- Date: 2026-10-23

## Context

Players use phones and tablets, often without a network (travel, airplane
mode). The project has no budget for servers and no wish to run accounts,
collect data or pass app store reviews. Distribution must be as simple as
opening a link, and it must also be possible to keep a copy that works
without any server at all.

The repository is on GitHub, and GitHub Pages serves static files over HTTPS
for free, with deployment from GitHub Actions.

## Decision

- The player is a **progressive web app** (PWA): static files with a web app
  manifest and a service worker, installable via **Add to Home Screen** on
  iOS and iPadOS and **Install app** on Android and desktop browsers.
- It is **hosted on GitHub Pages** at <https://nullthrone.github.io/lexvm/>
  and deployed by [`pages.yml`](../../.github/workflows/pages.yml) on every
  push to `main`.
- The **service worker is hand-written**: it precaches the build (app shell
  and bundled content packs) under a cache name versioned per build, serves
  same-origin requests from the cache, and activates a new version on the
  next launch.
- The build also produces **`lexvm-offline.html`**, a single file with all
  code, styles and bundled packs inlined, which works from `file://`. It is
  published on GitHub Pages next to the app and attached to every GitHub
  Release ([`release.yml`](../../.github/workflows/release.yml)).
- The player makes **no network requests at runtime** beyond its own files.
  Saves, settings and imported packs stay in browser storage on the device.

## Consequences

- Free hosting, no backend, no accounts, no tracking; privacy by
  construction.
- Works in airplane mode after the first visit.
- The single-file build gives players and archivists a copy that does not
  depend on GitHub, and lets people pass the game on as a file.
- The build uses relative URLs (Vite `base: "./"`) and hash routes, so the
  same files run under `/lexvm/` on GitHub Pages, on any other path and from
  `file://`. The service worker is registered with scope `./`, the directory
  the player is served from (`/lexvm/` on GitHub Pages). (Amended during
  implementation: this ADR first fixed both to `/lexvm/`.)
- GitHub Pages cannot send custom HTTP headers; security headers such as a
  Content Security Policy can only be set via `<meta>` tags (both builds
  carry one, see [SECURITY.md](../../SECURITY.md)).
- All GitHub Pages sites of the account share one origin and therefore
  browser storage (see [SECURITY.md](../../SECURITY.md)).
- iOS may evict storage of websites that are not installed; the README
  recommends **Add to Home Screen** for iPhone and iPad.
- The service worker is our own code and must be tested (offline e2e tests),
  since a broken service worker can pin users to a broken version.
- A maintainer must set **Settings → Pages → Source = GitHub Actions** once.

## Alternatives considered

- **Native apps** (Swift, Kotlin). Best platform integration, but two code
  bases, developer program fees and store review for every content update.
- **Web app wrapped as a native app** (Capacitor, Tauri). Store presence, but
  still store review and signing, for little gain over a PWA.
- **Workbox or `vite-plugin-pwa`** for the service worker. Less code to write,
  but more dependencies and configuration than the few dozen lines our
  precache-only strategy needs; a hand-written worker is easier to audit.
- **Other static hosts** (Netlify, Cloudflare Pages). Comparable, and would
  allow custom headers, but add an external account; GitHub Pages lives next
  to the repository and its permissions.
- **A server-backed web app.** Would enable cloud saves and a catalog, but
  contradicts offline-first and adds cost and personal data.
