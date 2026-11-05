#!/usr/bin/env node
/**
 * config — 本机配置（local.json / secrets.json）的**包外**解析。
 *
 * 为什么需要这一层：`dsh plugin update` / `npm i` 换掉的是整个包目录。
 * 配置如果写在 `tools/local.json`，每次更新都会被清掉；这个文件只决定
 * “去哪儿找配置”，不改变配置本身的格式。
 *
 * 解析顺序（先命中先用）：
 *   1. 环境变量 `JEV_LOCAL_CONFIG`（显式指定文件，便于测试与多机切换）
 *   2. 平台配置目录：
 *        Windows  %LOCALAPPDATA%\dsh-fact-check\local.json
 *        其它     $XDG_CONFIG_HOME/dsh-fact-check/local.json 或 ~/.config/dsh-fact-check/local.json
 *   3. 旧的包内路径 `tools/local.json`（向后兼容，不推荐继续用）
 *
 * `secrets.json` 用同一套目录，只是文件名不同。
 * 零依赖；解析失败一律当作“没有配置”，绝不阻断核查流程。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_DIR = 'dsh-fact-check'

/** 平台配置目录——包目录之外，更新不会动它。 */
export function configDir() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, APP_DIR)
  }
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, APP_DIR)
  return join(homedir(), '.config', APP_DIR)
}

/** 用户配置文件的**目标**路径（可能还不存在）。 */
export function userConfigPath(name = 'local.json') {
  return join(configDir(), name)
}

/**
 * 按优先级列出候选路径。`pkgDir` 是 tools/ 目录（旧的包内位置）。
 * 存在的排前面，但顺序严格按优先级——不存在的也在列表里，供 --write 判断。
 */
export function configCandidates(pkgDir, name = 'local.json') {
  return [process.env.JEV_LOCAL_CONFIG, userConfigPath(name), join(pkgDir, name)].filter(Boolean)
}

/** 当前实际生效的配置文件；一个都不存在时返回 null。 */
export function activeConfigPath(pkgDir, name = 'local.json') {
  return configCandidates(pkgDir, name).find((f) => existsSync(f)) || null
}

/** 读 JSON；任何异常都返回 null（坏配置不能把核查流程带崩）。 */
export function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 读本机配置。
 *   pkgDir  tools/ 目录（`import.meta.url` 所在目录）
 *   name    文件名，默认 local.json
 */
export function readLocalConfig(pkgDir, name = 'local.json') {
  const file = activeConfigPath(pkgDir, name)
  return file ? readJsonSafe(file) || {} : {}
}

/**
 * 写配置草稿：默认写到包外用户目录，已存在则不覆盖。
 * 返回 { path, written }。
 */
export function writeLocalConfig(pkgDir, data, name = 'local.json') {
  const existing = activeConfigPath(pkgDir, name)
  if (existing) return { path: existing, written: false }
  const target = userConfigPath(name)
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(target, JSON.stringify(data, null, 2) + '\n', 'utf8')
  return { path: target, written: true }
}
