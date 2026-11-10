# Adapting to your environment (ADAPTING)

This skill **binds to no host, product, path or key**: the body only talks about capabilities and rules, the two optional tools are dependency-free Node scripts, and every environment-specific value lives in `local.json` (outside the package — see below). This file says what you actually have to do to land it in your environment.

> For step-by-step execution use **[`FOR-AI.md`](./FOR-AI.md)** — that is the AI-facing runbook (Chinese only, by design). This file is the background and the reasoning: why to do it this way, what to do without a decision model, and how judgement calibration is disciplined.

> **Config file location**: `%LOCALAPPDATA%\dsh-fact-check\local.json` (Windows) or
> `~/.config/dsh-fact-check/local.json` (elsewhere); `JEV_LOCAL_CONFIG` overrides the path. The old
> in-package `tools/local.json` is still read, but only as a fallback. Keeping it outside the package
> means `dsh plugin update` / `npm i` replacing the whole package directory will not wipe your settings.
> `secrets.json` resolves through the same directory logic.

---

## 1. Five-minute hookup

```bash
# 1) Self-check: offline, shows what this machine has, what is missing, and how it would degrade
node tools/doctor.mjs
node tools/doctor.mjs --net                     # also worth one run: exercises the fetch chains for real

# 2) Judgement layer (optional): give the decision model a key
export TYPESAFE_API_KEY=…                       # or run doctor --write, then fill in keyFile

# 3) Local values (optional): self-hosted search, proxy, optional tool paths; also
#    capability bindings / output conventions / runtime notes
node tools/doctor.mjs --write                   # writes a draft to the per-user config dir; fill in the nulls
#    or:  copy tools/local.example.json to that path (the doctor output prints the effective one)

# 4) Acceptance (offline, free)
node tools/jev-verdict.mjs selftest                              # expect 25/25
node tools/route.mjs selftest                                    # expect 48/48
node tools/lint-skill.mjs                                        # expect 236/236 (structural assertions on the body)
node tools/route.mjs regress --file cases/route-cases-neutral.json   # expect 33/33
```

Requirement: **Node 18+** (built-in `fetch` and `AbortSignal.timeout`). Zero npm dependencies.

**You can skip the decision model entirely**: the process and the iron rules in `SKILL.md` do not depend on it — it only moves three judgements from a human following rules to a model answering typed questions (see §3).

---

## 2. Four things you have to decide

