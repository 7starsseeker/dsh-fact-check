#!/usr/bin/env node
/**
 * lint-skill — 技能正文的结构断言（离线、零依赖、0 成本）。
 *
 * 为什么需要它：`smoke-plugin.mjs` 测的是插件外壳（能不能挂载、候选与正文是否同源），
 * `jev-verdict` / `route` 测的是判据层。**三者都不看正文内容**——判据树少一步、骨架少一段、
 * 英文序列与中文段序错位、改了正文忘了重生成 INSTRUCTIONS，它们一律是绿的。
 * 本文件补的就是这一层：把「2.0 骨架结构」和「裁决锚点不许改」变成可执行的断言。
 *
 * Usage:
 *   node tools/lint-skill.mjs
 *   node tools/lint-skill.mjs --verbose      # 额外打印每条断言的实测值
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const VERBOSE = process.argv.includes('--verbose')

const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

let pass = 0
let fail = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    pass++
    if (VERBOSE) console.log(`  ✓ ${name}${detail ? `  (${detail})` : ''}`)
  } else {
    fail++
    failures.push(`${name}${detail ? `  → ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? `  → ${detail}` : ''}`)
  }
}

const skill = read('SKILL.md')
const lines = skill.split('\n')
const lineSet = new Set(lines.map((l) => l.trim()))

// ── 1. frontmatter 与版本一致性 ────────────────────────────────────────────────
const fm = Object.fromEntries(
  [...skill.matchAll(/^(\w+):\s*(.+)$/gm)].slice(0, 4).map((m) => [m[1], m[2].trim()]),
)
const pkg = JSON.parse(read('package.json'))

check('frontmatter 有 name 且为 fact-check', fm.name === 'fact-check', fm.name)
check('frontmatter 有 version', !!fm.version, fm.version)
check('frontmatter 版本号是语义化的 x.y.z', /^\d+\.\d+\.\d+$/.test(fm.version || ''), fm.version)
check('frontmatter 版本 = package.json 版本', fm.version === pkg.version, `${fm.version} vs ${pkg.version}`)
check('frontmatter 版本 ≥ 2.0.0（本轮是分型大版本）', !!fm.version && parseInt(fm.version, 10) >= 2, fm.version)

// ── 2. description 覆盖六类产物（它进全局技能目录，是路由信号）──────────────────
const desc = fm.description || ''
check('description 非空', desc.length > 0, `${desc.length} chars`)
check('description 提到定型（先定型再取证）', /定型/.test(desc), '')
for (const k of ['核查', '释义', '成因', '对照', '地图', '指标卡']) {
  check(`description 覆盖产物类型：${k}`, desc.includes(k), '')
}
check('description 提到中英双语', /双语|中英/.test(desc), '')

// ── 3. Step 编号与顺序 ────────────────────────────────────────────────────────
const stepHeads = lines.filter((l) => /^### Step /.test(l)).map((l) => l.replace(/^### /, ''))
const expectedSteps = ['Step 0 ', 'Step 0.5 ', 'Step 1 ', 'Step 2 ', 'Step 3 ', 'Step 4 ', 'Step 4b ', 'Step 4c ', 'Step 5 ']
check('Step 标题数量为 9', stepHeads.length === 9, `${stepHeads.length}`)
expectedSteps.forEach((e, i) => {
  check(`Step 顺序第 ${i + 1} 位是「${e.trim()}」`, (stepHeads[i] || '').startsWith(e), stepHeads[i] || '(无)')
})
check('Step 0.5 在 Step 0 之后、Step 1 之前（定型必须先于采集）',
  skill.indexOf('### Step 0.5') > skill.indexOf('### Step 0 ') && skill.indexOf('### Step 0.5') < skill.indexOf('### Step 1 '))
check('Step 4c 在多产物章节里排在 Step 4b 之后', skill.indexOf('### Step 4c') > skill.indexOf('### Step 4b'))

// ── 4. 判据树：12 步齐全、每步有归宿 ─────────────────────────────────────────
const treeStart = lines.findIndex((l) => l.startsWith('0. 前提扫描'))
const treeEnd = lines.findIndex((l, i) => i > treeStart && l.trim() === '```')
const tree = treeStart >= 0 && treeEnd > treeStart ? lines.slice(treeStart, treeEnd) : []

check('判据树代码块存在', tree.length >= 12, `${tree.length} 行`)
for (let i = 0; i <= 11; i++) {
  const re = new RegExp(`^${i}\\. `)
  check(`判据树有第 ${i} 步`, tree.some((l) => re.test(l.trim())), '')
}
const targets = ['4-V 裁决', '4-L 指标卡', '4-E 释义', '4-C① 事件回溯', '4-C② 状态成因', '4-C③ 前瞻影响', '4-M 对照', '附段·正反', '附段·经验建议', '附段·属性维度', '4-S 地图']
for (const t of targets) {
  check(`判据树有归宿：${t}`, tree.some((l) => l.includes(t)), '')
}
const arrowLines = tree.filter((l) => /^\d+\. /.test(l.trim()) && l.includes('→'))
check('判据树 1~11 步全部带「→ 归宿」', arrowLines.length === 11, `${arrowLines.length}/11`)

// ── 5. 六个骨架 + 三个附段都存在 ──────────────────────────────────────────────
for (const h of ['4-V', '4-E', '4-C', '4-M', '4-S', '4-L']) {
  check(`骨架标题存在：#### ${h}`, new RegExp(`^#### ${h} `, 'm').test(skill), '')
}
check('附段章节存在', /^#### 三个附段/m.test(skill), '')
for (const a of ['附段·正反', '附段·经验建议', '附段·属性维度']) {
  check(`附段可寻址：${a}`, skill.includes(a), '')
}
check('Step 4 有骨架速查表', /\| \*\*4-V 裁决\*\* \|/.test(skill), '')

// ── 6. 裁决锚点逐字存在（出图契约，改了就是静默降级）──────────────────────────
const VERDICT_ANCHORS = [
  '## 一句话结论',
  '## 始末 / 事实概要',
  '## 哪些是真的、哪些是假的',
  '## 国内外视角',
  '## 利益相关与污染面（标注，不参与定档）',
  '## 为什么会这样（可选，不适用则整节省略）',
  '## 一句话总结',
  '## 本次未能核实到的',
  '## 来源（编号附录）',
  '## 工具与能力使用情况',
]
for (const a of VERDICT_ANCHORS) {
  check(`裁决锚点逐字存在：${a}`, lineSet.has(a), '')
}
check('裁决三锚点齐全（出图侧命中任意两段才走结论卡）',
  ['## 一句话结论', '## 哪些是真的、哪些是假的', '## 来源（编号附录）'].every((a) => lineSet.has(a)))
for (const w of ['已证实', '很可能属实', '未证实', '证伪', '无法核实']) {
  check(`裁决档位词可用：${w}`, skill.includes(w), '')
}
check('裁决骨架标明是唯一出图锚点骨架', /唯一有出图锚点/.test(skill), '')
check('明确禁止给其它骨架自创锚点', /不要为了出图|自创锚点/.test(skill) || /给它们自创锚点/.test(skill), '')

// ── 7. 双语：8 条英文序列，每条 ≥5 段，且与中文骨架一一对应 ──────────────────
const seqBlock = skill.match(/```\n(4-V[\s\S]*?)\n```/)
const seqLines = seqBlock ? seqBlock[1].split('\n').filter((l) => /^(4-|附段)/.test(l)) : []
check('Step 4b 英文序列块存在', !!seqBlock, seqLines.length ? `${seqLines.length} 行` : '(未匹配)')
check('英文序列覆盖 8 个条目（含 4-C 三入口）', seqLines.length === 8, `${seqLines.length}/8`)
for (const id of ['4-V', '4-E', '4-C1', '4-C2', '4-C3', '4-M', '4-S', '4-L']) {
  check(`英文序列有 ${id}`, seqLines.some((l) => l.startsWith(id)), '')
}
for (const l of seqLines) {
  const id = l.split(/\s+/)[0]
  const n = l.split('·').length
  check(`${id} 的英文序列至少 5 段`, n >= 5, `${n} 段`)
}

// 顺序对齐的实质：英文序列的段数必须等于中文骨架的 `## ` 段数，否则一错位锚点就全错。
function headingsPerBlock(id) {
  const m = new RegExp(`^#### ${id} `, 'm').exec(skill)
  if (!m) return []
  // 跳过本节的标题行本身，再找下一个 3~4 级标题作为边界（正文块里的 `## ` 只有 2 级，不会截断）
  const afterHead = skill.slice(m.index + m[0].length)
  const next = afterHead.search(/^#{3,4} /m)
  const section = next >= 0 ? afterHead.slice(0, next) : afterHead
  return [...section.matchAll(/```markdown\n([\s\S]*?)\n```/g)].map(
    (b) => b[1].split('\n').filter((l) => l.startsWith('## ')).length,
  )
}
const v = headingsPerBlock('4-V')[0]
const e = headingsPerBlock('4-E')[0]
const c = headingsPerBlock('4-C')
const m = headingsPerBlock('4-M')[0]
const s = headingsPerBlock('4-S')[0]
const l2 = headingsPerBlock('4-L')[0]
const zhExpect = { '4-V': v, '4-E': e, '4-C1': c[0], '4-C2': c[1], '4-C3': c[2], '4-M': m, '4-S': s, '4-L': l2 }
for (const [id, want] of Object.entries(zhExpect)) {
  check(`中文骨架 ${id} 的段数可解析`, Number.isInteger(want) && want > 0, String(want))
}
for (const line of seqLines) {
  const id = line.split(/\s+/)[0]
  const n = line.split('·').length
  check(`${id} 英文序列段数 = 中文骨架段数（顺序对齐不漂移）`, n === zhExpect[id], `${n} vs ${zhExpect[id]}`)
}

// ── 8. 中英对照文件：存在、被引用、含档位词 ──────────────────────────────────
check('reference/i18n.md 存在', existsSync(join(ROOT, 'reference/i18n.md')))
let i18n = ''
try { i18n = read('reference/i18n.md') } catch { /* 缺失已由上一条断言捕获 */ }
check('SKILL.md 至少两处引用 reference/i18n.md（Step 4b + 维护须知）',
  (skill.match(/reference\/i18n\.md/g) || []).length >= 2,
  `${(skill.match(/reference\/i18n\.md/g) || []).length} 处`)
