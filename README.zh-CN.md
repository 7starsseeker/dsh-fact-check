# dsh-fact-check

[![version](https://img.shields.io/github/v/tag/7starsseeker/dsh-fact-check?label=version)](https://github.com/7starsseeker/dsh-fact-check/tags)
[![selftest](https://img.shields.io/github/actions/workflow/status/7starsseeker/dsh-fact-check/selftest.yml?label=selftest)](https://github.com/7starsseeker/dsh-fact-check/actions/workflows/selftest.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)
[![DSH plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4B6BFB.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)
[![last commit](https://img.shields.io/github/last-commit/7starsseeker/dsh-fact-check)](https://github.com/7starsseeker/dsh-fact-check/commits/main)
[![stars](https://img.shields.io/github/stars/7starsseeker/dsh-fact-check?style=flat)](https://github.com/7starsseeker/dsh-fact-check/stargazers)
[![issues](https://img.shields.io/github/issues/7starsseeker/dsh-fact-check)](https://github.com/7starsseeker/dsh-fact-check/issues)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

> DeepSeek Harness 用的事实核查技能：不轻信模型自己的记忆，一律去公开互联网核实——多源交叉、
> 国内外信息生态并行、对抗性反查，最后交出一份结论先行、每条论断都可溯源的核查报告。

**English → [README.md](./README.md)**

---

## 目录

- [它是什么](#它是什么)
- [运行前提](#运行前提)
- [安装](#安装)
- [工作方式](#工作方式)
- [可选的 Jev 判据层](#可选的-jev-判据层)
- [自己验一遍](#自己验一遍)
- [目录结构](#目录结构)
- [配置](#配置)
- [参与贡献](#参与贡献)
- [许可](#许可)

## 它是什么

一个事实核查技能。给它一条传闻、一个数字、一则新闻或一句「这是不是真的」，它交回一份核查报告。
它与「直接问模型」的区别在于五条**不允许跳过**的铁律：

1. **知识库禁用**：即便模型「认为」自己知道答案，也必须先用搜索工具从互联网核实。搜索不可用时
   如实报告「无法核实」，绝不用记忆顶替。
2. **多源交叉**：每个事实点至少要有 2~3 个**相互独立**的来源。多家媒体转载同一篇原始报道**只算一个**
   来源，不是三个。
3. **国内外并行**：同一核查对象同时从国内、国外两套信息生态取证并分别呈现——很多信息只在某一侧出现。
4. **对抗性核查**：结论初步成型后，主动用反向／质疑关键词再搜一轮。找不到反证才给高置信度。
5. **全部可溯源**：每一个论断、数字、日期、引述都带完整 URL + 出处名称 + 具体引用位置。

输出是**结论先行**的报告，来源进编号附录；部分核实的内容被**物理分档**——「未证实」「无法裁定」
不会和「已证实」排在同一段里，所以一条没查清的东西没法被当成已定论引用。

## 运行前提

| | |
|---|---|
| **必需** | 一个能搜索公开互联网**并且能抓取页面正文**的 agent（抓取链任意一条可用即可）。没有搜索能力时，技能会报「无法核实」而不是猜。 |
| **推荐** | 批量／多引擎搜索、存档服务（Wayback）、用于并行取证的子代理机制。 |
| **可选** | [Node.js](https://nodejs.org) **≥ 18**（两个自带工具需要）；TypeSafe Jev 密钥（判据层需要）。 |

技能正文不绑定任何产品、主机或工具链：它只写**能力名**，由 [`ADAPTING.md`](./ADAPTING.md) 把能力
落到你的环境里。

## 安装

### 作为 DSH 插件

```sh
dsh plugin add github:7starsseeker/dsh-fact-check
```

重启 DSH 后 `fact-check` 技能即出现在会话技能目录里。插件本体是一层很薄的接线——`lib/index.js`
把包自带的 `SKILL.md` 注册到 `ctx.skills`，每次加载都现读，所以改技能不需要改代码。它是
**零运行时依赖**（只用 `node:` 内置模块）。因为本 provider 注册在*随包*档位，你自己放在
`~/.dsh/skills/fact-check` 的那一份（用户档位）在同名冲突时仍然优先——装这个插件不会覆盖你的本地修改。

<details>
<summary>改用本地目录安装</summary>

```sh
git clone https://github.com/7starsseeker/dsh-fact-check.git
dsh plugin add ./dsh-fact-check
```

</details>

### 把整个文件夹交给任何 AI 工具

把本目录（或它的 zip）交给你的 AI 工具，说一句「照 `FOR-AI.md` 做」即可——它会自己离线探测环境、
自己适配，不需要人做配置。吃 skill 的框架直接给 `SKILL.md`（带 frontmatter）；吃纯指令的框架用生成的
[`INSTRUCTIONS.md`](./INSTRUCTIONS.md)。

## 工作方式

```
拆解核查项  →  并行搜索（国内 + 国外 + 垂直域 + 质疑词）
      →  抓取一手页面  →  交叉比对与来源分级  →  对抗性反查
      →  结论先行的报告：已证实 / 未证实 / 无法裁定 + 编号来源
```

另外附带两个可选的离线工具：

| 工具 | 做什么 |
|---|---|
| `node tools/route.mjs plan --task "…"` | 确定性规划：这类核查该走哪条来源阶梯、哪些渠道，以及失败动作表。纯数据表，无模型、0 token。 |
| `node tools/jev-verdict.mjs` | 下面说的判据客户端。 |

## 可选的 Jev 判据层

有三类判断天生是**事实判断**而非文风问题，本技能可以把它们交给 **TypeSafe Jev（System One）决策模型**，
而不是留给「裸推理」：

| 判断 | 问题类型 | 什么时候问 |
|---|---|---|
| 这批证据是否支持该论断 | 是/否 + 概率 | 交叉比对来源时 |
| 该来源是否一手 | 是/否 + 概率 | 给候选来源分级时 |
| 这个页面是否可用正文 | 是/否 + 概率 | 抓取之后——登录墙、验证码、JS 空壳不得计入证据 |

两件事是刻意的：

- **它是可选的。** 没配密钥时，这三件事由 `SKILL.md` 里写死的确定性规则执行，其余流程完全不变。
  密钥可以来自 `tools/local.json`、环境变量 `TYPESAFE_API_KEY`，或 `tools/jev-verdict.mjs --key-file`。
- **模型的判断只能降档，不能升档。** 结论档位由确定性规则「独立来源数 → 档位」裁定；模型说「支持」
  不会让任何东西升级。只有「证据不足」或「与证据矛盾」才触发动作。

每条判据的实测可靠性、喂给模型前的提示注入防御、以及复跑命令都在
[`MEASUREMENTS.md`](./MEASUREMENTS.md)——包括一条**刻意不问**的判据，它的单题准确率实测只有 62.5%。

## 自己验一遍

下面每条都离线、不需要密钥、几秒跑完：

```sh
node tools/smoke-plugin.mjs                          # 插件挂载是否正确、是否真的在提供 SKILL.md
node tools/route.mjs selftest                        # 确定性路由表
node tools/route.mjs regress --file cases/route-cases-neutral.json
node tools/jev-verdict.mjs selftest                  # 判据层回归断言
node tools/doctor.mjs                                # 这台机器能做什么、缺什么
```

`node tools/doctor.mjs --net` 会额外自测抓取链与判据端点，并报告缺哪些能力、缺了会降级成什么样。
本检出上的当前状态：**27/27**、**25/25**、**19/19**、**14/14** 断言全过。

CI 在 Linux 与 Windows 上、Node 18 与 22 下跑的就是上面这几条，另外多一条检查：生成的
`INSTRUCTIONS.md` 是否仍然与 `SKILL.md` 一致。

## 目录结构

| 路径 | 是什么 |
|---|---|
| [`SKILL.md`](./SKILL.md) | 技能本体——流程与规则（唯一真相源） |
| [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) | 由 `SKILL.md` 生成，给吃纯指令的宿主 |
| [`FOR-AI.md`](./FOR-AI.md) | 拿到本包的那个 AI 的任务书 |
| [`ADAPTING.md`](./ADAPTING.md) | 换环境要改什么 |
| [`MEASUREMENTS.md`](./MEASUREMENTS.md) | 实测数字与复跑方法 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 版本间净变化 |
| [`lib/index.js`](./lib/index.js) | DSH 插件入口：把 `SKILL.md` 挂到 `ctx.skills` |
| [`cordis.patch.yml`](./cordis.patch.yml) | bundle patch，让本包能被 `dsh plugin add` 安装 |
| [`tools/`](./tools) | 两个零依赖 Node 脚本、本机配置模板与数据表 |
| [`cases/`](./cases) | 去痕后的回归语料 |
| `submission/` | 投稿到插件市场的条目文件（不属于插件包本身） |

## 配置

主机相关的值——端点、密钥、你那台机器上哪些渠道真的能用——一律放 `tools/local.json`，它被 gitignore，
只分发 [`tools/local.example.json`](./tools/local.example.json)。代码与数据表里**不写死**任何主机路径、
端点或密钥，`tools/*.mjs` 里有断言专门守这条。

## 参与贡献

欢迎提 issue 与 PR——见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。两条承重规则：技能正文是唯一真相源
（永远不要手改生成物，例如 `INSTRUCTIONS.md`）；任何对判据层或路由表的改动都必须重跑回归，并把新数字
写回 `MEASUREMENTS.md`。

## 许可

[MIT](./LICENSE)
