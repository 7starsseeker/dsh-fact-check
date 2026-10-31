# dsh-fact-check

[![version](https://img.shields.io/github/v/tag/7starsseeker/dsh-fact-check?label=version)](https://github.com/7starsseeker/dsh-fact-check/tags)
[![npm](https://img.shields.io/npm/v/dsh-fact-check?label=npm&style=flat)](https://www.npmjs.com/package/dsh-fact-check)
[![npm downloads](https://img.shields.io/npm/dm/dsh-fact-check?label=downloads&style=flat)](https://www.npmjs.com/package/dsh-fact-check)
[![selftest](https://img.shields.io/github/actions/workflow/status/7starsseeker/dsh-fact-check/selftest.yml?label=selftest)](https://github.com/7starsseeker/dsh-fact-check/actions/workflows/selftest.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)
[![DSH plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4B6BFB.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)
[![last commit](https://img.shields.io/github/last-commit/7starsseeker/dsh-fact-check)](https://github.com/7starsseeker/dsh-fact-check/commits/main)
[![stars](https://img.shields.io/github/stars/7starsseeker/dsh-fact-check?style=flat)](https://github.com/7starsseeker/dsh-fact-check/stargazers)
[![issues](https://img.shields.io/github/issues/7starsseeker/dsh-fact-check)](https://github.com/7starsseeker/dsh-fact-check/issues)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

> A fact-checking skill for DeepSeek Harness that verifies claims against the open web instead of model
> memory — multi-source cross-checking, domestic and international search ecosystems in parallel,
> adversarial re-search, and a conclusion-first report where every statement is traceable.

**简体中文 → [README.zh-CN.md](./README.zh-CN.md)**

---

## Table of contents

- [What it is](#what-it-is)
- [Requirements](#requirements)
- [Install](#install)
- [How it works](#how-it-works)
- [The optional Jev decision layer](#the-optional-jev-decision-layer)
- [Verify it yourself](#verify-it-yourself)
- [Project layout](#project-layout)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

## What it is

A fact-checking skill. Hand it a claim, a rumour, a figure, a news item or a "is this true?" and it
returns a verification report. What separates it from asking a model directly is that it is built around
five rules it is not allowed to skip:

1. **No model memory.** Even if the model "knows" the answer, it must verify by searching the internet
   first. If search is unavailable it reports *"cannot verify"* — it never substitutes recollection.
2. **Multi-source cross-checking.** Every fact point needs 2–3 mutually *independent* sources. Multiple
   outlets reprinting one original report count as **one** source, not three.
3. **Domestic and international in parallel.** The same claim is searched from both ecosystems and both
   sides are reported separately, because much information exists on only one side.
4. **Adversarial re-search.** Once a conclusion forms, it searches reverse/debunking keywords on purpose.
   High confidence is only granted when no counter-evidence is found.
5. **Everything traceable.** Every assertion, number, date and quotation carries a full URL, the source
   name, and the exact citation position.

The output is a **conclusion-first** report with a numbered source appendix. Partially verified findings
are kept in their own sections — *unverified* and *undecidable* never sit in the same paragraph as
*confirmed* — so a guess cannot be quoted as if it were settled.

## Requirements

| | |
|---|---|
| **Required** | An agent that can search the public web **and fetch page bodies** (any one working fetch chain). Without search the skill reports "cannot verify" rather than guessing. |
| **Recommended** | Batch/multi-engine search, an archive service (Wayback), a sub-agent mechanism for parallel evidence gathering. |
| **Optional** | [Node.js](https://nodejs.org) **≥ 18** for the two bundled tools; a TypeSafe Jev key for the decision layer. |

The skill body is not bound to any host, product or tool chain: it names *capabilities*, and
[`ADAPTING.md`](./ADAPTING.md) maps them onto your environment.

**Verified hosts: DSH 0.1.7-rc.2, 0.2.0-rc.2, 0.2.1-rc.2, 0.2.1-rc.3 and 0.2.1-rc.5.** DSH 0.1.7-rc.2 was checked end to end on 2026-09-25 (Node 24.21.0, WSL/Linux): the host discovers the skill
and loads its body; the plugin form mounts on the host's own skill registry with `source: bundled`, its
description read from `SKILL.md` and `get()` returning that body verbatim; `npm run selftest` passes
(plugin mount 27/27, `jev-verdict` 25/25, `route` 37/37); `route.mjs regress` is 26/26 offline; and the
judgement corpora reproduce the expectations in [`MEASUREMENTS.md`](./MEASUREMENTS.md) §6 — `support`
37/40, `injection` 11/12, `provenance` 15/16, `usable_page` 12/12, `sufficient` 24/40 (the last one is
the criterion §1 already says not to use on its own). No host version is declared in `package.json` —
`engines` carries only `node`, and an exact version there would make the plugin market report
"confirmed incompatible" and block every other host — so a host not listed here is untested, not
forbidden.

**DSH 0.2.0-rc.2 was checked end to end on 2026-09-30** — this time the host *was* upgraded (`@deepseek-ai/dsh-desktop-runtime` 0.2.0-rc.2, Node 24.12.0, Windows). The directory form is live on it: the running session's own skill catalog lists `fact-check`, discovered from the host's skill directory by the host's real `@deepseek-ai/dsh-skill-filesystem` provider. The tools were re-run on that host against the live judgement model: `npm run selftest` 27/27, 25/25, 37/37; `route.mjs regress` 26/26; and the judgement corpora, which need a key — `support` 37/40 (Brier 0.0451), `injection` 11/12 (0.0369), `primary_source` 15/16 (0.0487), `usable_page` 12/12 (0.0031) — all reproducing the [`MEASUREMENTS.md`](./MEASUREMENTS.md) §6 expectations. The host file implementing the skill registry is byte-identical between 0.1.7-rc.2 and 0.2.0-rc.2, so no code change was needed and none was made. One thing stays where the 2026-09-29 round left it: the **plugin** form was not mounted on this host — that machine runs the directory form, so the plugin package is not installed there — and its evidence remains the registration check against the host's own **published** `0.2.0-rc.2` packages, where it mounts on the real `@deepseek-ai/dsh-skill` 0.2.0-rc.2 registry with its candidate rank equal to the host's exported `BUNDLED_SKILL_RANK` and `get()` returning the `SKILL.md` body verbatim (15/15), and the directory form wins the same-name merge against the bundled copy at rank 400 against 600 (6/6).

**DSH 0.2.1-rc.2 was checked end to end on 2026-10-17** (Node 24.21.0, Windows). The registry implementation (`@deepseek-ai/dsh-skill`'s `lib/index.js`) has **no content change** between 0.2.0-rc.2 and 0.2.1-rc.2 — the diff is line endings and version metadata only (`package.json` bumps the peers to cordis `~4.0.5` and adds a `./locale/*.json` export) — so no API adaptation was needed. What did change is what a provider may do with `control`, and this package now uses both 0.2.1 affordances: the candidate carries `path` (the absolute `SKILL.md`, retained in catalog summaries), and the provider watches `SKILL.md` and calls `control.invalidate()` on save, so editing the body refreshes the session catalog without a restart (150 ms debounce; the watcher is torn down on `control.signal` abort or context dispose, and a host that passes no `control` keeps the previous "restart to re-read" behavior). Evidence: the plugin was mounted on the host's own `0.2.1-rc.2` registry code (taken from the shipped asar, wired with the host's own cordis 4.0.5) and on the **published** `0.2.0-rc.2` package — 21/21 checks on each, `snapshot.complete === true`, `get()` returning the body verbatim, `provider.list()` rank 600, and both edit→refresh cycles observed; `npm run selftest` 27/27, 25/25, 37/37 and `route.mjs regress` 26/26 re-run on Node 24.21.0.

**DSH 0.2.1-rc.3 was checked on 2026-10-24** (Node 24.22.1, Windows). Nothing in the registry contract moved: `@deepseek-ai/dsh-skill` 0.2.1-rc.3 still exports `BUNDLED_SKILL_RANK` (600), `SkillRegistry`, `isSkillName`, `isModelInvocable` and `isUserInvocable`, still hands `registerProvider()` the same `control` (`{ signal, invalidate }`), and `invalidateCache()` still advances the cache revision and broadcasts `skills/change`. The plugin was mounted on that registry — taken from the shipped `app.asar`, wired with the host's own cordis 4.0.5 — and passed **28/28** checks: `inject: ['skills']`; the candidate carrying `source: bundled`, `rank` 600 equal to the host's own exported constant, the absolute `SKILL.md` as `path`, the package root as `resourceBase`, and the frontmatter description verbatim; `get()` returning the body (13,533 characters, frontmatter stripped, `path` retained); `control.invalidate()` advancing the registry revision 1 → 2 and emitting exactly one `skills/change`; and disposal removing the provider and aborting `control.signal`. Two details worth writing down because they look like failures and are not: the host's `toSummary()` deliberately drops `rank` from catalog summaries (it is a same-name arbitration input, not a display field), and registration only becomes observable once `ctx.plugin()`'s thenable resolves — inspected before that await, even a successful mount shows no `control`. In this same rc3 session the **directory** form is the one that runs (the host's own skill directory), and the session's skill catalog lists `fact-check` with this repository's `SKILL.md` description.

**DSH 0.2.1-rc.5 was checked on 2026-10-31** (Node 26.13.0, Windows; the host version is the one the shipped `app.asar`'s `@deepseek-ai/dsh-desktop` declares, and `dsh --version` reports the same `0.2.1-rc.5`). The registry contract did not move again: `@deepseek-ai/dsh-skill` 0.2.1-rc.5 still exports `BUNDLED_SKILL_RANK` (600) together with the same `SkillRegistry` / `isSkillName` / `isModelInvocable` / `isUserInvocable` surface, still hands `registerProvider()` the same `control` (`{ signal, invalidate }`), and `validateCandidate`, `toSummary` and `renderSkillContent` behave as in 0.2.1-rc.3 — checked line by line against the file taken from the shipped `app.asar`, wired with the host's own cordis 4.0.5. The plugin mounted on that registry and passed **24/24** checks: `inject: ['skills']`; exactly one candidate for `fact-check`, carrying `source: bundled`, `rank` 600 equal to the host's exported constant, the absolute `SKILL.md` as `path` and the package root as `resourceBase`; `get()` returning the body (14,462 characters, frontmatter stripped); that body rendering through `renderSkillContent` with the package root as the resource base; `control.invalidate()` making an edited description visible to the catalogue (edited and reverted inside the probe — `git status --porcelain` empty afterwards); and disposal removing the provider again. The bundled suite re-ran green on Node 26.13.0: `smoke-plugin` 27/27, `jev-verdict selftest` 25/25, `route selftest` 44/44, `route.mjs regress` 30/30 offline, `doctor` exit 0.

One host behaviour added in this release decides whether *any* plugin loads, so it is recorded here. `@deepseek-ai/dsh-app-boot` gained a plugin↔runtime compatibility gate: a plugin that declares `engines.dsh` must satisfy it; a plugin that declares no `engines.dsh` but *does* declare `peerDependencies` must satisfy every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer; **a plugin with neither passes unconditionally**. Incompatible profile bundles are skipped without printing anything, and incompatible `cordis.patch.yml` rows are set `disabled`. This package declares only `engines.node` and no `peerDependencies`, so the gate cannot deny it on any runtime — a second reason, after the plugin-market one above, to keep the manifest free of host versions.

## Install

### As a DSH plugin

```sh
dsh plugin add dsh-fact-check
```

That is the published npm package — the source the plugin market installs from by preference. The same
plugin straight from GitHub source is `dsh plugin add github:7starsseeker/dsh-fact-check`.

Then restart DSH: the `fact-check` skill appears in the session catalogue. The plugin itself is a thin
adapter — `lib/index.js` registers the bundled `SKILL.md` on `ctx.skills`, re-reading it on every load,
so editing the skill needs no code change. It has **zero runtime dependencies** (only `node:` builtins).
Because the provider registers at the *bundled* rank, a skill you keep in `~/.dsh/skills/fact-check`
(user rank) still wins on a name collision — installing this will not shadow your own local edits.

<details>
<summary>Install from a local checkout instead</summary>

```sh
git clone https://github.com/7starsseeker/dsh-fact-check.git
dsh plugin add ./dsh-fact-check
```

</details>

### Handing the folder to any agent

Copy this directory (or a zip of it) to any AI tool and say *"do what `FOR-AI.md` says"*. It detects the
environment offline, adapts itself, and needs no human configuration. Frameworks that load skills take
`SKILL.md` directly (frontmatter included); frameworks that take plain instructions take the generated
[`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## How it works

```
decompose the claim  →  parallel search (domestic + international + vertical + debunking)
      →  fetch primary pages  →  cross-compare and grade sources  →  adversarial re-search
      →  conclusion-first report: confirmed / unverified / undecidable + numbered sources
```

Two optional offline tools sit alongside it:

| Tool | What it does |
|---|---|
| `node tools/route.mjs plan --task "…"` | Deterministic planning: which source ladder and which channels this kind of claim needs, plus the failure-action table. A pure data table — no model, no tokens. A claim that matches no known fact type still gets the general fact-check ladder (flagged `fallback: true` in the output), never a software-release one. |
| `node tools/jev-verdict.mjs` | The judgement client described below. |

## The optional Jev decision layer

Three judgements are inherently about facts rather than about prose, and the skill can hand them to a
**TypeSafe Jev (System One) decision model** instead of leaving them to unaided reasoning:

| Judgement | Question type | When it is asked |
|---|---|---|
| Does this evidence support the claim? | yes/no + probability | when cross-comparing sources |
| Is this source primary? | yes/no + probability | when grading each candidate source |
| Does this page carry usable body text? | yes/no + probability | after fetching — login walls, captchas and JS shells must not count as evidence |

Two things about it are deliberate:

- **It is optional.** With no key configured, the same three judgements are made by the deterministic
  rules written in `SKILL.md`; nothing else changes. A key can come from `tools/local.json`, from the
  `TYPESAFE_API_KEY` environment variable, or from `tools/jev-verdict.mjs --key-file`.
- **A model verdict can only lower a grade, never raise it.** The conclusion tier is decided by the
  deterministic rule *number of independent sources → tier*; a model saying "the evidence supports this"
  promotes nothing. Only "insufficient evidence" or "contradicts the evidence" triggers an action.

Measured reliability per judgement, the prompt-injection defences applied before anything reaches the
model, and the commands to reproduce the numbers are in [`MEASUREMENTS.md`](./MEASUREMENTS.md) —
including one judgement that is deliberately **never asked**, because its single-question accuracy
measured 62.5%.

## Verify it yourself

Every command below runs offline, needs no key, and takes seconds:

```sh
node tools/smoke-plugin.mjs                          # is the plugin mounted, and does it serve SKILL.md?
node tools/route.mjs selftest                        # deterministic routing tables
node tools/route.mjs regress --file cases/route-cases-neutral.json
node tools/route.mjs arms                            # dispatch-arm proxy metric (MEASUREMENTS §4.1)
node tools/jev-verdict.mjs selftest                  # judgement layer regression assertions
node tools/doctor.mjs                                # what this machine can and cannot do
```

`node tools/doctor.mjs --net` additionally self-tests the fetch chains and the judgement endpoint, and
reports which capabilities are missing and how the skill degrades without them. Current status on this
checkout: **27/27**, **25/25**, **44/44** and **30/30** assertions pass.

CI runs exactly these commands on Linux and Windows, on Node 18 and 22, plus one more check: that the
generated `INSTRUCTIONS.md` still matches `SKILL.md`.

## Project layout

| Path | What it is |
|---|---|
| [`SKILL.md`](./SKILL.md) | the skill itself — flow and rules (the single source of truth) |
| [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) | generated from `SKILL.md` for hosts that take plain instructions |
| [`FOR-AI.md`](./FOR-AI.md) | the task brief for an AI that is handed this package |
| [`ADAPTING.md`](./ADAPTING.md) | what to change when moving to another environment |
| [`MEASUREMENTS.md`](./MEASUREMENTS.md) | measured numbers and how to reproduce them |
| [`CHANGELOG.md`](./CHANGELOG.md) | net change between versions |
| [`RELEASING.md`](./RELEASING.md) | how a release reaches npm (OIDC, no long-lived token) |
| [`lib/index.js`](./lib/index.js) | DSH plugin entry: exposes `SKILL.md` on `ctx.skills` |
| [`cordis.patch.yml`](./cordis.patch.yml) | bundle patch that makes the package installable via `dsh plugin add` |
| [`tools/`](./tools) | two zero-dependency Node scripts, the machine-local config template, and the data tables |
| [`cases/`](./cases) | de-identified regression corpora |
| `submission/` | the entry file for the plugin-market listing (not part of the package) |

## Configuration

Machine-specific values — endpoints, keys, which channels actually work on your machine — live in
`tools/local.json`, which is git-ignored and shipped only as [`tools/local.example.json`](./tools/local.example.json).
No host path, endpoint or key is hard-coded in the code or the data tables, and `tools/*.mjs` carry
assertions that fail if one ever appears.

## Contributing

Issues and pull requests are welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md). Two rules are
load-bearing: the skill body is the single source of truth (never hand-edit a generated file such as
`INSTRUCTIONS.md`), and any change to the judgement layer or the routing tables must be accompanied by
re-run regressions and updated numbers in `MEASUREMENTS.md`.

## License

[MIT](./LICENSE)
