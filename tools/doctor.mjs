#!/usr/bin/env node
/**
 * doctor — capability probe for THIS machine.
 *
 * The skill and its two tools are written to be environment-neutral: no host,
 * path or endpoint is baked in. This script tells you what the current machine
 * actually provides, what is missing, and what the skill will degrade to.
 *
 *   node tools/doctor.mjs            # offline checks only
 *   node tools/doctor.mjs --net      # also probe the endpoint, the local search service, and the fetch chain
 *   node tools/doctor.mjs --write    # write tools/local.json from detected values (won't overwrite)
 *   node tools/doctor.mjs --json     # machine-readable
 *
 * It never prints a secret — only where a key was found.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)

const report = { ok: [], warn: [], fail: [], info: {}, willUse: {} }

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function localConfig() {
  return readJson(join(HERE, 'local.json')) || {}
}

/* ---------------- runtime ---------------- */

const major = Number(process.versions.node.split('.')[0])
report.info.node = process.versions.node
report.info.platform = `${process.platform} ${process.arch}`
if (major >= 18) report.ok.push(`Node ${process.versions.node}（≥18，内置 fetch / AbortSignal.timeout 可用）`)
else report.fail.push(`Node ${process.versions.node} 过旧：需要 ≥18（内置 fetch）。判据层不可用，流程仍可按 SKILL.md 人工执行`)

/* ---------------- key ---------------- */

const cfg = localConfig()
const keySources = [
  ['环境变量 TYPESAFE_API_KEY', process.env.TYPESAFE_API_KEY ? '(set)' : null],
  ['环境变量 JEV_KEY_FILE', process.env.JEV_KEY_FILE || null],
  ['local.json keyFile', cfg.keyFile || null],
  ...(Array.isArray(cfg.keyFiles) ? cfg.keyFiles.map((f) => ['local.json keyFiles[]', f]) : []),
  ['包内 tools/secrets.json', existsSync(join(HERE, 'secrets.json')) ? join(HERE, 'secrets.json') : null],
]

function keyInFile(file) {
  const j = readJson(isAbsolute(file) ? file : resolve(process.cwd(), file))
  return !!(j && (j.TYPESAFE_API_KEY || j.apiKey || j.key))
}

let keyFoundFrom = null
for (const [label, value] of keySources) {
  if (!value) continue
  if (value === '(set)' || keyInFile(value)) {
    keyFoundFrom = label
    break
  }
}
if (keyFoundFrom) {
  report.ok.push(`密钥来源：${keyFoundFrom}（值不打印）`)
  report.willUse.decisionModel = true
} else {
  report.warn.push('未找到密钥：决策模型判据层不可用 —— 这不是错误，技能会按 SKILL.md 的确定性规则运行（判据三件事人工执行）')
  report.willUse.decisionModel = false
}

/* ---------------- endpoint / model ---------------- */

const endpoint = process.env.JEV_ENDPOINT || cfg.endpoint || 'https://api.typesafe.ai/v1/systemone'
const model = process.env.JEV_MODEL || cfg.model || 'jev-latest'
report.info.endpoint = endpoint
report.info.model = model
report.ok.push(`端点 ${endpoint} · 模型 ${model}（可用 JEV_ENDPOINT / JEV_MODEL / local.json 改）`)

/* ---------------- state dir ---------------- */

function stateDir() {
  if (process.env.JEV_VERDICT_STATE_DIR) return process.env.JEV_VERDICT_STATE_DIR
  if (cfg.stateDir) return cfg.stateDir
  if (process.env.JEV_VERDICT_LOG) return dirname(process.env.JEV_VERDICT_LOG)
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, 'fact-check-jev')
  if (process.env.XDG_STATE_HOME) return join(process.env.XDG_STATE_HOME, 'fact-check-jev')
  return join(homedir(), '.local', 'state', 'fact-check-jev')
}

const dir = stateDir()
let writable = false
try {
  mkdirSync(dir, { recursive: true })
  const probe = join(dir, '.doctor-probe')
  writeFileSync(probe, 'ok')
  rmSync(probe)
  writable = true
} catch {
  writable = false
}
report.info.stateDir = dir
if (writable) report.ok.push(`日志目录可写：${dir}`)
else report.warn.push(`日志目录不可写：${dir} —— 日志会退化为静默跳过（stderr 提示一次），判定不受影响；可用 JEV_VERDICT_LOG 指到可写路径`)

/* ---------------- placeholders in the route tables ---------------- */

