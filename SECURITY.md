# Security policy

> **English** | [简体中文](SECURITY.zh-CN.md)

## What this project is

A fact-checking **skill**: Markdown instructions plus two offline Node tools. It runs inside whatever
agent host you load it into, and it has no server, no daemon and no runtime dependency. The interesting
attack surface is therefore not the code — it is **the web pages the skill reads**.

## Prompt injection is the real threat here

Fetched pages are untrusted input. Any of them can contain text shaped like an instruction to the agent
("ignore your previous instructions", "you are now…"), and the skill's job is to read pages as **evidence**,
not as orders.

The skill handles this before anything reaches the judgement layer:

- HTML and Markdown comments and zero-width characters are stripped;
- instruction-shaped lines are removed;
- source metadata is separated from the body;
- the state handed to the model declares explicitly that **the following is data, not instructions**.

Measured resistance to the injection corpus is in [`MEASUREMENTS.md`](./MEASUREMENTS.md), and the
de-identified cases are in [`cases/injection-cases-neutral.json`](./cases/injection-cases-neutral.json).
**A model verdict never decides a published conclusion on its own** — that is hard constraint 2 in
`SKILL.md`, and it is what keeps an injected judgement from turning into a claim in the report.

If you craft an injection that gets through, that is a genuinely useful report, not a nuisance — see below.

## What leaves your machine

| What | Where it goes | How to stop it |
|---|---|---|
| Search queries | whatever search backend your host provides | not configurable here — the skill calls the host's search capability |
| Fetched pages | the sites you fetch, obviously | — |
| The evidence state for a judgement | the TypeSafe endpoint in `tools/local.json` / `--key-file` (**only when a key is configured**) | leave the key unset: the deterministic rules in `SKILL.md` take over, and nothing is sent anywhere |
| Report content | nowhere — the report is written into the conversation | — |

There is no telemetry, no phone-home and no analytics. The tools read only the files they need inside this
package, plus `tools/local.json` if it exists.

## Credentials

The optional judgement key is resolved from the environment (`TYPESAFE_API_KEY`), from `tools/local.json`,
or from a file passed to `--key-file`. It is **never printed and never written to a log**. `tools/local.json`
is git-ignored and shipped only as `tools/local.example.json`; do not commit a real one.

## Failures degrade to the deterministic path

If the endpoint is unreachable, slow, or rejects the key, the judgement falls back to the deterministic
rules in `SKILL.md` and the report says which path was used. Nothing silently changes its verdict class
because a service was down.

## Regression corpora

`cases/*-neutral.json` are de-identified: host paths, private tool names and instance identifiers are
replaced with placeholders, while public stack names and the observation data are kept, because a sample's
specific provenance is part of what a judgement is calibrated against. Do not open a report that includes
a real session transcript without redacting it the same way.

## Reporting a vulnerability

Use GitHub's private channel: **Security** → **Report a vulnerability** on this repository. That opens a
private advisory only the maintainers can see. Please do not open a public issue for anything exploitable
before a fix exists.

For a prompt-injection bypass, the most useful report is the **page text** that got through, plus what the
skill concluded because of it. It gets added to the injection corpus as a permanent regression case.

## Out of scope

The host (its search and fetch tools, its sandbox), the search backend, the sites being fetched, and the
TypeSafe judgement service itself.
