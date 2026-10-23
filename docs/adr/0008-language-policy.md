# 0008. Language policy

- Status: Accepted
- Date: 2026-10-23

## Context

LexVM's first audience is German-speaking, and the first full content pack
is German. At the same time, the project is meant for an international
community of contributors, and the engine is meant to play games in more than
one language.

Three kinds of language need a rule:

1. the language of the project itself (code, documentation, issues);
2. the language of the player's user interface;
3. the language of a game, including the engine's own messages ("Nothing
   happens.") and the parser vocabulary.

## Decision

- **Project language: English.** Code, comments, identifiers, commit
  messages, documentation, issues, pull requests and ADRs are in English.
  German is welcome in discussions about German content.
- **UI languages: German and English.** The player's interface (menus,
  library, settings, prompt kit screens) is available in both and follows the
  device language, falling back to English.
- **Game language: declared per content pack.** Each pack declares
  `language` (BCP 47, currently `de` or `en`). It selects the engine messages
  and the parser for that game, independently of the UI language. A German
  pack stays German in an English UI.
- **First content pack: German.** The demo pack `locked-study` is English, as
  the reference example for authors and prompts.
- Ids in packs are language-neutral `lower_snake_case`; canonical commands in
  walkthroughs and save logs use ids, so logs are the same in every language.

## Consequences

- Contributors worldwide can work on the code and documentation.
- Every engine message and parser feature exists per supported game
  language. Adding a game language means adding engine messages and a parser
  vocabulary, and accepting the code in `language`.
- Mixed situations are normal (English UI, German game); the UI must not
  assume that the game text is in the UI language.
- German needs inflected forms in text references (`{logbook|des Logbuchs}`)
  and a parser that handles articles and cases; the format supports this.

## Alternatives considered

- **German as the project language.** Natural for the initial maintainers,
  but limits the contributor base.
- **Game text following the UI language** (packs with translations for every
  string). Doubles the authoring and verification effort and makes LLM
  generation harder; packs can be translated as separate packs instead.
- **English only, including UI and games.** Excludes the primary initial
  audience.
