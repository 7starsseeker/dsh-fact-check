#!/usr/bin/env node
/**
 * route — deterministic planner for the fact-check skill.
 *
 * Given a one-line task description it prints WHERE to look (source ladder) and
 * HOW to look (engines / channels), plus the failure-action table. No model is
 * involved: this is the part of the pipeline that must never cost tokens or
 * drift, and it is auditable line by line.
 *
 * Usage:
 *   node tools/route.mjs plan --task "核实某地自来水超标传闻"
 *   node tools/route.mjs selftest
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const matrix = JSON.parse(readFileSync(join(HERE, 'source-matrix.json'), 'utf8'))
const routes = JSON.parse(readFileSync(join(HERE, 'engine-routes.json'), 'utf8'))

/**
 * Machine-local values live in `local.json` (shipped as local.example.json) —
 * never in the tables or the code. Anything environment-specific in the tables
 * is written as ${PLACEHOLDER} and resolved here from:
 * env JEV_<NAME> → env <NAME> → local.json `overrides.<NAME>` → left as-is.
 */
export function localOverrides() {
  try {
    const f = join(HERE, 'local.json')
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')).overrides || {}
  } catch {
    /* a broken local.json must not break planning */
  }
  return {}
}

export function subst(text) {
  const ov = localOverrides()
  return String(text).replace(/\$\{([A-Z0-9_]+)\}/g, (m, name) =>
    process.env[`JEV_${name}`] || process.env[name] || ov[name] || m)
}

function substDeep(value) {
  if (typeof value === 'string') return subst(value)
  if (Array.isArray(value)) return value.map(substDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substDeep(v)]))
  }
  return value
}

/** Placeholders with no value anywhere — the caller must fill them in. */
export function unresolved() {
  const found = new Set()
  const walk = (v) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\$\{([A-Z0-9_]+)\}/g)) found.add(m[1])
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(routes)
  return [...found].filter((name) => subst(`\${${name}}`) === `\${${name}}`)
}

/** Keyword → domain. Ordered: the first match wins, most specific first. */
const DOMAIN_SIGNALS = [
  ['image_video', /(图片|照片|视频|监控|截图|EXIF|合成|伪造的?图|deepfake)/i],
  ['academic', /(论文|期刊|研究|学术|DOI|撤稿|预印本|被引)/i],
  ['medical', /(药|保健品|治疗|临床|疫苗|医疗|病|疗效|药监)/i],
  ['cn_policy', /(政策|法规|条例|法条|司法解释|统计年鉴|文号|国务院|征求意见)/i],
  ['finance', /(上市|股价|财报|融资|重组|证券|交易所|IPO|币|加密货币|跑路)/i],
  ['cn_social_rumor', /(传闻|谣言|辟谣|网传|社媒|公众号|知乎|B\s?站|微博|小红书|抖音|舆情|热搜|大V|博主|网暴|舆论危机)/i],
  ['international', /(国际|境外|外国|跨国|海外|联合国|世卫|欧盟|美国|美方|日本|日方|欧洲|白宫|国会|当地)/i],
  ['company_claim', /(公司|企业|厂商|宣布|合作|行业第一|市占|官网)/i],
  ['tech_release', /(版本|更新|发布|仓库|插件|npm|pip|库|许可|LICENSE|CVE|RFC|API|模型|部署)/i],
]

/** domain → engine route ids (from engine-routes.json). */
const DOMAIN_ROUTES = {
  cn_policy: ['official_json_api', 'general_web', 'news_rss'],
  cn_social_rumor: ['searxng_meta', 'closed_cn_social', 'general_web', 'factcheck_registry'],
  tech_release: ['general_web', 'searxng_meta', 'vertical_domain'],
  academic: ['academic_api', 'general_web', 'vertical_domain'],
  medical: ['official_json_api', 'academic_api', 'general_web'],
  finance: ['official_json_api', 'general_web', 'vertical_domain', 'news_rss'],
  international: ['general_web', 'searxng_meta', 'news_rss', 'archive'],
  image_video: ['media_metadata', 'closed_cn_social', 'closed_intl_social', 'archive'],
  company_claim: ['general_web', 'domain_intel', 'archive', 'news_rss'],
}

