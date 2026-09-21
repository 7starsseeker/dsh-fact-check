# 投稿到 awesome-dsh-plugin（本目录不属于插件包本身）

`7starsseeker__dsh-fact-check.yml` 是要提交到
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的**条目文件**，
目标路径是市场仓库的 `data/plugins/7starsseeker__dsh-fact-check.yml`。

它放在这里是为了**不丢**（内容与仓库里那份逐字一致），但它**不是**插件的一部分：
`package.json` 的 `files` 白名单里没有 `submission/`，所以发布出去的包不带它；投稿时把它复制到市场仓库即可。

## 时间门槛（先看这条）

市场的 CI 会检查**目标仓库创建满 1 天**（`dsh.bundle` 与条目数另查）。不到 1 天会被自动拒，
且与插件质量无关，只是过滤「PR 前几分钟才建好的仓库」。所以最早可提交时间 = 仓库创建时间 + 24 小时
（实际建议再留一点余量），创建时间用下面的命令自己算：

```sh
git log --reverse --format=%cI | head -1     # 首次提交时间
```

## 提交流程（一个 PR，只加一个文件）

1. Fork 或直接克隆市场仓库，开一个分支：

   ```sh
   git clone https://github.com/awesome-dsh-plugin/awesome-dsh-plugin.git
   cd awesome-dsh-plugin
   git checkout -b add-dsh-fact-check
   ```

2. 把本目录的 `7starsseeker__dsh-fact-check.yml` 复制成
   `data/plugins/7starsseeker__dsh-fact-check.yml`。**不要手工编辑两个 README** —— 它们由
   `data/plugins/*.yml` 生成；PR 只加这一个文件，因此不会和别人的 PR 冲突。

3. 提交并推送。若你的网络需要代理，给本次推送带上 `http_proxy` / `https_proxy` 环境变量即可：

   ```sh
   git add data/plugins/7starsseeker__dsh-fact-check.yml
   git commit -m "Add 7starsseeker/dsh-fact-check"
   git push origin add-dsh-fact-check
   ```

4. 开 PR（一个 PR 最多 3 条，本 PR 只 1 条）。

## 这条条目为什么这样写

- **`category: skill`** —— 它是一条技能（`SKILL.md`），但按市场要求同时是可安装插件
  （`package.json` 里声明了 `dsh.bundle`，包根有 `cordis.patch.yml`）。
- **描述里点明 TypeSafe Jev（System One）决策模型**，因为那是本技能的一项实打实的能力；
  同时写明它是**可选**的、未配密钥时回退确定性规则、且模型判断**只能降档** —— 这三句在
  `SKILL.md`「可选增强」节与其后的「三条硬约束」里逐条对得上，描述因此可被维护者对着代码核。
- **不写数字**（不写准确率、不写来源数），因为描述里的每个数字都会被拿去核对；
  实测数字放在仓库的 `MEASUREMENTS.md` 里由维护者自行查证。
- **不含营销词**，只写功能；这是市场明确要求的一条，也是被打回最常见的原因。

## 上架后

- README 可以挂市场徽章（`https://awesome-dsh-plugin.com/badge.svg`，链到站点）。
- 之后更新条目只需改 `data/plugins/` 下**自己那一条**再提 PR，仍然不要手工改 README。
- 条目不是永久的：仓库消失、归档或长期停更会被定期扫描并移除，所以后续维护不能断。