const routes = readJson(join(HERE, 'engine-routes.json'))
const placeholders = new Set()
const walk = (v) => {
  if (typeof v === 'string') for (const m of v.matchAll(/\$\{([A-Z0-9_]+)\}/g)) placeholders.add(m[1])
  else if (Array.isArray(v)) v.forEach(walk)
  else if (v && typeof v === 'object') Object.values(v).forEach(walk)
}
if (routes) walk(routes)
const ov = cfg.overrides || {}
const unset = []
const resolved = []
for (const name of placeholders) {
  const v = process.env[`JEV_${name}`] || process.env[name] || ov[name]
  ;(v ? resolved : unset).push(name)
}
report.info.placeholders = { resolved, unset }
if (unset.length) {
  report.warn.push(`渠道表里有 ${unset.length} 个占位符未填：${unset.join(', ')} —— 计划里会原样显示占位符并列入 localPlaceholdersUnset；填法见 local.example.json`)
} else if (placeholders.size) {
  report.ok.push(`渠道表的 ${placeholders.size} 个占位符都已填（env 或 local.json）`)
}

/* ---------------- optional local tools ---------------- */

const OPTIONAL = [
  ['exiftool', '读取图片/视频元数据（相册溯源）', 'EXIFTOOL_CMD'],
  ['whois', '域名注册信息（系统 CLI，未装可用 python-whois 模块）', null],
  ['python3', '跑 python-whois / trafilatura 等脚本', null],
  ['curl', '抓取与探测的兜底手段', null],
  ['zip', '打包分发', null],
]

function whichAll(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const r = spawnSync(probe, [cmd], { encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout.trim()) return []
  // Windows 的 where 用 CRLF 分行；trim() 只削掉整串末尾的 \r\n，
  // 第一行行尾的 \r 会留下来，在终端里回车覆盖行首（表现为"吞掉半行"）。
  return r.stdout.trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

function which(cmd) {
  return whichAll(cmd)[0] || null
}

report.info.optionalTools = {}
for (const [cmd, why, envName] of OPTIONAL) {
  const configured = envName ? (process.env[`JEV_${envName}`] || process.env[envName] || ov[envName]) : null
  if (configured && existsSync(configured)) {
    report.info.optionalTools[cmd] = configured
    report.ok.push(`可选能力 ${cmd}：${configured}${why ? `（${why}）` : ''}`)
    continue
  }
  const found = whichAll(cmd)
  report.info.optionalTools[cmd] = found[0] || null
  if (!found.length) continue
  report.ok.push(`可选能力 ${cmd}：${found[0]}${why ? `（${why}）` : ''}`)
  // 多路径命中时全部列出：Windows 上常见"Store 存根 + 真实安装"并存，存根往往不能用
  if (found.length > 1) {
    report.info.optionalTools[cmd] = found
    report.warn.push(`${cmd} 有多条命中，上面列的是第一条，其余自行确认可用性：${found.slice(1).join(' / ')}`)
  }
}

// python modules that matter
if (which('python3')) {
  for (const [mod, why] of [['whois', '域名注册信息'], ['zstandard', '读压缩会话/日志']]) {
    const r = spawnSync('python3', ['-c', `import ${mod}`], { encoding: 'utf8' })
    if (r.status === 0) report.ok.push(`python 模块 ${mod} 可用（${why}）`)
    else report.warn.push(`python 模块 ${mod} 不可用（${why}）—— 有替代就用替代`)
  }
}

/* ---------------- network (opt-in) ---------------- */

if (has('--net')) {
  /* ---- 正文抓取链自测：which(curl) 有结果 ≠ 抓取可用，所以真跑一次 ----
   * 只自测本脚本能碰到的两条（node fetch / curl）。宿主自身的内置抓取能力
   * 与搜索服务自带的正文抽取字段，探不到，交由使用者在真实核查中确认。 */
  const CHAIN_URL = 'https://example.com'
  const visibleLen = (html) =>
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim().length
  let chainsOk = 0
  try {
    const res = await fetch(CHAIN_URL, { signal: AbortSignal.timeout(12000) })
    const n = visibleLen(await res.text())
    if (res.ok && n >= 80) {
      chainsOk++
      report.ok.push(`抓取链自测 · fetch 直连：可用（${n} 字符可见正文）`)
    } else report.warn.push(`抓取链自测 · fetch 直连：HTTP ${res.status}，可见正文仅 ${n} 字符`)
  } catch (e) {
    report.warn.push(`抓取链自测 · fetch 直连：失败（${e.name}）`)
  }
  const cprobe = spawnSync('curl', ['-sL', '-m', '20', '-A', 'Mozilla/5.0', CHAIN_URL], { encoding: 'utf8' })
  if (cprobe.status === 0 && cprobe.stdout) {
    const n = visibleLen(cprobe.stdout)
    if (n >= 80) {
      chainsOk++
      report.ok.push(`抓取链自测 · curl 直连：可用（${n} 字符可见正文）`)
    } else report.warn.push(`抓取链自测 · curl 直连：拿到响应但可见正文仅 ${n} 字符`)
  } else {
    report.warn.push(`抓取链自测 · curl 直连：失败（exit ${cprobe.status === null ? 'spawn error' : cprobe.status}）`)
  }
  if (!chainsOk) {
    report.fail.push(
      '两条可自测的正文抓取链都失败了。注意本脚本探不到宿主自身的抓取能力——先手动抓一个页面确认，' +
        '三条链全失败才按 SKILL.md 判"无法核实"并如实写进报告的"本次未能核实到的"',
    )
  }

  const probes = []
  if (ov.SEARXNG_URL || process.env.JEV_SEARXNG_URL) {
    const u = ov.SEARXNG_URL || process.env.JEV_SEARXNG_URL
    probes.push(['自托管元搜索', `${u.replace(/\/$/, '')}/healthz`])
  }
  probes.push(['判据端点（GET 预期 405/404，说明路由存在且不接 GET）', endpoint])
  for (const [label, url] of probes) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const kind = res.ok ? 'ok' : res.status === 405 || res.status === 404 ? 'warn' : 'fail'
      const line = `${label}：HTTP ${res.status}（${url}）`
      if (kind === 'ok') report.ok.push(line)
      else if (kind === 'warn') report.warn.push(`${line} —— 端点存在，但不要用 GET 调用它`)
      else report.fail.push(line)
    } catch (e) {
      report.warn.push(`${label}：不可达（${e.name}）—— 检查网络/代理/地址（${url}）`)
    }
  }
} else {
  report.info.networkProbe = '已跳过（加 --net 可探测端点与自托管搜索服务）'
}

