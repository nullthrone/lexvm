## Summary

<!-- What does this change and why? One or two short paragraphs. -->

## Linked issues

<!-- "Closes #123" closes the issue on merge. Non-trivial changes need an issue first. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Content pack (new or updated)
- [ ] Content pack format or save format change (ADR required)
- [ ] Documentation
- [ ] Tooling, CI or maintenance

## Checklist

- [ ] Tests added or updated (unit tests; end-to-end tests for user-facing player flows)
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run check:packs` passes
- [ ] Docs updated where behaviour changed; for format changes: spec, schema, ADR and changelog updated in this PR
- [ ] Prompt kit regenerated (`npm run prompts`) if the spec, schema or authoring guide changed
- [ ] UI changes: screenshots from a phone viewport (portrait, for example 390 by 844) attached below
- [ ] No new runtime dependency, or the reason is given above

## Content packs only

<!-- Delete this section if the PR does not add or change a content pack. -->

- [ ] `npm run lexvm -- check packs/<pack-id>` reports no errors; remaining warnings are explained
- [ ] `language` and `license` (SPDX) are declared
- [ ] `author` and `generator` state honestly how the pack was written, including any LLM involvement
- [ ] Played through by a human (who, which device):
- [ ] Follows the content guidelines in CONTRIBUTING.md
- [ ] `version` bumped (for changes to a published pack)

## Screenshots

<!-- For UI changes. Phone viewport first. -->
