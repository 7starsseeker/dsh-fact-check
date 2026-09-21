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
 *   node tools/route.mjs arms
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const matrix = JSON.parse(readFileSync(join(HERE, 'source-matrix.json'), 'utf8'))
const routes = JSON.parse(readFileSync(join(HERE, 'engine-routes.json'), 'utf8'))
/** The bundled corpora live beside tools/ — located from this file, never hard-coded. */
const CASES_DIR = resolve(HERE, '..', 'cases')

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

/**
 * Keyword → domain. The order is "most specific first" for reading only: every
 * regex that matches is kept and the domains are unioned, so one task can land in
 * several at once — a rumour about an earthquake is both `disaster_emergency`
 * and `cn_social_rumor`, and both ladders are then handed over.
 */
const DOMAIN_SIGNALS = [
  ['image_video', /(图片|照片|视频|监控|截图|EXIF|合成|伪造的?图|deepfake)/i],
  ['legal_case', /(判决|判刑|量刑|起诉|批捕|逮捕|刑拘|刑事拘留|立案|开庭|庭审|宣判|法院|检察院|警情通报|警方通报|纪委监委|取保候审|缓刑|无期徒刑|死刑|案件|嫌疑人|被告人)/i],
  ['disaster_emergency', /(地震|震级|余震|台风|飓风|洪水|汛情|暴雨|山洪|泥石流|滑坡|干旱|雪灾|冰雹|森林火灾|爆炸|坍塌|垮塌|溃坝|堰塞湖|泄洪|矿难|坠机|失事|沉船|踩踏|车祸|事故|伤亡|遇难|失联|被困|救援|灾害|灾情)/i],
  ['food_safety', /(食品|添加剂|防腐剂|保鲜剂|色素|甜味剂|农残|农药残留|兽药|抗生素|激素|保质期|致癌|重金属|地沟油|预制菜|转基因|反式脂肪|奶粉|奶制品|生鲜|食安)/i],
  ['medical', /(药|保健品|治疗|临床|疫苗|医疗|病|疗效|药监)/i],
  ['science_general', /(科学|科普|伪科学|辐射|电磁|基因|进化|量子|宇宙|黑洞|太阳|月球|磁场|化学|物理|天文|地质|气候|病毒|细菌|DNA|养生|偏方|排毒|酸碱体质)/i],
  ['academic', /(论文|期刊|研究|学术|DOI|撤稿|预印本|被引)/i],
  ['education_exam', /(高考|中考|考研|招生|录取|学信网|毕业证|学位|分数线|考试|教师|教育局|教育厅|教育部|双减|学区|教材)/i],
  ['sports', /(比赛|赛事|联赛|世界杯|奥运|锦标赛|冠军|夺冠|金牌|进球|比分|战绩|转会|签约|球员|球队|俱乐部|运动员|教练|裁判|兴奋剂|禁赛|退役|纪录)/i],
  ['entertainment_celebrity', /(明星|艺人|演员|歌手|导演|主持人|网红|名人|公众人物|工作室|经纪公司|娱乐公司|粉丝|饭圈|塌房|绯闻|恋情|出道|退圈|封杀|演唱会|影视剧|综艺)/i],
  ['cn_policy', /(政策|法规|条例|法条|司法解释|统计年鉴|文号|国务院|征求意见)/i],
  ['finance', /(上市|股价|财报|融资|重组|证券|交易所|IPO|币|加密货币|跑路)/i],
  ['cn_social_rumor', /(传闻|谣言|辟谣|网传|社媒|公众号|知乎|B\s?站|微博|小红书|抖音|舆情|热搜|大V|博主|网暴|舆论危机)/i],
  ['international', /(国际|境外|外国|跨国|海外|联合国|世卫|欧盟|美国|美方|日本|日方|欧洲|白宫|国会|当地)/i],
  ['company_claim', /(公司|企业|厂商|宣布|合作|行业第一|市占|官网)/i],
  ['tech_release', /(版本|更新|发布|仓库|插件|npm|pip|库|许可|LICENSE|CVE|RFC|API|模型|部署)/i],
]

