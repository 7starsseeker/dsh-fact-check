/**
 * fact-check — DSH 技能提供者：把本包自带的 SKILL.md 挂到 `ctx.skills`。
 *
 * 为什么需要这一层：DSH 插件市场只收「能用 `dsh plugin add` 装上的包」——包必须在
 * package.json 里声明 `dsh.bundle`，并在包根放一份 cordis.patch.yml。而技能正文只是
 * 一份 SKILL.md，它要进入会话的技能目录就需要一个 provider，本文件就是那层很薄的接线。
 *
 * 两条刻意的性质：
 *   · **不复制技能正文** —— 候选与正文都在调用时从 SKILL.md 现读。改 SKILL.md 不必动本文件，
 *     也不会出现「描述与正文两份、各自漂移」。
 *   · **零依赖** —— 只 import `node:` 内置模块（与 tools/ 下两个脚本同一原则）。判定逻辑、
 *     路由表、回归语料全留在 tools/ 与 cases/，与宿主无关。
 *
 * @module dsh-fact-check
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** 包根（lib/ 的上一级）。SKILL.md、tools/、cases/ 都在那里。 */
const ROOT_URL = new URL('..', import.meta.url)
const SKILL_URL = new URL('SKILL.md', ROOT_URL)

/** provider 名，在 `ctx.skills` 注册表里唯一。 */
const PROVIDER_NAME = 'fact-check'

/**
 * bundled 档的秩。DSH 里 `BUNDLED_SKILL_RANK = 600`（本地 provider 的其余档位：
 * project 100/200、custom 300、user-dsh 400、user-agents 500）。
 *
 * 这里写常量而不是 import 那个导出，是为了保持零依赖。秩只在**同名技能**上起作用，
 * 而低秩胜出：装了本插件的机器若同时在 `~/.dsh/skills/fact-check` 放了一份本地特化版
 * （user-dsh = 400），本地那份仍然优先——这是刻意的，插件不该覆盖用户自己的版本。
 */
const RANK = 600

/**
 * 读 SKILL.md 的 YAML frontmatter。只认本技能真正用到的四个键，因此不需要 YAML 依赖：
 * `name` / `description` / `disable-model-invocation` / `user-invocable`。
 *
 * @param {string} text - SKILL.md 全文。
 * @returns {{fm: Record<string, string>, body: string}} frontmatter 键值表与去掉它的正文。
 */
export function parseFrontmatter(text) {
  // 去掉可选的 BOM 并把 CRLF 归一为 LF：编辑器编码与 Windows 检出不该改变解析结果。
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!src.startsWith('---')) return { fm: {}, body: text }
  const end = src.indexOf('\n---', 3)
  if (end === -1) return { fm: {}, body: text }
  const fm = {}
  for (const line of src.slice(3, end).split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return { fm, body: src.slice(end + 4).trimStart() }
}

/** 技能名必须匹配 DSH 的 kebab-case 语法，否则注册表会拒收这个候选。 */
export function isSkillName(name) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(name))
}

/** frontmatter 的调用开关：省略即两处都开。 */
function invocationOf(fm) {
  return {
    modelInvocable: String(fm['disable-model-invocation'] ?? '').toLowerCase() !== 'true',
    userInvocable: String(fm['user-invocable'] ?? '').toLowerCase() !== 'false',
  }
}

/**
 * 读候选：每次调用都重读 SKILL.md，所以正文改完立刻生效，不需要版本号或缓存失效。
 *
 * 读失败**不吞** —— 让 `list()` 拒绝比返回空数组诚实：注册表会把拒绝记成一次不完整的
 * 观测并保留上一次的好目录，而返回空数组等于告诉模型「这个技能被删了」。
 *
 * @returns {Promise<object[]>} 本包只提供一条技能，因此是长度为 1 的数组。
 */
export async function list() {
  const { fm } = parseFrontmatter(await readFile(SKILL_URL, 'utf8'))
  if (!isSkillName(fm.name)) {
    throw new Error(`SKILL.md 的 frontmatter name 不是 kebab-case：${JSON.stringify(fm.name)}`)
  }
  if (!fm.description) throw new Error('SKILL.md 的 frontmatter 缺少 description')
  return [
    {
      name: fm.name,
      description: fm.description,
      invocation: invocationOf(fm),
      provider: PROVIDER_NAME,
      source: 'bundled',
      // 资源基准指向包根：正文里写的 `tools/doctor.mjs`、`tools/route.mjs` 因此可解析，
      // 换成 skills/ 子目录会让这些相对路径失效。
      resourceBase: { kind: 'directory', path: fileURLToPath(ROOT_URL) },
      rank: RANK,
      locator: SKILL_URL,
    },
  ]
}

/**
 * 读正文：frontmatter 已剥离，返回的就是指令正文。
 *
 * @param {object} candidate - `list()` 给出的候选。
 * @returns {Promise<object>} 完整技能定义。
 */
export async function get(candidate) {
  const { fm, body } = parseFrontmatter(await readFile(SKILL_URL, 'utf8'))
  // 正文里的 name 与候选不一致说明两次读之间文件被换过 —— 抛出去让注册表重新发现，
  // 而不是交出一份名不副实的定义。
  if (fm.name !== candidate.name) {
    throw new Error(`SKILL.md 的 name 已变为 ${JSON.stringify(fm.name)}，与候选 ${JSON.stringify(candidate.name)} 不符`)
  }
  return {
    name: candidate.name,
    description: fm.description || candidate.description,
    invocation: candidate.invocation,
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase: candidate.resourceBase,
    content: body,
  }
}

/** 本 provider 的实例（无内部状态：不缓存正文，全部现读）。 */
export const provider = { name: PROVIDER_NAME, list, get }

/** Cordis 插件名（与 cordis.patch.yml 的 `id` 一致）。 */
export const name = PROVIDER_NAME
/** 本插件依赖的服务：技能注册表。 */
export const inject = ['skills']

/**
 * 挂载：把本 provider 注册到 `ctx.skills`。注册是同步的，发现与读正文都在 awaits 里。
 *
 * @param {{skills: {registerProvider: Function}}} ctx - Cordis 上下文。
 * @returns {void}
 */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
}
