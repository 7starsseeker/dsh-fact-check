# CHANGELOG (English)

> **English entries start at 2.0.0.** Earlier releases are documented in Chinese only, in [`CHANGELOG.md`](./CHANGELOG.md) — the historical record stays in the language it was written in rather than being retro-translated.
>
> Net changes between releases (fixes / improvements / additions). Results only, no process notes.
> Any change to judgements, thresholds or trigger words must also update the numbers in [`MEASUREMENTS.md`](./MEASUREMENTS.md) and the regressions under `cases/`.

## 2.0.2 — 2026-11-12

**A general contract for multi-question input; the report and both images now show the original question**

- **0.5a — split questions first**: separate "how many answers the user wants" from work units, then run the decision tree once per question. Adds a nine-shape answer table (verdict / explainer / three causal entries / comparison / survey map / metric card / attachment) and three hard rules: every question gets an answer, each answer keeps its own shape, and more than three questions or independent topics with non-overlapping evidence must stop or split.
- **0.5b gate**: up to three questions with the same skeleton or overlapping evidence proceed without a confirmation stop; different skeletons also proceed when the second answer fits an existing section of the primary skeleton; split only when an independent H2 is required and the primary skeleton is 4-V. The verdict skeleton's ten H2 headings stay unchanged.
- **Multi-answer layout**: an answer overview at the top; for 4-V the two or three judgment lines live inside `## 一句话结论` (with "Put together" as the third line for two questions, one line per question for three); other skeletons use `> **Answer overview**` and never add a `## 答题总览` heading. The 4-V multi-question variant and Step 4c's merge/split criteria are rewritten accordingly.
- **Original question**: the 4-V template and the multi-question report now require `> **Original question**: <verbatim>` before the first `##` (Chinese: `> **原始提问**：`). The export side uses it to restore the question at the top of both the summary and the long image, instead of showing only the answer.
- `reference/i18n.md` gains the bilingual mapping; `INSTRUCTIONS.md` is regenerated.

**Verification**

- `npm run selftest` exit 0: `smoke-plugin 27/27`, `jev-verdict 25/25`, `route 48/48`, `lint-skill 236/236`; the 4-V template still has ten H2 headings; `lint-report` 0/0.

## 2.0.1 — 2026-11-11

**Machine-readable skeleton anchor table (no behaviour change)**

- New [`reference/skeleton-anchors.json`](./reference/skeleton-anchors.json) indexes the six skeletons' **existing** `##` headings — short titles, hit thresholds (`minHits`), lead sections (`lead`), and the rules for headings shared across skeletons (`sharedHeadings`) — so the export side reads a declaration instead of transcribing the heading table. The skill's own flow never reads it and no heading changed: it is an index, not a new set of anchors.
- [`tools/lint-skill.mjs`](./tools/lint-skill.mjs) gains §19 (15 assertions, 221 → 236): the table parses, the six ids are present, `match` hits in-block headings, `matchEn` sits inside that skeleton's Step 4b English sequence, non-anchor English titles are all shared ones, no short title appears under two skeletons, `exportCard` is true for the verdict only, and `noSkeletonMayUse` / `verdictOnly` are respected. **A renamed heading now fails the lint** instead of degrading silently.
- One pointer added in `SKILL.md` §4b; the maintenance notes gained the directory entry plus the "the table is an index, not anchors" invariant. `README` / `MEASUREMENTS` / `ADAPTING` updated; `INSTRUCTIONS.md` regenerated.
- The dependency stays one-way: where the export side cannot read the table it falls back to its built-in table, and fact-check never calls the export side.

**Verification**

- `lint-skill 236/236`, `smoke-plugin 27/27`, `jev-verdict 25/25`, `route selftest 48/48`, `route regress 33/33`. (`lint-report` takes a report file and was not run this round; it was not modified either.)

## 2.0.0 — 2026-11-10

**Breaking (usage, not contract)**

- The skill changed from a single verification pipeline to **type → gather → shape**: a question is typed first, then answered with the matching skeleton. **The verdict skeleton's template and headings are byte-identical to 1.5.4**, so the export-side anchor contract is untouched.

**Added**

- **Six report skeletons**: verdict / explainer / causal mechanism (event retrospective · state cause · forward impact) / comparison / survey map / metric card; plus three attachments — for-and-against / experience & recommendation / attribute dimensions. Attachments hang off a primary skeleton and never stand alone.
- **Step 0 premise scan and decomposition**: embedded claims are checked separately; work units are classed P (premise) / N (proper name) / D (definition) / A (analysis) — 10–16 in total, of which 2–3 are decisive.
- **Step 0.3 question health check**: four hard stops — false premise / object never scoped to a comparable level / self-contradiction / object does not exist. A defective question stops the run; it is no longer downgraded into a conditional walkthrough. Interactive sessions must ask; the conservative path is unattended-only and must be declared at the top of the report.
- **Step 0.5 typing gate**: an ordered 12-step tree driven entirely by the **form of the question**, not by its subject; it emits a typing card; confirmation is required when the session is interactive and the work exceeds 3 units or spans kinds, while lightweight tasks proceed directly. A feasibility pass follows — any unit rated "low" must reappear verbatim as a gap item in the report.
- **Step 4c multi-product orchestration**: merge when the evidence sets overlap, split when the shapes are mutually exclusive; a split always ships a one-page overview; sections may not cross-reference each other, so the result stays splittable.
- **Step 5 split into 5a mechanical / 5b manual review**: whatever is mechanically decidable goes to the tools; only the remainder is read by a human.
- **Proper-name discipline**: the body uses the report language's names and originals live only in a table; when translations diverge, the source nature and circulation are checked and the most widely used form adopted; "same object, several translations", "same word, different referents" and "fixed terms" are handled differently; when one object has many names *and* one name covers many objects, switch to an entity table (keyed on period / office or role / key events) plus a many-to-many alias table.
- **New `definition` fact domain**: terminology registry → GB/GB-T and ISO/IEC → prescriptive dictionaries → statutory definitions → learned-society glossaries. News copy, encyclopaedia entries and vendor sites are not definition sources; both the domestic and the international system are consulted; differing definitions are presented side by side, never merged.
- **Bilingual coverage for every skeleton**: Step 4b keeps only the English heading sequence per skeleton; fixed in-section wording moved to [`reference/i18n.md`](./reference/i18n.md) and is read on demand.
- **New tools**: [`tools/lint-skill.mjs`](./tools/lint-skill.mjs) — 221 structural assertions (skeletons, decision tree, verdict anchors, heading-sequence alignment, generated-file sync, `definition` domain); [`tools/lint-report.mjs`](./tools/lint-report.mjs) — report check (name consistency, cross-section references, rumour attribution, gap section, skeleton recognition).

**Other**

- "Stakeholders and contamination surface" is now scoped to the verdict skeleton only; "scope and limits" is written per product kind.
- Rule 2's multi-source requirement now scales with product kind; Step 1 gained a fourth collection exception — search every circulating rendering of a proper name.
- `INSTRUCTIONS.md` regenerated by `tools/make-instructions.mjs`; `package.json` `files` now includes `reference`.
- **The judgement layer changed and was recalibrated**: new `definition` domain, placed first in `DOMAIN_SIGNALS`, trigger anchored with `$`. `route selftest` 44 → 48, `route regress` 30 → 33 (R31–R33 added); all 30 pre-existing cases are unchanged. Recorded in `MEASUREMENTS.md` §10.

**Verification**

- `lint-skill 221/221`, `lint-report 9/9`, `smoke-plugin 27/27`, `jev-verdict 25/25`, `route selftest 48/48`, `route regress 33/33`.