check('reference/i18n.md 含五个英文档位词',
  ['Confirmed', 'Likely true', 'Unconfirmed', 'False', 'Unverifiable'].every((w) => i18n.includes(w)))
check('reference/i18n.md 声明只有裁决有出图锚点', /只有裁决骨架有出图锚点|只有「?核查」?这一种产物/.test(i18n))
check('reference/i18n.md 声明按需读取', /按需|on-demand/.test(i18n))

// ── 9. 铁律 2 已条件化（否则非核查类会被误降档）──────────────────────────────
check('铁律 2 标注适用范围按类型收缩', /适用范围按产物类型收缩/.test(skill), '')
check('Step 1 有四条采集策略例外', /四条采集策略例外/.test(skill), '')
check('因果类要求可能性与置信度分两句写', /分两句写/.test(skill), '')

// ── 10. Step 0.5 三段齐全（拆解 → 确认 → 可行性）─────────────────────────────
check('有前提扫描小节（0.1）', /0\.1 前提扫描/.test(skill), '')
check('有作业单元表（P 前提 / D 定义 / A 分析）', /P 前提/.test(skill) && /D 定义/.test(skill) && /A 分析/.test(skill), '')
check('有定型卡模板', /【定型】/.test(skill), '')
check('确认闸门写明三种情形（停 / 不停 / 无人值守）', /轻量例外/.test(skill) && /事后可审/.test(skill), '')
check('可行性分析有高/中/低 + 缺口条纪律', /预期可得性/.test(skill) && /必须原样变成缺口条/.test(skill), '')