| # | Decision | Where | Notes |
|---|---|---|---|
| 1 | **Where search comes from** | your agent / the capability table in `SKILL.md` | At minimum you need keyword search plus the ability to open a page's body. If you have a search API (Brave / Tavily / SerpAPI / self-hosted metasearch…) bind it by name; if not, you degrade to serial search |
| 2 | **Whether you want the judgement layer** | `keyFile` in `local.json`, or `TYPESAFE_API_KEY` | Default protocol is TypeSafe System One (`POST /v1/systemone`, `{model, state, questions}`); `JEV_ENDPOINT` / `JEV_MODEL` can point at a compatible endpoint. Skip it and everything still works |
| 3 | **Local channel values and conventions** | `overrides` / `capabilities` / `outputConvention` / `runtimeNotes` in `local.json` | `overrides` holds `${SEARXNG_URL}` `${HTTP_PROXY_URL}` `${VIDEO_FETCH_CMD}` `${EXIFTOOL_CMD}` — they are placeholders in the data tables, so leaving them unfilled changes nothing but the hints in a plan. The other three are optional: `capabilities` binds capability names to real local tool names, `outputConvention` declares local section order and rules, `runtimeNotes` records the runtime baseline (which engines get CAPTCHA'd, which sites need a proxy). **Fill these instead of editing the body** |
| 4 | **How to load it** | your framework | Frameworks that take skills (Claude Code and friends): point them at this directory (`SKILL.md` carries the frontmatter). Frameworks that take `AGENTS.md` and similar: generate `INSTRUCTIONS.md` with `node tools/make-instructions.mjs` (same body, no frontmatter) |

The skill's **only hard external dependency** is: internet access plus something that returns a page's body. Everything else is optional.

---

## 3. Doing the three judgements by hand, without a decision model

| Judgement | With a model | Without one |
|---|---|---|
| Does this evidence support the claim | `ask --question support` → probability | Align subject / time / number / direction; any mismatch goes to "insufficient evidence" |
| Is this source primary | `ask --question primary_source` | Use the source-grading table in `SKILL.md` |
| Does this page carry usable text | `ask --question usable_page` | Look for real paragraphs that match the topic; a login wall or CAPTCHA page does not count as evidence |

"Should I keep searching?" is a decision that **should be made by rules anyway** (fewer than two independent sources, sources contradict, key elements still unsourced) — do not hand it to a model. In single-test it scores 62.5% (see `MEASUREMENTS.md`).

---

## 4. Judgement and calibration discipline

- `QUESTIONS` inside `tools/jev-verdict.mjs` is a **frozen literal**: changing an instruction, criterion or threshold is a recalibration event.
- Every judgement change must re-run the corpora under `cases/` (support / injection / provenance / usable_page) and write the new numbers into `MEASUREMENTS.md`.
- Thresholds need the same evidence trail: the current `TIERS` values 0.8 / 0.5 were swept from the support corpus (see `MEASUREMENTS.md` §1.2); re-sweep the same way and record it.
- **Re-run before you trust it** after an environment or model change: the vendor says non-English (CJK included) is "handled but not equally well", and rate limits and model quality drift.
- English judgements are worth doing, but translate **and recalibrate** — do not machine-translate and reuse.

---

## 5. Distribution and maintenance notes

- **Do not write host facts into `SKILL.md` or the data tables** (internal addresses, absolute paths, keys, accounts). Machine values go to `local.json`; "measured on some machine" numbers go to `MEASUREMENTS.md` with the environment and date.
- `tools/jev-verdict.mjs` and `tools/route.mjs` each carry an **offline assertion** that the code hardcodes no local paths (it matches mount-point prefixes and host config directory names, not one specific path). That assertion is a guard — do not delete it.
- `.gitignore` already blocks `local.json`, `secrets.json`, logs and `out/`.
- **Version alignment**: the `version` in `SKILL.md`'s frontmatter corresponds one-to-one with the entry in `CHANGELOG.md`. Any change to user-facing behaviour (flow, report templates, judgements, trigger words) bumps the version and records a net change; `MEASUREMENTS.md` numbers align by version — otherwise nobody can tell which judgement produced a given set of numbers.
- Both tools **fail open**: missing key, timeout, HTTP error all return `unknown` and send you back to the manual rules. A broken judgement layer never stalls the pipeline.

---

## 6. Provenance and disclaimers

- This package is the product of real practice; its original host was a self-built agent harness. **The body and the data tables are clean**: tool names became capability names, paths became environment variables / `local.json`, snapshotting became "back up before editing", host safety valves were removed — and there are offline assertions in `selftest` guarding that.
- **The `cases/` corpora were de-identified in two passes**: first host paths and SDK names, then private tool names and host product names (each file's header records the replacement counts in `_replaced_tokens`). What was **deliberately kept** are public, generic stack names (SearXNG / Docker / WSL / curl / python / TypeSafe Jev) and on-machine measurements — because where the evidence came from *is* the evidence for calibration, and erasing it would destroy that. To use the corpora in a fully neutral setting, rebuild them from your own sources per the last section of `cases/README.md`.
- Every **number** in this file and in `SKILL.md` is "measured on one machine, one model version, one day" — evidence, not a promise. Provenance and re-run instructions are in `MEASUREMENTS.md`.
- The decision model: [TypeSafe Jev](https://typesafe.ai/) (System One). It is **replaceable** — any model that takes "state + structured question" and returns typed answers with probabilities works; point `local.json` at its endpoint and adjust the judgement text.