/* ---------------- --write ---------------- */

if (has('--write')) {
  const target = join(HERE, 'local.json')
  if (existsSync(target)) {
    report.warn.push(`local.json 已存在，未覆盖：${target}`)
  } else {
    const generated = {
      _about: '由 doctor.mjs 生成；可按需修改。请勿提交或分享。',
      keyFile: keyFoundFrom && keyFoundFrom.startsWith('local.json') ? cfg.keyFile : null,
      stateDir: dir,
      endpoint,
      model,
      overrides: {
        SEARXNG_URL: process.env.JEV_SEARXNG_URL || ov.SEARXNG_URL || null,
        HTTP_PROXY_URL: process.env.JEV_HTTP_PROXY_URL || ov.HTTP_PROXY_URL || null,
        VIDEO_FETCH_CMD: process.env.JEV_VIDEO_FETCH_CMD || ov.VIDEO_FETCH_CMD || null,
        EXIFTOOL_CMD: process.env.JEV_EXIFTOOL_CMD || ov.EXIFTOOL_CMD || report.info.optionalTools.exiftool || null,
      },
    }
    writeFileSync(target, JSON.stringify(generated, null, 2) + '\n', 'utf8')
    report.ok.push(`已生成 ${target} —— 请把 null 的项按你的环境补上`)
  }
}

/* ---------------- print ---------------- */

if (has('--json')) {
  console.log(JSON.stringify(report, null, 1))
} else {
  const line = (s) => console.log(s)
  line('')
  line('# fact-check skill · 环境自检')
  line('')
  line(`运行环境：Node ${report.info.node} · ${report.info.platform}`)
  line(`判据端点：${report.info.endpoint} · 模型：${report.info.model}`)
  line(`日志目录：${report.info.stateDir}${writable ? '（可写）' : '（不可写，会静默跳过）'}`)
  line('')
  const show = (title, arr, mark) => {
    if (!arr.length) return
    line(`${title}`)
    for (const x of arr) line(`  ${mark} ${x}`)
    line('')
  }
  show('可用', report.ok, '✓')
  show('注意', report.warn, '!')
  show('阻塞', report.fail, '✗')
  line('结论：')
  line(`  · 核心核查流程：${report.fail.length ? '受限（见上）' : '可运行'}（不依赖任何本机服务，只需要能上网的搜索能力）`)
  line(`  · 确定性路由 route.mjs：可运行（纯数据表，${unset.length ? `尚有 ${unset.length} 个占位符待填` : '占位符已填妥'}）`)
  line(`  · 决策模型判据 jev-verdict.mjs：${report.willUse.decisionModel ? '可用' : '不可用（缺密钥）——会按 SKILL.md 的确定性规则执行'}`)
  line('')
  if (report.info.networkProbe) line(`提示：${report.info.networkProbe}`)
  if (has('--net')) {
    line(
      '提示：抓取链只自测了 fetch / curl 两条；宿主内置抓取（web_extract / WebFetch 之类）与搜索服务自带的' +
        '正文抽取字段探不到，请各自用一次真实抓取确认——这三条是"任一可用即可"的能力族。',
    )
  }
  line('下一步：cp tools/local.example.json tools/local.json 并按上面提示填写；或 node tools/doctor.mjs --write 生成草稿。')
  line('')
}

process.exit(0)
