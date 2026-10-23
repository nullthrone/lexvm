# Security Policy

## Supported versions

LexVM is pre-1.0. Security fixes are made on `main` and ship with the next
deployment and release.

| Version | Supported |
|---|---|
| `main` and the player at <https://nullthrone.github.io/lexvm/> | Yes |
| Latest `0.x` release | Yes |
| Older releases | No |

The deployed player updates itself: a fixed version is installed the next
time the player starts while online. Downloaded copies of
`lexvm-offline.html` do not update; replace them with a fixed release.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub:

1. Open the [Security tab](https://github.com/nullthrone/lexvm/security) of
   the repository.
2. Click **Report a vulnerability**
   ([direct link](https://github.com/nullthrone/lexvm/security/advisories/new)).

Do not open a public issue or pull request for a vulnerability.

A useful report contains:

- the affected component (engine, player, CLI, workflows) and the version or
  commit;
- the input that triggers it, ideally a minimal content pack, save file or
  command log;
- what happens and what an attacker gains;
- the browser and device, for player issues.

We aim to acknowledge a report within 7 days and to agree on a disclosure
date with you. This is a volunteer project, so fixes can take longer; we will
keep you informed. We credit reporters in the advisory unless you prefer
otherwise.

## Threat model

LexVM is a static web application and a command line tool. There is no
server, no account system and no user data beyond what the player stores in
the browser on the player's own device.

### Untrusted input

The following inputs are untrusted and must never be able to execute code,
inject markup or exfiltrate data:

- **Content packs**, as YAML or `.lexpack.json`, whether bundled, imported
  from a file, pasted from an LLM chat or produced by `lexvm generate`.
- **Save files** and command logs.
- **Text typed into the parser.**

### Controls

| Control | What it means |
|---|---|
| Schema validation | Every content pack is parsed and validated against the zod schema and the semantic checks before the engine sees it. Invalid packs are rejected with diagnostics. Save files are validated before they are restored. |
| No code execution | Content packs are data. Game logic uses a closed vocabulary of conditions and effects. The engine never evaluates strings as code (no `eval`, no `new Function`, no dynamic `import`). |
| No HTML rendering of pack text | Pack text is inserted as text nodes, never as HTML. The only markup is `{object_id}` references, which the engine resolves to structured spans. |
| No network access at runtime | The player loads only its own same-origin assets. It sends no analytics and loads no third-party scripts, styles or fonts. Content packs cannot reference URLs. |
| Service worker scope | The service worker is registered with scope `./`, the directory the player is served from (`/lexvm/` on GitHub Pages). It answers only same-origin `GET` requests for the files of its own build (and navigations with the cached app shell), never touches cross-origin requests, and is replaced as a whole on update. |
| Safe identifiers | Ids match `^[a-z][a-z0-9_]*$`, which rules out keys such as `__proto__`. Ids such as `constructor` remain valid, so code must use own-property lookups (`Object.hasOwn`) or `Map`s, never `in` or plain property access on prototype-bearing objects. |
| Bounded verification | State-space exploration stops at a state limit and reports an incomplete result instead of running unbounded. One engine call is bounded in nesting depth and in total work (effects run, rooms and dialogue nodes entered), so rules that fan out cannot freeze the player. Analyzer suggestions, diagnostic texts and the walkthrough output kept per step are bounded as well. |
| Content-Security-Policy | Both builds carry a CSP meta tag generated at build time from the final HTML: `default-src 'none'`, scripts and styles from the app's origin plus the hashed inline theme script (PWA) or only hashed inline code and `data:` images (single file), no `eval`, `object-src`/`base-uri`/`form-action` `'none'`, and Trusted Types required for script sinks (the only one used is the service worker URL, through the `lexvm` policy). The end-to-end tests fail on any CSP or Trusted Types violation. |
| Untrusted saves | A saved state that the command log does not reproduce is checked against the pack (declared ids only, the pack's exact objects, flags and counters, a dialogue with an available option) before it is used; otherwise the game continues from what the log reproduces. Save files over 5 MB are refused. |
| Terminal output | The CLI turns control characters and bidirectional overrides in pack text into visible escapes (`\u{1b}`) before printing, so packs cannot set the window title, write the clipboard (OSC 52) or move the cursor. |
| Least-privilege workflows | Workflows that run `npm ci` and the build have read-only tokens and do not keep them in `.git/config`; only the jobs that publish a release or deploy Pages get write permissions. Actions are pinned to commit SHAs (Dependabot updates them). |
| CLI secrets | `lexvm generate` reads the API key from `ANTHROPIC_API_KEY` and sends it only to the Anthropic API. It never writes the key to files or logs. |

### Known limitations

- **Shared origin.** All GitHub Pages sites of one account share the origin
  `https://nullthrone.github.io`, so browser storage (saves, imported packs)
  is readable by other Pages sites of the same account. Saves contain no
  personal data.
- **No custom headers.** GitHub Pages cannot send custom HTTP headers. The
  Content Security Policy is delivered as a `<meta>` tag, and a meta tag
  cannot set `frame-ancestors`, so the player can be framed by other sites.
  It has no state-changing action a click-jacking frame could abuse beyond
  the player's own game.
- **Import checks on the main thread.** The player compiles an imported
  pack and replays its walkthrough on the main thread. A crafted pack of a
  few megabytes can block the tab for seconds while it is checked; it is not
  stored unless it compiles.
- **Saves are not tamper-proof.** The pack hash in a save detects a changed
  pack; it does not authenticate the save. Editing your own save is not a
  vulnerability.

## Scope

In scope:

- Script execution or HTML injection in the player through a content pack, a
  save file or parser input (XSS).
- Code execution in the engine or the CLI through a content pack or save file.
- Prototype pollution or state corruption that crosses content pack
  boundaries, for example one imported pack affecting another pack's saves.
- A crafted content pack or save that makes the player unusable after it has
  been imported, for example a crash on every start.
- Network requests made by the player at runtime.
- Service worker behaviour that serves stale or foreign content outside the
  normal update cycle.
- Leaking the API key or other secrets from the CLI.
- Vulnerabilities in our GitHub Actions workflows, such as script injection
  from issue or pull request content.

Out of scope:

- The content of third-party content packs (offensive or inappropriate
  content). Report it in an issue or under the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- Spoilers, cheating and editing your own saves.
- Slow verification of very large packs in the CLI, which is bounded by the
  state limit.
- Behaviour of LLMs or LLM providers, including the quality of generated
  packs.
- Vulnerabilities in browsers, operating systems or GitHub Pages
  infrastructure; please report those to the respective vendor.
- Attacks that require a compromised device or browser profile.
- Vulnerabilities in dependencies without a demonstrated impact on LexVM;
  please report them upstream (Dependabot keeps our dependencies updated).