/**
 * domain → engine route ids (from engine-routes.json).
 * Every domain stays at or below five routes (selftest asserts it). A plan that
 * matches several domains unions their routes, so a multi-domain task legitimately
 * sees more than five.
 */
const DOMAIN_ROUTES = {
  cn_policy: ['official_json_api', 'general_web', 'news_rss'],
  cn_social_rumor: ['searxng_meta', 'closed_cn_social', 'general_web', 'factcheck_registry'],
  tech_release: ['general_web', 'searxng_meta', 'vertical_domain'],
  academic: ['academic_api', 'general_web', 'vertical_domain'],
  medical: ['gov_notice', 'academic_api', 'general_web'],
  finance: ['official_json_api', 'general_web', 'vertical_domain', 'news_rss'],
  international: ['general_web', 'searxng_meta', 'news_rss', 'archive'],
  image_video: ['media_metadata', 'closed_cn_social', 'closed_intl_social', 'archive'],
  company_claim: ['general_web', 'domain_intel', 'archive', 'news_rss'],
  legal_case: ['gov_notice', 'general_web', 'news_rss', 'archive'],
  disaster_emergency: ['gov_notice', 'news_rss', 'general_web', 'archive'],
  food_safety: ['gov_notice', 'general_web', 'vertical_domain'],
  science_general: ['science_authority', 'factcheck_registry', 'general_web'],
  education_exam: ['gov_notice', 'general_web', 'news_rss'],
  sports: ['sports_official', 'general_web', 'closed_intl_social'],
  entertainment_celebrity: ['entertainment_official', 'closed_cn_social', 'archive'],
}