export function planFor(task) {
  const matched = []
  for (const [domain, re] of DOMAIN_SIGNALS) if (re.test(task)) matched.push(domain)
  const chosen = matched.length ? matched : ['tech_release']
  const ladders = chosen.map((d) => ({ domain: d, label: matrix.domains[d].label, ladder: matrix.domains[d].ladder }))
  const routeIds = [...new Set(chosen.flatMap((d) => DOMAIN_ROUTES[d] || []))]
  const chosenRoutes = routeIds.map((id) => routes.routes.find((r) => r.id === id)).filter(Boolean)
  const closed = chosen.some((d) => matrix.domains[d].closed)
  const factPoints = [...task.matchAll(/[；;。\n]/g)].length + 1
  return {
    task,
    domains: chosen,
    closedEcosystem: closed,
    factPointsInText: factPoints,
    ladders: substDeep(ladders),
    routes: chosenRoutes.map((r) => ({ id: r.id, when: subst(r.when), primary: substDeep(r.primary), notes: subst(r.notes) })),
    failureActions: substDeep(routes._failure_actions),
    localPlaceholdersUnset: unresolved(),
    dispatchHint: closed || chosen.length >= 3 || factPoints >= 4
      ? '需要多路取证（封闭生态 / 多类型事实点）→ 候选派子代理；最终仍以派发判据标注集为准'
      : '单路可覆盖，串行处理即可',
  }
}

function selftest() {
  const checks = []
  const t = (name, fn) => {
    try {
      checks.push([name, fn() ? 'pass' : 'FAIL'])
    } catch (e) {
      checks.push([name, `FAIL (${e.message})`])
    }
  }
  t('每次规划都至少落一个域', () => planFor('核实某说法').domains.length >= 1)
  t('谣传类任务识别出封闭生态', () => planFor('核查一条微信公众号首发的传闻').closedEcosystem === true)
  t('谣言类走到辟谣平台', () => planFor('核实一条网传谣言').routes.some((r) => r.id === 'factcheck_registry'))
  t('学术任务走 Crossref', () => planFor('核查这篇论文是否被撤稿').routes.some((r) => r.id === 'academic_api'))
  t('政策任务走官方 JSON 接口', () => planFor('确认该政策文件的文号').routes.some((r) => r.id === 'official_json_api'))
  t('视频任务走 EXIF 通道', () => planFor('核实这段视频的真实性').routes.some((r) => r.id === 'media_metadata'))
  t('图片任务识别为封闭生态', () => planFor('这张照片是真的吗').closedEcosystem === true)
  t('舆情类任务识别为社媒域（事件性质词，不只平台名）', () =>
    planFor('核查某公司近期舆情事件的始末').domains.includes('cn_social_rumor'))
  t('舆情类任务触发多路取证', () => planFor('核查某公司近期舆情事件的始末').closedEcosystem === true)
  t('热搜类任务识别为社媒域', () => planFor('某品牌冲上热搜，核实那条说法').domains.includes('cn_social_rumor'))
  t('不以单字误命中国际域', () => !planFor('这套方案的设计很美观').domains.includes('international'))
  t('每个域的 ladder 都非空', () => Object.values(matrix.domains).every((d) => Array.isArray(d.ladder) && d.ladder.length >= 3))
  t('每张域路由表引用的 route 都真实存在', () =>
    Object.entries(DOMAIN_ROUTES).every(([d, ids]) => matrix.domains[d] && ids.every((id) => routes.routes.some((r) => r.id === id))))
  t('失败动作表覆盖超时与拒绝两类', () => {
    const s = JSON.stringify(routes._failure_actions)
    return s.includes('403') && (s.includes('超时') || s.includes('000'))
  })
  t('未匹配任务有兜底域', () => planFor('???').domains[0] === 'tech_release')
  t('常见任务的路线数不超过 5 条', () => planFor('核查某公司宣称的合作是否属实，需要境外监管文件').routes.length <= 5)
  t('可移植：占位符可由 JEV_* 环境变量解析', () => {
    const old = process.env.JEV_SEARXNG_URL
    process.env.JEV_SEARXNG_URL = 'http://127.0.0.1:9999'
    const ok = subst('${SEARXNG_URL}') === 'http://127.0.0.1:9999'
    if (old === undefined) delete process.env.JEV_SEARXNG_URL
    else process.env.JEV_SEARXNG_URL = old
    return ok
  })
  t('可移植：未赋值的占位符会被显式列出', () => Array.isArray(unresolved()) && planFor('核实一下').localPlaceholdersUnset.length === unresolved().length)
  t('可移植：代码里不硬编码本机路径', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    return !/\/mnt\/[a-z]\//.test(self) && !/\.dsh\//.test(self)
  })

  const failed = checks.filter(([, s]) => s !== 'pass')
  for (const [n, s] of checks) console.log(`  ${s === 'pass' ? '✓' : '✗'} ${n}${s === 'pass' ? '' : ' — ' + s}`)
  console.log(`\n${checks.length - failed.length}/${checks.length} 通过`)
  return failed.length === 0
}