// ── 11. 可拆可合纪律 ─────────────────────────────────────────────────────────
check('Step 4c 有拆分必给总览', /一页总览/.test(skill), '')
check('Step 4c 有「节与节不许互相引用」硬前提', /不许互相引用/.test(skill), '')
check('可拆可合已并入 5a 机械检查', /可拆可合 \| 「见上一节/.test(skill), '')

// ── 12. INSTRUCTIONS.md 与 SKILL.md 同步（防止改了正文忘了重生成）────────────
let instr = ''
try { instr = read('INSTRUCTIONS.md') } catch { /* 缺失下面会失败 */ }
const body = skill.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart()
const expected = `<!-- 由 tools/make-instructions.mjs 从 SKILL.md 生成，请勿手改：改 SKILL.md 后重跑本脚本。 -->\n# ${fm.name}\n\n${desc ? `> ${desc}\n\n` : ''}${body}\n`
check('INSTRUCTIONS.md 与 SKILL.md 逐字同步（不一致就重跑 make-instructions）', instr === expected,
  instr === expected ? '' : `差 ${Math.abs(instr.length - expected.length)} 字符`)

// ── 13. 包装声明 ─────────────────────────────────────────────────────────────
check('package.json files 含 reference（否则发布后 i18n.md 丢失）', pkg.files.includes('reference'))
check('package.json files 含 SKILL.md', pkg.files.includes('SKILL.md'))
check('selftest 脚本含 lint-skill', /lint-skill/.test(pkg.scripts?.selftest || ''), pkg.scripts?.selftest || '(无)')