export function planFor(task) {
  const matched = []
  for (const [domain, re] of DOMAIN_SIGNALS) if (re.test(task)) matched.push(domain)
  // An unmatched task falls back to technology releases: the widest ladder, and the
  // only one whose routes (general search + metasearch + vertical) fit any topic.
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

/**
 * Proxy metric for the dispatch arms table in MEASUREMENTS.md §4: take this
 * planner's own `dispatchHint` as the deterministic-keyword arm and score it
 * against the consensus of two independent blind labellers. Only the samples both
 * labellers agree on are counted — the disputed ones are ambiguous by construction
 * and say nothing about the rule.
 *
 * ⚠ This is NOT the R rule of §4: that one is author-side and not shipped, so this
 * number must never be read against §4's 88.6%.
 */
export function armAgreement(tasks, labelsA, labelsB) {
  const a = new Map(labelsA.map((x) => [x.id, x.label]))
  const b = new Map(labelsB.map((x) => [x.id, x.label]))
  const out = { agree: 0, total: 0, pct: 0, falseDispatch: 0, missedDispatch: 0, mismatches: [] }
  for (const c of tasks) {
    const la = a.get(c.id)
    const lb = b.get(c.id)
    if (la === undefined || lb === undefined || la !== lb) continue
    const plan = planFor(c.task)
    const rule = plan.dispatchHint.startsWith('需要多路取证')
    out.total++
    if (rule === la) {
      out.agree++
      continue
    }
    if (rule) out.falseDispatch++
    else out.missedDispatch++
    out.mismatches.push({
      id: c.id,
      consensus: la,
      rule,
      closedEcosystem: plan.closedEcosystem,
      domains: plan.domains,
      task: c.task,
    })
  }
  out.pct = out.total ? Number(((out.agree / out.total) * 100).toFixed(1)) : 0
  return out
}

/** Load the bundled dispatch corpus plus both labellings, print the proxy metric, optionally write it out. */
function arms(opts) {
  const load = (p) => JSON.parse(readFileSync(p, 'utf8'))
  const files = {
    blind: opts.file || join(CASES_DIR, 'dispatch-blind-neutral.json'),
    l1: opts.l1 || join(CASES_DIR, 'dispatch-label-L1-neutral.json'),
    l2: opts.l2 || join(CASES_DIR, 'dispatch-label-L2-neutral.json'),
  }
  for (const p of Object.values(files)) {
    if (!existsSync(p)) {
      console.error(`读不到语料：${p}`)
      console.error(
        '用法: node tools/route.mjs arms [--file <blind.json>] [--l1 <l1.json>] [--l2 <l2.json>] [--out <report.json>]',
      )
      return 1
    }
  }
  const blind = load(files.blind)
  const result = armAgreement(blind.cases ?? blind, load(files.l1).labels, load(files.l2).labels)
  console.log(
    `R 规则臂（代理指标 = 本工具的 dispatchHint）与双盲共识一致：${result.agree}/${result.total} = ${result.pct.toFixed(1)}%`,
  )
  console.log(`  误判派=${result.falseDispatch}  漏判派=${result.missedDispatch}`)
  console.log('  ⚠ 这是代理指标，不是 MEASUREMENTS.md §4 里作者侧的 R 规则（88.6%）——两者实现不同，不可横向比较。')
  for (const m of result.mismatches) {
    console.log(
      `  ${m.id} 共识=${m.consensus} 规则=${m.rule} closed=${m.closedEcosystem}` +
        ` 域数=${m.domains.length}(${m.domains.join('/')}) | ${m.task.slice(0, 46)}`,
    )
  }
  if (opts.out) {
    writeFileSync(opts.out, JSON.stringify({ metric: 'dispatchHint-as-keyword-arm', ...result }, null, 1))
    console.log(`  逐例结果已写入 ${opts.out}`)
  }
  return 0
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
  t('每个域的路线数不超过 5 条', () => Object.values(DOMAIN_ROUTES).every((ids) => ids.length <= 5))
  t('来源阶梯表里每个域都有渠道路由映射', () =>
    Object.keys(matrix.domains).every((d) => Array.isArray(DOMAIN_ROUTES[d]) && DOMAIN_ROUTES[d].length > 0))
  t('灾害类任务走官方通报表', () => planFor('网传某地发生地震，伤亡人数被夸大').routes.some((r) => r.id === 'gov_notice'))
  t('食品安全类任务走官方通报表', () => planFor('网传这种蔬菜农药残留超标').routes.some((r) => r.id === 'gov_notice'))
  t('科学常识类任务走科学辟谣源', () =>
    planFor('太阳耀斑会让人心情变差吗').routes.some((r) => r.id === 'science_authority'))
  t('教育考试类任务走官方通报表', () => planFor('网传明年高考取消英语科目').routes.some((r) => r.id === 'gov_notice'))
  t('体育类任务走体育官方源', () => planFor('核实某球员的转会传闻').routes.some((r) => r.id === 'sports_official'))
  t('娱乐类任务走娱乐官方声明源', () =>
    planFor('核实某明星去世的网传消息').routes.some((r) => r.id === 'entertainment_official'))
  t('司法类任务走官方通报表', () => planFor('网传某案一审宣判结果').routes.some((r) => r.id === 'gov_notice'))
  t('死亡数字不误归娱乐域', () => !planFor('某地地震遇难人数').domains.includes('entertainment_celebrity'))
  t('科学常识不误归学术域', () => !planFor('太阳耀斑会让人心情变差吗').domains.includes('academic'))
  t('案件判决不误归政策域', () => !planFor('某地一起刑事案件的判决书').domains.includes('cn_policy'))
  t('用药类任务走官方通报（药监/市监）', () =>
    planFor('这个保健品宣称的疗效有临床证据吗').routes.some((r) => r.id === 'gov_notice'))
  t('司法案件的阶梯把裁判文书网放在末位（需登录、公开率已大幅下降）', () => {
    const ladder = matrix.domains.legal_case.ladder
    const last = ladder[ladder.length - 1]
    return /裁判文书网/.test(last) && /注册登录/.test(last)
  })
  t('失败动作表覆盖「数字滚动修正」这类伪矛盾', () => {
    const s = JSON.stringify(routes._failure_actions)
    return s.includes('初报') && s.includes('滚动')
  })
  // 派发臂代理指标：用构造的小样本测纯逻辑，不依赖 cases/ 目录是否存在
  t('代理指标只计入两位标注员的共识样本', () => {
    const tasks = [
      { id: 'X1', task: '核实某说法' },
      { id: 'X2', task: '核实某地地震伤亡' },
    ]
    const a = [
      { id: 'X1', label: false },
      { id: 'X2', label: true },
    ]
    const b = [
      { id: 'X1', label: true },
      { id: 'X2', label: true },
    ]
    const r = armAgreement(tasks, a, b)
    return r.total === 1 && r.agree === 0 && r.missedDispatch === 1
  })
  t('代理指标在无共识样本时不会除以零', () => {
    const r = armAgreement([{ id: 'X1', task: '核实某说法' }], [{ id: 'X1', label: true }], [{ id: 'X1', label: false }])
    return r.total === 0 && r.pct === 0
  })
  t('代理指标与规则同向时判为一致', () => {
    const r = armAgreement([{ id: 'X1', task: '核实某地地震伤亡' }], [{ id: 'X1', label: false }], [{ id: 'X1', label: false }])
    return r.total === 1 && r.agree === 1 && r.mismatches.length === 0
  })

  const failed = checks.filter(([, s]) => s !== 'pass')
  for (const [n, s] of checks) console.log(`  ${s === 'pass' ? '✓' : '✗'} ${n}${s === 'pass' ? '' : ' — ' + s}`)
  console.log(`\n${checks.length - failed.length}/${checks.length} 通过`)
  return failed.length === 0
}

/** 路由语料回归：任务描述 → 期望命中/不命中的域与路线。不出网、不调模型、0 成本。`--out` 落盘逐例结果。 */
function regress(file, out) {
  const path = isAbsolute(file) ? file : resolve(process.cwd(), file)
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const cases = data.cases ?? data
  const fails = []
  const rows = []
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
    const failedOn = checks.filter(([, v]) => !v).map(([n]) => n)
    const ok = checks.length > 0 && failedOn.length === 0
    rows.push({
      id: c.id,
      passed: ok,
      failed: failedOn,
      domains: p.domains,
      closedEcosystem: p.closedEcosystem,
      routes: p.routes.map((r) => r.id),
    })
    if (ok) {
      pass++
      continue
    }
    if (!checks.length) {
      fails.push(`${c.id}: 语料里没有任何 expect* 断言`)
      continue
    }
    fails.push(
      `${c.id}: ${failedOn.join(',')} 不达标` +
        ` → 实际 domains=${p.domains.join('/')} closed=${p.closedEcosystem} routes=${p.routes.map((r) => r.id).join('/')}`,
    )
  }
  console.log(`\nroute 语料 ${pass}/${cases.length} 通过`)
  for (const f of fails) console.log(`  ✗ ${f}`)
  if (out) {
    writeFileSync(out, JSON.stringify({ corpus: path, pass, total: cases.length, cases: rows }, null, 1))
    console.log(`  逐例结果已写入 ${out}`)
  }
  return fails.length === 0
}

function main() {
  const cmd = process.argv[2]
  if (cmd === 'selftest') process.exit(selftest() ? 0 : 1)
  if (cmd === 'regress') {
    const i = process.argv.indexOf('--file')
    if (i < 0 || !process.argv[i + 1]) {
      console.error('用法: node tools/route.mjs regress --file cases/route-cases-neutral.json [--out report.json]')
      process.exit(1)
    }
    const o = process.argv.indexOf('--out')
    process.exit(regress(process.argv[i + 1], o >= 0 ? process.argv[o + 1] : undefined) ? 0 : 1)
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
  if (cmd === 'arms') {
    const arg = (name) => {
      const i = process.argv.indexOf(name)
      return i >= 0 ? process.argv[i + 1] : undefined
    }
    process.exit(arms({ file: arg('--file'), l1: arg('--l1'), l2: arg('--l2'), out: arg('--out') }))
  }
  console.log(
    '用法: node tools/route.mjs <plan --task "…" | selftest | regress --file <cases.json> | arms [--out <report.json>]>',
  )
}

const direct = process.argv[1] && process.argv[1].endsWith('route.mjs')
if (direct) main()
