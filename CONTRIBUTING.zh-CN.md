# 参与贡献

谢谢来看这份东西。欢迎提 issue 与 PR。

**English → [CONTRIBUTING.md](./CONTRIBUTING.md)**

## 开始之前

本包**没有构建步骤、没有运行时依赖**：`git clone` 下来用 Node ≥ 18 直接跑工具即可。零依赖是刻意的，
所以一个引入包依赖的 PR 需要很强的理由。

## 两条承重规则

1. **`SKILL.md` 是唯一真相源。**
   - `INSTRUCTIONS.md` 由它**生成**——永远不要手改那个文件，改 `SKILL.md` 后跑
     `node tools/make-instructions.mjs`。
   - `lib/index.js` 每次加载都现读 `SKILL.md`，所以插件里的技能描述不可能与文件漂移。
     `node tools/smoke-plugin.mjs` 就是在断言这条，请保持它全过。
2. **改判据层或路由表 = 一次重新校准事件。**
   - `tools/jev-verdict.mjs` 里的问句是冻结字面量；任何对 instruction、判据或阈值的改动，都必须
     重跑 `cases/` 下对应的语料，并把新数字写回 `MEASUREMENTS.md`。
   - `tools/route.mjs` 的触发词表与域路由表同理。

## 提 PR 前跑这几条

```sh
node tools/smoke-plugin.mjs                          # 插件挂载 + 单一真相源
node tools/jev-verdict.mjs selftest
node tools/route.mjs selftest
node tools/route.mjs regress --file cases/route-cases-neutral.json
node tools/make-instructions.mjs                     # 只有改了 SKILL.md 才需要
```

全部离线、不需要任何 API 密钥。

## 主机相关的值永不入库

端点、密钥、主机路径，以及「这台机器上哪个渠道真的能用」，一律放 `tools/local.json`（已 gitignore），
模板是 `tools/local.example.json`。`tools/*.mjs` 里有断言：一旦硬编码主机路径就失败；
`SKILL.md` 里也不得出现主机名、内网地址、路径或密钥。

## 版本纪律

**只有**改动面向使用者的行为（流程、报告模板、判据层、触发词）时，才升 `SKILL.md` frontmatter 的
`version` 并在 `CHANGELOG.md` 记一条。只改措辞或文档不算。`CHANGELOG.md` 记的是版本间**净变化**，
不是开发日志。

改了 `SKILL.md` 就要同时重生成 `INSTRUCTIONS.md`，别让两份分叉。

## 回归语料

`cases/*.json` 是去痕版：主机路径、私有工具名与实例标识都换成了 `<占位符>`，而公开的技术栈名与观测
数据本身**保留**——因为样本的具体出处正是判据被校准的依据之一。要贡献样本，按同样方式去痕，并先读
[`cases/README.md`](./cases/README.md)。