/** 路由语料回归：任务描述 → 期望命中/不命中的域与路线。不出网、不调模型、0 成本。 */
function regress(file) {
  const path = isAbsolute(file) ? file : resolve(process.cwd(), file)
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const cases = data.cases ?? data
  const fails = []
  let pass = 0
  for (const c of cases) {
    const p = planFor(c.task)
    const checks = []
    if (c.expectDomains) checks.push(['expectDomains', c.expectDomains.every((d) => p.domains.includes(d))])
    if (c.expectNotDomains) checks.push(['expectNotDomains', c.expectNotDomains.every((d) => !p.domains.includes(d))])
    if (typeof c.expectClosed === 'boolean') checks.push(['expectClosed', p.closedEcosystem === c.expectClosed])
    if (c.expectRoutes) checks.push(['expectRoutes', c.expectRoutes.every((r) => p.routes.some((x) => x.id === r))])
    if (typeof c.expectDispatch === 'boolean') {
      checks.push(['expectDispatch', c.expectDispatch === (p.dispatchHint.startsWith('需要多路取证'))])
    }
    if (!checks.length || checks.every(([, v]) => v)) {
      if (checks.length) pass++
      else fails.push(`${c.id}: 语料里没有任何 expect* 断言`)
      continue
    }
    fails.push(
      `${c.id}: ${checks.filter(([, v]) => !v).map(([n]) => n).join(',')} 不达标` +
        ` → 实际 domains=${p.domains.join('/')} closed=${p.closedEcosystem} routes=${p.routes.map((r) => r.id).join('/')}`,
    )
  }
  console.log(`\nroute 语料 ${pass}/${cases.length} 通过`)
  for (const f of fails) console.log(`  ✗ ${f}`)
  return fails.length === 0
}

function main() {
  const cmd = process.argv[2]
  if (cmd === 'selftest') process.exit(selftest() ? 0 : 1)
  if (cmd === 'regress') {
    const i = process.argv.indexOf('--file')
    if (i < 0 || !process.argv[i + 1]) {
      console.error('用法: node tools/route.mjs regress --file cases/route-cases-neutral.json')
      process.exit(1)
    }
    process.exit(regress(process.argv[i + 1]) ? 0 : 1)
  }
  if (cmd === 'plan') {
    const i = process.argv.indexOf('--task')
    const task = i >= 0 ? process.argv[i + 1] : ''
    if (!task) {
      console.error('用法: node tools/route.mjs plan --task "..."')
      process.exit(1)
    }
    const plan = planFor(task)
    console.log(JSON.stringify(plan, null, 1))
    return
  }
  console.log('用法: node tools/route.mjs <plan --task "…" | selftest | regress --file cases/route-cases-neutral.json>')
}

const direct = process.argv[1] && process.argv[1].endsWith('route.mjs')
if (direct) main()
