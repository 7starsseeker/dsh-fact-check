#!/usr/bin/env node
/**
 * lint-report — 按报告自带的「译名分歧表」反查正文，检查写法是否一致。
 *
 * 为什么需要它：SKILL.md 的专名纪律说了「全篇统一一种写法」，但那只是嘱咐。
 * 报告一旦长了，同一个角色前后写成两个名字是必然会发生的——而且肉眼很难发现，
 * 因为两处相隔十万八千里。分歧表已经声明了「采信哪个、弃用哪个」，
 * 那就应该由机器去比对正文，而不是靠人回读。
 *
 * 用法:
 *   node tools/lint-report.mjs <report.md> [--verbose]
 *
 * 规则（只认分歧表，不做任何语义推断）:
 *   · 「采信」列含 弃用            → 该写法在正文（表格行以外）出现即失败
 *   · 「采信」列含 ✅ / 正文用这个 → 该写法必须在正文出现
 *   · 其它（如「首次出现括注」）   → 不作约束
 * 没有分歧表的报告直接跳过（退出码 0），不算失败。
 */

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const VERBOSE = args.includes('--verbose')

if (!file) {
  console.log('用法: node tools/lint-report.mjs <report.md> [--verbose]')
  process.exit(2)
}

const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const lines = raw.split('\n')

/** 去掉 markdown 强调与行内代码，留下裸词 */
const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim()

// ── 1. 定位分歧表：表头里同时有「中文译法」与「采信」的表格 ──────────────────
let headerIdx = -1
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  if (!l.trim().startsWith('|')) continue
  const head = clean(l)
  if (head.includes('中文译法') && head.includes('采信')) { headerIdx = i; break }
}

if (headerIdx < 0) {
  console.log('  · 未找到译名分歧表，跳过专名一致性检查')
  console.log('\n0/0 通过（无分歧表）')
  process.exit(0)
}

// ── 2. 解析表格 ─────────────────────────────────────────────────────────────
const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(clean)
const header = splitRow(lines[headerIdx])
const col = (name) => header.findIndex((h) => h.includes(name))
const iTerm = col('中文译法')
const iVerdict = col('采信')

if (iTerm < 0 || iVerdict < 0) {
  console.log('  ✗ 分歧表缺少「中文译法」或「采信」列')
  process.exit(1)
}

const rows = []
for (let i = headerIdx + 2; i < lines.length; i++) {
  const l = lines[i]
  if (!l.trim().startsWith('|')) break
  const cells = splitRow(l)
  rows.push({ term: cells[iTerm] || '', verdict: cells[iVerdict] || '' })
}

// ── 3. 正文 = 非表格行（表格里出现弃用译名是允许的，那是分歧表本身）──────────
const body = lines
  .map((l, i) => ({ l, i }))
  .filter(({ l }) => !l.trim().startsWith('|'))

let pass = 0
const fails = []
const record = (ok, msg) => {
  if (ok) { pass++; if (VERBOSE) console.log(`  ✓ ${msg}`) } else { fails.push(msg); console.log(`  ✗ ${msg}`) }
}

// ── 4. 逐条比对 ─────────────────────────────────────────────────────────────
for (const { term, verdict } of rows) {
  if (!term) continue
  const hits = body.filter(({ l }) => clean(l).includes(term))

  if (/弃用/.test(verdict)) {
    record(
      hits.length === 0,
      `弃用写法「${term}」不得出现在正文` +
        (hits.length ? ` —— 命中 ${hits.length} 处：第 ${hits.map((h) => h.i + 1).join('、')} 行` : ''),
    )
  } else if (/✅|正文用这个/.test(verdict)) {
    record(hits.length > 0, `采信写法「${term}」应在正文出现` + (hits.length ? `（${hits.length} 处）` : '（未出现）'))
  }
}

// ── 4. 组 1：每份报告自带局限（拆开才不散）────────────────────────────────
const hasGap = /^## (缺口|本次未能核实到的)/m.test(raw)
record(hasGap, '报告必须有「缺口」或「本次未能核实到的」一节' + (hasGap ? '' : '（缺了就不是可拆可合的产物）'))

// ── 5. 组 2：可拆可合（跨节指代会让报告拆不开）─────────────────────────────
const CROSSREF = /见(上一节|上节|上文|前文|下文|后文)|如上所述|如前所述|前述|参见上文/
const crossHits = body.filter(({ l }) => CROSSREF.test(l))
record(
  crossHits.length === 0,
  '正文不得有跨节指代（Step 4c 的拆分前提）' +
    (crossHits.length ? ` —— 命中 ${crossHits.length} 处：第 ${crossHits.map((h) => h.i + 1).join('、')} 行` : ''),
)

// ── 6. 组 3：无来源断言（"据说 / 普遍认为"糊过去）───────────────────────────
const HEDGE = /(据说|据了解|普遍认为|一般认为|业内(人士|普遍)|有消息称|有人(指出|认为))/
const paraOf = (idx) => {
  let s = idx
  while (s > 0 && lines[s - 1].trim() !== '') s--
  let e = idx
  while (e < lines.length - 1 && lines[e + 1].trim() !== '') e++
  return lines.slice(s, e + 1).join('\n')
}
const hedgeHits = body
  .filter(({ l }) => HEDGE.test(l))
  .filter(({ i }) => !/\[\d+\]/.test(paraOf(i)))
record(
  hedgeHits.length === 0,
  '含「据说 / 普遍认为」类措辞的段落必须带来源编号 [n]' +
    (hedgeHits.length ? ` —— 未带来源 ${hedgeHits.length} 处：第 ${hedgeHits.map((h) => h.i + 1).join('、')} 行` : ''),
)

// ── 7. 组 4：骨架识别（首节标题必须落在某个骨架的首段上）────────────────────
const firstH = lines.find((l) => /^## /.test(l)) || ''
const SKELETON_START =
  /^## (一句话结论|一句话定义|定界|对比维度|核心发现|主张|这是谁的经验|框架)/
record(
  SKELETON_START.test(firstH),
  '首节标题应命中某个骨架的首段' + (SKELETON_START.test(firstH) ? '' : ` —— 实际是「${firstH.trim()}」`),
)

// ── 8. 汇总 ─────────────────────────────────────────────────────────────────
const total = pass + fails.length
console.log(`\n${pass}/${total} 通过（分歧表 ${rows.length} 行，正文 ${body.length} 行）`)
if (fails.length) {
  console.log('\n交付前机械回检不通过：')
  fails.forEach((f) => console.log(`  - ${f}`))
  process.exit(1)
}
console.log('结论：专名一致、无跨节指代、无未标注的传闻断言、首节命中骨架。')
