# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

**简体中文 → [CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md)**

## Before you start

There is no build step and no runtime dependency: `git clone`, then run the tools with Node ≥ 18.
The package is intentionally dependency-free, so a pull request that adds a package dependency needs a
strong reason.

## Two load-bearing rules

1. **`SKILL.md` is the single source of truth.**
   - `INSTRUCTIONS.md` is *generated* from it — never hand-edit that file; run
     `node tools/make-instructions.mjs` instead.
   - `lib/index.js` re-reads `SKILL.md` on every load, so the plugin's skill description cannot drift
     from the file. `node tools/smoke-plugin.mjs` asserts exactly that; keep it passing.
2. **Changing the judgement layer or the routing tables is a recalibration event.**
   - `tools/jev-verdict.mjs` ships frozen question literals; any change to an instruction, a criterion or
     a threshold requires re-running the corresponding corpus under `cases/` and writing the new numbers
     into `MEASUREMENTS.md`.
   - The same holds for the trigger-word and domain tables in `tools/route.mjs`.

## Run before opening a pull request

```sh
node tools/smoke-plugin.mjs                          # plugin mount + single source of truth
node tools/jev-verdict.mjs selftest
node tools/route.mjs selftest
node tools/route.mjs regress --file cases/route-cases-neutral.json
node tools/make-instructions.mjs                     # only if you edited SKILL.md
```

All of these run offline and need no API key.

## Machine-specific values never enter the repository

Endpoints, keys, host paths and "which channel actually works here" belong in `tools/local.json`, which is
git-ignored; `tools/local.example.json` is the template. `tools/*.mjs` carry assertions that fail if a host
path is hard-coded, and `SKILL.md` may not name a host, an internal address, a path or a key.

## Versioning

Bump the `version` in the `SKILL.md` frontmatter and add one entry to `CHANGELOG.md` **only** when the
change alters user-facing behaviour — the flow, the report template, the judgement layer, or the trigger
words. Wording and documentation changes do not earn a version. `CHANGELOG.md` records the net difference
between versions, not the development log.

Also regenerate `INSTRUCTIONS.md` whenever `SKILL.md` changes, so the two never diverge.

## Regression corpora

`cases/*.json` are de-identified: host paths, private tool names and instance identifiers are replaced
with `<placeholders>`, while public stack names and the observation data itself are kept — the specific
provenance of a sample is part of what a judgement is calibrated against. If you contribute a sample,
redact the same way and read [`cases/README.md`](./cases/README.md) first.
