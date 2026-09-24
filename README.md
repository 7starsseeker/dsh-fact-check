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

**Verified host: DSH 0.1.7-rc.2** (2026-09-25, Node 24.21.0, WSL/Linux). The host discovers the skill
and loads its body; the plugin form mounts on the host's own skill registry with `source: bundled`, its
description read from `SKILL.md` and `get()` returning that body verbatim; `npm run selftest` passes
(plugin mount 27/27, `jev-verdict` 25/25, `route` 37/37); `route.mjs regress` is 26/26 offline; and the
judgement corpora reproduce the expectations in [`MEASUREMENTS.md`](./MEASUREMENTS.md) §6 — `support`
37/40, `injection` 11/12, `provenance` 15/16, `usable_page` 12/12, `sufficient` 24/40 (the last one is
the criterion §1 already says not to use on its own). No host version is declared in `package.json` —
`engines` carries only `node`, and an exact version there would make the plugin market report
"confirmed incompatible" and block every other host — so a host not listed here is untested, not
forbidden.

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
| `node tools/route.mjs plan --task "…"` | Deterministic planning: which source ladder and which channels this kind of claim needs, plus the failure-action table. A pure data table — no model, no tokens. |
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
checkout: **27/27**, **25/25**, **37/37** and **26/26** assertions pass.

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
