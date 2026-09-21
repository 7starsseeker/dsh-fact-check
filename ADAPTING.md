# 换环境适配清单（ADAPTING）

本技能**不绑定任何主机、产品、路径或密钥**：正文只讲能力与规则，两个工具是零依赖的 Node 脚本，所有环境相关的值都在 `tools/local.json`。本文说明落到你的环境需要做哪几件事。

> 逐步执行请用 **`FOR-AI.md`**（它是操作手册）；本文是配套的背景与决策依据（为什么这样改、没有决策模型怎么办、判据校准纪律）。

---

## 1. 五分钟接上

```bash
# 1) 自检：这一步不联网，先看这台机器有什么、缺什么、会降级成什么样
node tools/doctor.mjs
node tools/doctor.mjs --net                     # 建议也跑一次：会真跑一遍抓取链自测

# 2) 判据层（可选）：给决策模型配一把钥匙
export TYPESAFE_API_KEY=…                       # 或 doctor --write 生成 local.json 后填 keyFile

# 3) 本机值（可选）：自托管搜索、代理、可选工具路径；还有能力绑定 / 输出约定 / 运行时基线
node tools/doctor.mjs --write                   # 生成 local.json 草稿，再把 null 的项补上
#    或： cp tools/local.example.json tools/local.json

# 4) 验收（离线，不花钱）
node tools/jev-verdict.mjs selftest                              # 期望 25/25
node tools/route.mjs selftest                                    # 期望 19/19
node tools/route.mjs regress --file cases/route-cases-neutral.json   # 期望 14/14
```

要求：**Node 18+**（内置 `fetch` 与 `AbortSignal.timeout`）。零 npm 依赖。

**没有决策模型也能用**：`SKILL.md` 的流程与铁律不依赖它，只是把三类判断从模型换成人按规则做（见 §3）。

---

## 2. 需要你决定的四件事

| # | 决定 | 在哪 | 说明 |
|---|---|---|---|
| 1 | **搜索能力怎么来** | 你的 agent / `SKILL.md` 的能力映射表 | 至少要有"关键词检索 + 打开网页正文"。有搜索 API（Brave / Tavily / SerpAPI / 自托管元搜索…）就按名字填进映射表；没有就退化为串行搜索 |
| 2 | **要不要决策模型判据层** | `local.json` 的 `keyFile` 或 `TYPESAFE_API_KEY` | 默认协议是 TypeSafe System One（`POST /v1/systemone`，`{model, state, questions}`）；也可用 `JEV_ENDPOINT`/`JEV_MODEL` 指向兼容端点。不需要就跳过，技能照常工作 |
| 3 | **本机渠道值与本机约定** | `local.json` 的 `overrides` / `capabilities` / `outputConvention` / `runtimeNotes` | `overrides`：`${SEARXNG_URL}` `${HTTP_PROXY_URL}` `${VIDEO_FETCH_CMD}` `${EXIFTOOL_CMD}` —— 数据表里全是占位符，未填不影响运行，只影响计划里的提示。另三个字段可选：`capabilities` 把能力名绑到本机工具名，`outputConvention` 声明本机报告段序/纪律，`runtimeNotes` 记运行时基线（哪个引擎被拦、哪些站点必须走代理）。**填了这些就不必改正文** |
| 4 | **怎么装载** | 你的框架 | 吃 skill 的（Claude Code 等）：直接给本目录（`SKILL.md` 带 frontmatter）。吃 `AGENTS.md` 之类的：用 `node tools/make-instructions.mjs` 生成 `INSTRUCTIONS.md`（同正文、无 frontmatter）接进系统提示 |

技能**唯一的外部依赖**是：能上网 + 一个能返回网页正文的抓取能力。其余都是可选增强。

---

## 3. 没有决策模型时，三件事怎么人工做

