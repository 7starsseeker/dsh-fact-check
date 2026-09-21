<!-- Thanks. CONTRIBUTING.md has the long version; the checklist below is the short one. -->

## What this changes

<!-- One paragraph. If it changes the flow, the report template, the judgement layer or the trigger words, say so and say which. -->

## Checklist

- [ ] `SKILL.md` remains the single source of truth. If it was edited, `node tools/make-instructions.mjs` was run so `INSTRUCTIONS.md` matches (CI checks this).
- [ ] The offline checks pass: `node tools/smoke-plugin.mjs`, `node tools/jev-verdict.mjs selftest`, `node tools/route.mjs selftest`, `node tools/route.mjs regress --file cases/route-cases-neutral.json`.
- [ ] If the judgement layer or the routing tables changed: the affected corpora were re-run and the new numbers are in `MEASUREMENTS.md`.
- [ ] If user-facing behaviour changed: the `version` in the `SKILL.md` frontmatter was bumped and `CHANGELOG.md` has one entry. If only wording or docs changed: no version bump.
- [ ] No host path, endpoint, key or un-de-identified session content is included — machine-specific values belong in `tools/local.json`, which is git-ignored.

## Notes for the reviewer

<!-- Anything that looks wrong on purpose, or a rule you deliberately did not follow. -->
