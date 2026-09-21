#!/usr/bin/env node
/**
 * smoke-plugin — 离线自检：本包作为 DSH 插件是否装得上、挂得对。
 *
 * 为什么需要它：DSH 这边最坏的失效形态是**插件一声不响地没挂上** —— 没有报错、
 * 命令照跑。所以这里不看「有没有抛错」，而是看**副作用**：用一个假的 ctx 调 `apply()`，
 * 断言它确实注册了 provider，再断言 `list()`/`get()` 交出的东西是对的，
 * 尤其是「候选描述 = SKILL.md 的 frontmatter」这条单一真相源。
 *
 * 全程离线、零依赖、不碰 DSH、不碰本机配置。
 *
 * Usage: node tools/smoke-plugin.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const results = []
const check = (name, ok, detail = '') => results.push([name, !!ok, detail])

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const has = (rel) => existsSync(join(ROOT, rel))

// ── A. 包结构：市场与 `dsh plugin add` 看的就是这三样 ─────────────────────────────
let pkg = {}
try {
  pkg = JSON.parse(read('package.json'))
  check('package.json 可解析', true)
} catch (e) {
  check('package.json 可解析', false, String(e.message))
}

check('声明了 dsh.bundle.patch（市场前置条件）', !!pkg.dsh?.bundle?.patch, String(pkg.dsh?.bundle?.patch))
const patchRel = String(pkg.dsh?.bundle?.patch || '').replace(/^\.\//, '')
check(`patch 文件存在（${patchRel}）`, patchRel !== '' && has(patchRel))

const patchText = has(patchRel) ? read(patchRel) : ''
const patchId = (patchText.match(/^\s*-\s*id:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const patchName = (patchText.match(/^\s*name:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '')

const plugin = await import('../lib/index.js')

check('patch 的 id 与插件 export name 一致', patchId === plugin.name, `patch=${patchId} plugin=${plugin.name}`)
check('patch 的 name 与 package.json name 一致', patchName === pkg.name, `patch=${patchName} pkg=${pkg.name}`)
check('插件声明 inject 了 skills 服务', Array.isArray(plugin.inject) && plugin.inject.includes('skills'), JSON.stringify(plugin.inject))
check('插件导出了 apply()', typeof plugin.apply === 'function')

// ── B. 挂载的副作用：apply() 必须真的注册一个 provider ──────────────────────────
const registered = []
const fakeCtx = { skills: { registerProvider: (create) => registered.push(create) } }
try {
  plugin.apply(fakeCtx)
  check('apply() 注册了 provider（看副作用，不看有没有报错）', registered.length === 1, `注册数=${registered.length}`)
} catch (e) {
  check('apply() 注册了 provider（看副作用，不看有没有报错）', false, String(e.message))
}

const provider = registered.length === 1 ? registered[0]() : null
check('provider 暴露 list() 与 get()', typeof provider?.list === 'function' && typeof provider?.get === 'function')

// ── C. 候选：必须能过 DSH 注册表的校验 ────────────────────────────────────────
let candidates = []
try {
  candidates = await provider.list({})
  check('list() 返回一条技能', candidates.length === 1, `条数=${candidates.length}`)
} catch (e) {
  check('list() 返回一条技能', false, String(e.message))
}

const cand = candidates[0] || {}
check('候选 name 是 kebab-case', plugin.isSkillName(cand.name), String(cand.name))
check('候选 description 非空', typeof cand.description === 'string' && cand.description.length > 0)
check('候选 source 是 bundled', cand.source === 'bundled', String(cand.source))
check('候选 rank 是 bundled 档 600', cand.rank === 600, String(cand.rank))
check('候选 provider 与插件名一致', cand.provider === plugin.name, String(cand.provider))
check('resourceBase 指向包根（正文里的 tools/… 才可解析）',
  cand.resourceBase?.kind === 'directory' && resolve(cand.resourceBase.path) === ROOT,
  String(cand.resourceBase?.path))

// 单一真相源：候选描述就是 SKILL.md 的 frontmatter，不是另一份手抄。
const fm = plugin.parseFrontmatter(read('SKILL.md')).fm
check('候选描述 = SKILL.md frontmatter 的 description（单一真相源）', cand.description === fm.description)
check('SKILL.md frontmatter 的 name 与候选一致', fm.name === cand.name, `${fm.name} vs ${cand.name}`)
check('SKILL.md frontmatter 的 version 存在', !!fm.version, String(fm.version))
check('SKILL.md 的 name 与包内的调用名一致', plugin.name === 'fact-check', plugin.name)

// ── D. 正文：应能被读出来，且已剥掉 frontmatter ────────────────────────────────
let body = ''
try {
  const def = await provider.get(cand)
  body = def.content
  check('get() 返回定义且 content 非空', typeof body === 'string' && body.length > 0, `${body.length} 字符`)
  check('get() 的正文已剥掉 frontmatter', !body.startsWith('---'), body.slice(0, 20).replace(/\n/g, '\\n'))
  check('get() 的正文含技能标志段（## 铁律）', body.includes('## 铁律'))
  check('get() 的 invocation 与候选一致', JSON.stringify(def.invocation) === JSON.stringify(cand.invocation))
} catch (e) {
  check('get() 返回定义且 content 非空', false, String(e.message))
}

// name 不符时必须抛错（否则会交出一份名不副实的定义）
let threw = false
try {
  await provider.get({ ...cand, name: 'not-the-same-name' })
} catch {
  threw = true
}
check('名字不符时 get() 抛错而不是交出不对的定义', threw)

// ── E. 可移植：代码与 patch 里不得硬编码本机路径（与 route/jev-verdict 同一判据）─
const HOST_PATH = /(^|[^A-Za-z0-9])([A-Za-z]:[\\/]|\/home\/|\/Users\/|\\\\wsl)/m
for (const rel of ['lib/index.js', patchRel]) {
  const hit = HOST_PATH.exec(read(rel))
  check(`可移植：${rel} 不硬编码本机路径`, !hit, hit ? `命中 ${JSON.stringify(hit[0])}` : '')
}

// ── 汇总 ─────────────────────────────────────────────────────────────────────
let failed = 0
for (const [n, ok, detail] of results) {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
console.log(`\n${results.length - failed}/${results.length} 通过`)
if (failed === 0) {
  console.log('结论：插件可挂载，候选与正文都取自 SKILL.md（改 SKILL.md 无需改代码）。')
}
process.exit(failed === 0 ? 0 : 1)
