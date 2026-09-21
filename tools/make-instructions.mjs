#!/usr/bin/env node
/**
 * make-instructions — generate INSTRUCTIONS.md (same body, no frontmatter) from
 * SKILL.md, for agent environments that take plain instructions (AGENTS.md and
 * friends) instead of a skill loader.
 *
 * Usage: node tools/make-instructions.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const skill = readFileSync(join(ROOT, 'SKILL.md'), 'utf8')

// strip a leading YAML frontmatter block if present
const body = skill.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart()
const name = (skill.match(/^name:\s*(.+)$/m) || [, 'fact-check'])[1].trim()
const description = (skill.match(/^description:\s*(.+)$/m) || [, ''])[1].trim()

const out = `<!-- 由 tools/make-instructions.mjs 从 SKILL.md 生成，请勿手改：改 SKILL.md 后重跑本脚本。 -->
# ${name}

${description ? `> ${description}\n\n` : ''}${body}
`

writeFileSync(join(ROOT, 'INSTRUCTIONS.md'), out, 'utf8')
console.log(`已生成 INSTRUCTIONS.md（${out.split('\n').length} 行，来源 SKILL.md）`)