// ── 14. 旧措辞不得残留 ───────────────────────────────────────────────────────
check('正文不再出现「拆事实点」（2.0 已改成作业单元）', !/拆事实点/.test(skill), '')
check('正文不再出现「输出核查报告」这个旧 Step 4 标题', !/### Step 4 输出核查报告/.test(skill), '')

// ── 15. 释义的虚构作品变体 + 专名纪律 ────────────────────────────────────────
check('4-E 有「虚构作品」变体块', /变体：虚构作品/.test(skill), '')
check('变体块用「设定框架」替代「边界」', /## 设定框架（宇宙观/.test(skill), '')
check('变体块把剧情交给附段 4-C①', /剧情（由附段 4-C① 事件回溯承载/.test(skill), '')
check('有专名与译名纪律', /专名与译名（正文用报告语言的名字）/.test(skill), '')
check('专名纪律明确「正文用中文名、原名只进对照表」', /正文就用\*\*中文名\*\*/.test(skill), '')
check('有「译名分歧要查」一节', /译名分歧要查，不能只标/.test(skill), '')
check('译名分歧要求查来源性质与流通范围', /来源性质/.test(skill) && /流通范围/.test(skill), '')
check('译名分歧要求默认采信通行度最高的', /通行度最高/.test(skill), '')
check('明令禁止把百科条目名当官方译名', /百科的条目名是编辑选择/.test(skill), '')
check('铁律 6「专名当事实查」存在', /6\. \*\*专名当事实查\*\*/.test(skill), '')
check('铁律 6 说明错译名会漏检', /用错译名会直接导致检索漏检/.test(skill), '')
check('Step 0.2 有 N 专名作业单元', /\*\*N 专名\*\*/.test(skill), '')
check('Step 0.2 说明 N 与 D 的区别', /N 与 D 的区别/.test(skill), '')
check('Step 1 是四条采集策略例外', /四条采集策略例外/.test(skill), '')
check('Step 1 含专名多写法检索', /专名要多写法检索/.test(skill), '')
check('Step 3 有译名裁定表', /译名也要交叉比对/.test(skill) && /同词多指\*\* → 各用其域内定译/.test(skill), '')
check('Step 5 回检含译名分歧一条', /译名分歧查了吗/.test(skill), '')
check('有「提问体检」一节（0.3）', /0\.3 提问体检/.test(skill), '')
check('提问体检有四条硬停', /四条硬停/.test(skill), '')
for (const t of ['前提为假', '对象未定界到无法开工', '问题自相矛盾', '对象不存在']) {
  check(`硬停条款存在：${t}`, skill.includes(t), '')
}
check('停下时必须三样齐（含可执行修正选项）', /三样必须齐/.test(skill) && /至少一个可执行的修正选项/.test(skill), '')
check('无人值守时不许自作主张换题目', /不许自作主张换题目/.test(skill), '')
check('保守路径明确「只在无人值守时可用」', /保守路径只在无人值守时可用/.test(skill), '')
check('禁止用「我声明了缺陷」代替提问', /不许拿"我声明了缺陷"代替提问/.test(skill), '')
check('无人值守报告须显式标注提问有缺陷', /本报告基于一个有缺陷的提问/.test(skill), '')
check('无人值守不得用条件式措辞包装', /不得包装成完整回答/.test(skill), '')
check('闸门判据是「用户还在不在」', /用户还在不在/.test(skill), '')
check('闸门表首行是提问体检，并按交互/无人值守分流',
  /\| \*\*提问体检不通过\*\*.*交互会话：\*\*停\*\*.*无人值守：\*\*不停，只走保守路径\*\*/.test(skill), '')
check('合并判据是证据集重叠而非同骨架', /判据是证据集重叠，不是骨架相同/.test(skill), '')
check('前提为假时明确否定降级路径', /降级成"条件式推演"也一样/.test(skill), '')
check('0.3 不再用「承重」给前提为假留口子', !/承重前提为假/.test(skill), '')
check('4-C③ 前提核对指向 0.3 硬停', /任一条为假 → 回 0\.3 硬停/.test(skill), '')
check('正文不再出现「降级为条件式推演」', !/降级为"条件式推演"/.test(skill), '')
check('Step 5 分成 5a 机械回检 / 5b 人工回检', /5a 机械回检/.test(skill) && /5b 人工回检/.test(skill), '')
check('5a 写明四组机械检查', /它查四组/.test(skill), '')
check('5a 要求跑 lint-report', /lint-report\.mjs <报告文件>/.test(skill), '')
check('5b 只剩机器判不了的项（无 lint-report 命令）',
  !/5b[\s\S]{0,2000}lint-report\.mjs <报告文件>/.test(skill.split('5b 人工回检')[1] || ''), '')
check('tools/lint-report.mjs 存在', existsSync(join(ROOT, 'tools/lint-report.mjs')))
check('package.json 有 lint-report 脚本', /lint-report/.test(pkg.scripts?.['lint-report'] || ''), '')

// ── 16. 2.0 后续补强（改型 / 子代理回报 / 总览模板 / 基线）────────────────────
check('有「改型」规则（允许中途换骨架）', /改型（采集中途发现定型错了）/.test(skill), '')
check('改型要求声明与编号重排', /定型：<原骨架> → <新骨架>/.test(skill) && /来源编号全量重排/.test(skill), '')
check('改型两次以上退回提问体检', /改型发生两次以上/.test(skill), '')
check('子代理回报按骨架补字段', /回报必须按骨架补字段/.test(skill), '')
check('回报字段覆盖因果与对照两类关键差异',
  /因果链节点/.test(skill) && /同口径配对数据/.test(skill), '')
check('4c 有一页总览模板', /一页总览模板/.test(skill) && /## 总览/.test(skill), '')
check('MEASUREMENTS 有 2.0 基线', /2\.0\.0 的判断基线/.test(read('MEASUREMENTS.md')), '')

// ── 17. definition 域（判据改动，需与 cases / MEASUREMENTS 同步）─────────────
const matrix = JSON.parse(read('tools/source-matrix.json'))
const routeSrc = read('tools/route.mjs')
check('source-matrix 有 definition 域', !!matrix.domains?.definition)
check('definition 阶梯首级是术语在线', (matrix.domains?.definition?.ladder?.[0] || '').includes('术语在线'))
check('definition 阶梯覆盖标准与法规定义',
  (matrix.domains?.definition?.ladder || []).some((s) => s.includes('openstd')) &&
    (matrix.domains?.definition?.ladder || []).some((s) => s.includes('flk.npc.gov.cn')))
check('definition 域排在 DOMAIN_SIGNALS 首位', /const DOMAIN_SIGNALS = \[\s*\n(\s*\/\/[^\n]*\n)*\s*\['definition'/.test(routeSrc), '')
check('definition 触发词带 $ 锚（不吞取值问句）', routeSrc.includes('是什么[？?。]?\\s*$'), '')
check('4-E 指向 definition 域阶梯', /走 `definition` 域阶梯/.test(skill), '')
check('4-E 要求两侧定义不同则并列不合并', /差异本身是结论/.test(skill), '')
check('MEASUREMENTS 有 10.4 重新校准记录', /10\.4 `definition` 域的重新校准/.test(read('MEASUREMENTS.md')), '')

// ── 18. 判据树改问法驱动 + 两处边界 + 两处段序 ──────────────────────────────
check('判据树 4/5/6 改成问法驱动', /4\. 问「怎么回事 \/ 经过 \/ 始末」/.test(skill), '')
check('明确 4/5/6 看问法不看主语', /三步看问法，不看主语/.test(skill), '')
check('「是不是 / 该不该」不构成事实命题', /「是不是 \/ 该不该」不一定是命题/.test(skill), '')
check('数值 vs 评价的判据已写', /数值 vs 评价/.test(skill), '')
check('4-E 义项排在规范定义之前',
  skill.includes('## 义项（多义时必写：') &&
    skill.indexOf('## 义项（多义时必写：') < skill.indexOf('## 规范定义（权威原文）'), '')
check('4-S 缺口排在机制之后',
  skill.indexOf('## 机制解释（本骨架必写') < skill.indexOf('## 缺口（不知道什么'), '')
check('4-E 英文序列与改后段序一致', /4-E   One-line definition · Senses · Normative definition/.test(skill), '')
check('4-S 英文序列 Gaps 移到 Sources 之前', /4-S   Key findings .* · Recommendations · Gaps · Sources/.test(skill), '')
check('第 1 步限定为「问句本身」在要真假判断', /1\. \*\*问句本身\*\*在要一个真假判断/.test(skill), '')
check('第 2 步限定为「要的就是数值」', /2\. 要的就是某个数值 \/ 字段本身/.test(skill), '')
check('第 7 步要求「已点名」的对象', /7\. 两个以上\*\*已点名\*\*的对象同维度/.test(skill), '')
check('说明第 1 步不看句子成分（嵌入命题归前提扫描）', /第 1 步只看问句要什么，不看句子成分/.test(skill), '')
check('说明补充规则优先于步序', /补充规则与步序冲突时，补充规则优先/.test(skill), '')
check('有「同词异译」一节', /同词异译：一个外文词，几套定译/.test(skill), '')
check('区分「同对象多译」与「同词多指」', /同对象多译/.test(skill) && /同词多指/.test(skill), '')
check('给出同词异译判例（门罗 / 梦露）', /门罗 \/ 梦露/.test(skill), '')
check('明确「全篇统一」只对同一对象成立', /那条只对"同一个对象"成立/.test(skill) || /那条只对「同一个对象」成立/.test(skill), '')
check('i18n 标注同词异译的写法', /same source term, different referent/.test(i18n), '')
check('有「名字当不了主键」一节', /名字当不了主键/.test(i18n) || /名字当不了主键/.test(skill), '')
check('区分一指多名与一名多指', /一指多名/.test(skill) && /一名多指/.test(skill), '')
check('给出史料判例（伯顔 / 廿二史札记）', /伯顔一見/.test(skill), '')
check('要求用实体表 + 别名表（多对多）', /实体表/.test(skill) && /多对多/.test(skill), '')
check('自检句改为看事件重叠', /要看\*\*事件是否重叠\*\*/.test(skill), '')
check('要求把史料编纂缺陷本身当调查对象', /史料本身的编纂缺陷也是要查的对象/.test(skill), '')
check('i18n 有一指多名×一名多指的表格式', /实体表\*\*（主键）/.test(i18n), '')
check('reference/i18n.md 有专名与译名分歧表一节', /## 5\. 专名对照表与译名分歧表/.test(i18n), '')
check('i18n 标明中英两侧表头方向相反', /English \/ Origin \/ Where it circulates \/ Adopted/.test(i18n), '')
check('i18n 中文侧列固定为四个', /中文译法 \/ 来源性质 \/ 流通范围 \/ 采信/.test(i18n), '')

// ── 19. 骨架锚点表（reference/skeleton-anchors.json，给下游出图侧消费）──────────
// 这份表是**既有标题的索引**，不是新锚点，也不改变行为：正文流程不读它。
// 所以本组断言守的是一条不变量——标题改名 === 本组变红，两边同时知道，不再静默失效。
const ANCHOR_PATH = 'reference/skeleton-anchors.json'
const ANCHOR_IDS = ['verdict', 'definition', 'causal', 'compare', 'map', 'metric']
const ANCHOR_SECTION = { verdict: '4-V', definition: '4-E', causal: '4-C', compare: '4-M', map: '4-S', metric: '4-L' }
// 匹配规则与消费方逐字一致：先去掉末尾括号说明（可叠加），再全等比较。
// 不做前缀、不做子串——否则 `边界`（4-E）会误吞 `边界与反例`（4-C）。
const shortHeading = (h) => {
  let out = String(h).trim()
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out.replace(/\s*[（(][^（）()]*[）)]\s*$/, '').trim()
  }
  return out
}
// 一节内的全部 `## ` 标题：必须跨该节所有 ```markdown 块——
// 4-E 有「标准件 + 二次元设定变体」两块，4-C 有三个入口，只取第一块会漏掉变体专有标题。
function headingsInSkeleton(id) {
  const head = new RegExp(`^#### ${id} `, 'm').exec(skill)
  if (!head) return []
  const after = skill.slice(head.index + head[0].length)
  const next = after.search(/^#{3,4} /m)
  const section = next >= 0 ? after.slice(0, next) : after
  return [...section.matchAll(/```markdown\n([\s\S]*?)\n```/g)].flatMap((b) =>
    b[1].split('\n').filter((l) => l.startsWith('## ')).map((l) => shortHeading(l.slice(3))),
  )
}
// §4b 的英文序列按条目拆成标题数组；4-C 取三入口并集（C1/C2 共享尾段，拆开必撞车）。
const enTitles = {}
for (const line of seqLines) {
  const sid = line.split(/\s+/)[0]
  const titles = line.replace(/^\s*\S+\s+/, '').split('·').map(shortHeading).filter(Boolean)
  enTitles[sid] = [...new Set([...(enTitles[sid] || []), ...titles])]
}
const enUnion = (sid) =>
  sid === '4-C' ? [...new Set(['4-C1', '4-C2', '4-C3'].flatMap((k) => enTitles[k] || []))] : enTitles[sid] || []

check('reference/skeleton-anchors.json 存在', existsSync(join(ROOT, ANCHOR_PATH)))
let anchors = null
try { anchors = JSON.parse(read(ANCHOR_PATH)) } catch { anchors = null }
check('骨架锚点表可解析为 JSON', !!anchors)
const anchorList = Array.isArray(anchors?.skeletons) ? anchors.skeletons : []
check('骨架锚点表六个 id 齐全且不重不缺',
  anchorList.length === ANCHOR_IDS.length &&
    ANCHOR_IDS.every((id) => anchorList.filter((x) => x.id === id).length === 1),
  anchorList.map((x) => x.id).join(',') || '(无)')
check('骨架锚点表 version = SKILL.md frontmatter 版本（不升版本）',
  anchors?.version === fm.version, `${anchors?.version} vs ${fm.version}`)
check('骨架锚点表声明匹配规则为「去末尾括号后全等」',
  anchors?.matchRule === 'stripTrailingParenThenExact', String(anchors?.matchRule))
const sharedEn = new Set(
  [...(anchors?.sharedHeadings?.noSkeletonMayUse?.en || []), ...(anchors?.sharedHeadings?.verdictOnly?.en || [])]
    .map(shortHeading),
)
for (const id of ANCHOR_IDS) {
  const entry = anchorList.find((x) => x.id === id) || {}
  const zh = (entry.match || []).map(shortHeading)
  const en = (entry.matchEn || []).map(shortHeading)
  const heads = new Set(headingsInSkeleton(ANCHOR_SECTION[id]))
  const seq = new Set(enUnion(ANCHOR_SECTION[id]))
  const missingZh = zh.filter((h) => !heads.has(h))
  const missingEn = en.filter((h) => !seq.has(h))
  // 英文序列里不当作锚点的那几段，必须是共享标题；裁决例外——它只挑三个锚点，
  // 其余段落（始末、国内外视角、档位…）本就不许当锚点，不是"漏登记"。
  const extraEn = id === 'verdict' ? [] : [...seq].filter((h) => !en.includes(h) && !sharedEn.has(h))
  check(`骨架锚点 ${id} 与 SKILL.md 一致（match 命中块内标题 / matchEn 在英文序列内 / 非锚点均为共享标题）`,
    zh.length >= 2 && (entry.minHits || 0) >= 2 && entry.minHits <= zh.length &&
      missingZh.length === 0 && missingEn.length === 0 && extraEn.length === 0,
    [
      missingZh.length ? `match 未命中: [${missingZh.join(', ')}]` : '',
      missingEn.length ? `matchEn 不在英文序列: [${missingEn.join(', ')}]` : '',
      extraEn.length ? `英文序列多出非共享标题: [${extraEn.join(', ')}]` : '',
      (entry.minHits || 0) < 2 || entry.minHits > zh.length ? `minHits=${entry.minHits} 对 ${zh.length} 条 match` : '',
    ].filter(Boolean).join('；'))
}
const zhMatches = anchorList.flatMap((x) => (x.match || []).map((h) => [shortHeading(h), x.id]))
const zhOwner = new Map()
for (const [h, id] of zhMatches) {
  if (!zhOwner.has(h)) zhOwner.set(h, new Set())
  zhOwner.get(h).add(id)
}
const zhDup = [...zhOwner.entries()].filter(([, ids]) => ids.size > 1).map(([h, ids]) => `${h}→${[...ids].join('/')}`)
check('同一短标题不出现在两个骨架的 match 里（否则互相认领）', zhDup.length === 0, zhDup.join('; '))
check('exportCard 只有裁决为 true（其余骨架不得造档位/双轨）',
  anchorList.length === ANCHOR_IDS.length &&
    anchorList.every((x) => (x.id === 'verdict' ? x.exportCard === true : x.exportCard === false)),
  anchorList.filter((x) => (x.id === 'verdict' ? x.exportCard !== true : x.exportCard !== false)).map((x) => x.id).join(',') || '')
const noUse = new Set((anchors?.sharedHeadings?.noSkeletonMayUse?.zh || []).map(shortHeading))
const noUseHit = zhMatches.filter(([h]) => noUse.has(h)).map(([h, id]) => `${h}←${id}`)
check('noSkeletonMayUse 的标题一个都没进任何 match', noUse.size > 0 && noUseHit.length === 0, noUseHit.join('; '))
const verdictOnly = new Set((anchors?.sharedHeadings?.verdictOnly?.zh || []).map(shortHeading))
const voHit = zhMatches.filter(([h, id]) => verdictOnly.has(h) && id !== 'verdict').map(([h, id]) => `${h}←${id}`)
check('verdictOnly 的标题只出现在裁决的 match 里（其它骨架用它就会与裁决互相认领）',
  verdictOnly.size > 0 && voHit.length === 0 &&
    zhMatches.some(([h, id]) => verdictOnly.has(h) && id === 'verdict'),
  voHit.join('; '))

// ── 汇总 ─────────────────────────────────────────────────────────────────────
const total = pass + fail
console.log(`\n${pass}/${total} 通过`)
if (fail) {
  console.log(`\n失败 ${fail} 条：`)
  failures.forEach((f) => console.log(`  - ${f}`))
  process.exit(1)
}
console.log('结论：骨架结构、裁决锚点、双语序列与生成物同步均成立。')