| 判断 | 有模型时 | 没有模型时 |
|---|---|---|
| 这批证据是否支持该论断 | `ask --question support` → 概率 | 逐条对齐"主体 / 时间 / 数字 / 方向"四要素；任何一项对不上就归入"证据不足" |
| 该来源是否一手 | `ask --question primary_source` | 按 `SKILL.md` 的来源分级表判定 |
| 这个页面是否可用正文 | `ask --question usable_page` | 看是否有成段正文、是否与主题一致；像登录墙/验证码页就不计入证据 |

"是否还需要继续搜索"这件事**本来就该由规则决定**（来源数 <2、出现矛盾、关键要素无来源），不要交给模型——单测它只有 62.5%（见 `MEASUREMENTS.md`）。

---

## 4. 判据与校准纪律

- `tools/jev-verdict.mjs` 里的 `QUESTIONS` 是**冻结字面量**：改 instruction / criteria / 阈值 = **重新校准事件**。
- 每次改判据都要重跑 `cases/` 下的回归（support / injection / provenance / usable_page 四套），把新数字写进 `MEASUREMENTS.md`。
- 阈值同样要留依据：当前 `TIERS` 的 0.8 / 0.5 是对 support 语料扫出来的操作曲线（见 `MEASUREMENTS.md` §1.2），改阈值要照同样办法重扫并记录。
- 换环境或换模型版本后，**先复跑再信任**：官方明确说过非英语（含 CJK）"handled but not equally well"，且限流与模型能力会变。
- 要用英文判据：自行翻译**并重新校准**（官方称英文准确率最高，值得做），不要机翻后照用。

---

## 5. 分发与维护注意

- **不要在 `SKILL.md` 或数据表里写主机事实**（内网地址、绝对路径、密钥、账号）。本机值一律进 `local.json`；"在某环境测出来的数字"一律进 `MEASUREMENTS.md`，并标明环境与日期。
- `tools/jev-verdict.mjs` 与 `tools/route.mjs` 各有一条**离线断言**："代码里不硬编码本机路径"（匹配的是"挂载点前缀 + 会话宿主配置目录名"这类模式，不是某个具体路径）。这条断言是守卫，别删。
- `.gitignore` 已挡住 `local.json`、`secrets.json`、日志与 `out/`。
- **版本对齐**：`SKILL.md` frontmatter 的 `version` 与 `CHANGELOG.md` 的条目一一对应；改动面向使用者的行为（流程、报告模板、判据、触发词）就升版本并记一条净变化，`MEASUREMENTS.md` 的数字按版本对齐——否则无法判断某组数字出自哪一版判据。
- 两个工具都**fail-open**：找不到密钥、超时、HTTP 出错，都返回 `unknown` 并让你回退到人工规则——核查流程不会因为判据层坏掉而中断。

---

## 6. 出处与免责

- 本包是一次真实实践的产物，最初的宿主环境是一个自研 agent harness。**正文与数据表是干净的**：工具名→能力名、路径→环境变量/`local.json`、快照机制→"改前备份"、宿主安全阀门→移除，`selftest` 里有离线断言守着这条。
- **`cases/` 语料是分两遍去痕的**：第一遍剥离主机路径与 SDK 名，第二遍剥离私有工具名与宿主产品名（各文件头部的 `_replaced_tokens` 记着替换数）。**刻意保留的是公开通用技术栈名**（SearXNG / Docker / WSL / curl / python / TypeSafe Jev）与"现场实测"的观测数据——因为证据的具体出处本身就是判据的实据，抹掉会让语料失去校准意义（数字对照见 `cases/README.md`）。要把语料用到完全中立的场景，按 `cases/README.md` 末节用你自己的来源重建。
- 本文与 `SKILL.md` 里的任何**数字**都只是"在某台机器、某个模型版本、某一天测出来的结果"，属于证据而非承诺，出处与复跑方式见 `MEASUREMENTS.md`。
- 决策模型：[TypeSafe Jev](https://typesafe.ai/)（System One 决策模型）。它是**可替换的**：换成任何"输入状态 + 结构化问题、返回类型化答案与概率"的模型都成立，只需改 `local.json` 的端点和判据文本。
