# npm 自动发布流程（RELEASING）

**目标终态**：推一个版本 tag，CI 自己把包发到 npm，**全程没有任何长期 token**。

本文是**可移植的操作手册** —— 把这套流程套到任何 npm 包上都能照着走，不限于本包。文中所有 npm 行为都是实测过的，实测结论旁边会写明是怎么测的。

---

## 0. 先记住顺序上那个绕不过去的约束

**第一次发布不能用 OIDC，也不能用暂存发布。** 原因是两条硬约束：

- 暂存发布的官方文档明写 `you cannot stage a brand-new package` —— 包必须已存在于 registry；
- trusted publisher 的配置入口在**包的设置页**，而包还不存在时就没有那一页。

所以顺序是：**首发必须是一次"直接发布"**（交互式 2FA，或一个带 bypass-2FA 的 token）→ 包存在后 → OIDC 这条路才打开。

同时要知道 **npm 正在关闭"长期 token 直发"**：带 bypass-2FA 的 granular token 约 2027-01 失去直接发布能力，只剩"读私有包 + 暂存发布"。所以**不要把"长期 token + 脚本"当作长期方案**，它只适合过渡期；也不要为它做基建（比如专门建一个 token 存进密钥管理）。

---

## 1. 第 0 步：先侦察，别先动文件

```bash
# 名字是否可用（404 = 没被占）
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/<name>

# private:true 会让 npm publish 直接失败
node -p "require('./package.json').private"

# OIDC 要求 npm>=11.5.1 且 Node>=22.14.0（这是 CI 里的要求，不是包 engines 的要求）
node -v; npm -v

# 最要紧的一次侦察：包会装进去什么
npm pack --dry-run --json
```

**逐个读 `npm pack` 列出的文件。** 只有当 `files` 是白名单、且里面没有本机状态（本机配置、密钥、日志、交接说明、审计记录）时才继续。

### 一条非显然的规则：`.gitignore` 挡不住 npm

`files` 里**直接列整个目录**（例如 `"tools"`）时，那个目录下**被 `.gitignore` 忽略的文件仍会被打进包**。实测（2026-09-22）：

| 配置 | `tools/local.json` 是否进包 |
|---|---|
| `files: ["tools"]`，`.gitignore` 含 `tools/local.json` | **进包** |
| `files: ["tools"]`，`.npmignore` 含 `tools/local.json` | **进包**（`files` 优先于 ignore 文件） |
| `files: ["tools", "!tools/local.json"]` | 不进包 ✓ |

**修法只有一种可靠**：在 `files` 里用 `!` 取反排除，或者别列整个目录、改成逐个列文件。

> 本包的实例：`files` 里是整个 `"tools"`，而 `tools/local.json` 按 `ADAPTING.md` 的说法正是**本机配置**（含 `keyFile` 路径、SearXNG 地址、代理地址、以及描述这台机器可用渠道的 `runtimeNotes`）。该文件当前不存在所以没泄露，但只要它存在一次，下一次发布就会带上它。
> 可移植的教训是：**一个被 git 忽略的本机文件，不等于一个不会进 npm 包的文件** —— 这两套忽略规则不是一回事。

---

## 2. 第 1 步：让 manifest 可发布

1. **去掉 `"private": true`** —— 否则 `npm publish` 直接拒绝。
2. **加 `publishConfig`**，把 registry 钉死：
   ```json
   "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }
   ```
   理由：很多机器的 `.npmrc` 里配了镜像；不钉死 registry 时，发布可能被重定向到不接受发布的镜像上。
3. **跑一次 `npm pkg fix`**，看 npm 想改什么 —— 接受，或者理解后拒绝。常见的一项是 `bin` 路径：`"./bin/x.mjs"` 会被 npm 在每次发布时归一化成 `"bin/x.mjs"`，并打一条听起来很吓人的 `was invalid and removed` 警告（实测**无功能影响**，发布后的 manifest 里 `bin` 完好）。先在自己这边归一化，发布日志就干净了。
4. **DSH 插件专属：决定 `engines.dsh` 怎么写。** 插件市场会从 npm 的 latest manifest 读这个字段。写**精确版本**会让市场在其他所有宿主版本上判「确认不兼容」并拦住安装与更新；写宽区间、或**完全不写**（`engines` 只留 `node`）则不拦。没有版本矩阵证据时，不写是更安全的选择。其余包忽略此步。

---

## 3. 第 2 步：加工作流（OIDC）

```yaml
name: publish

# 只有版本 tag 能触发发布。刻意不加 workflow_dispatch：npm publish 发的是
# package.json 里写的版本、根本不看 tag，手动触发就等于开了一条
# "发布一个没人打过 tag 的版本" 的路。
on:
  push:
    tags: ['v*']

permissions:
  contents: read
  id-token: write        # OIDC 的必需项：用身份换一次性发布授权

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
          package-manager-cache: false    # 发布构建永不用缓存

      # runner 自带的 npm 可能早于 trusted publishing 所需的 11.5.1
      - name: Ensure npm supports trusted publishing
        run: npm install --global npm@latest

      # 闸一：tag 与 manifest 的版本必须一致（发布时取的是 manifest 里的版本）
      - name: Tag must match package.json version
        run: |
          set -euo pipefail
          tag="${GITHUB_REF_NAME#v}"
          pkg="$(node -p "require('./package.json').version")"
          echo "tag = ${GITHUB_REF_NAME}, package.json = ${pkg}"
          if [ "${tag}" != "${pkg}" ]; then
            echo "::error::tag ${GITHUB_REF_NAME} does not match package.json version ${pkg}"
            exit 1
          fi

      # 闸二：跑项目自己那套自检（与该项目 main 分支 CI 用的同一套命令）。
      # 有 lockfile 才需要 npm ci；零依赖项目加了反而失败。
      - name: Offline self-checks
        run: <改成该项目的自检命令>

      # 闸三：tarball 不得夹带本机状态。
      # 注意 npm 11 的 --json 返回数组、npm 12 返回以包名为键的对象，两种都吃。
      - name: Tarball carries no local state
        run: |
          node -e '
            const { execSync } = require("node:child_process");
            // 走 shell 的 execSync，不是 execFileSync：Windows 上 npm 是 npm.cmd，
            // execFileSync 解析不到 —— 只在 runner 上能跑的闸等于没人能本地核验。
            const raw = JSON.parse(execSync("npm pack --dry-run --json", { encoding: "utf8" }));
            const packed = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
            if (packed === undefined || !Array.isArray(packed.files)) {
              console.error(`::error::unexpected npm pack --json shape: ${JSON.stringify(raw).slice(0, 200)}`);
              process.exit(1);
            }
            const paths = packed.files.map(f => f.path);
            const forbidden = /^(config\.json|secrets\.json|local\.json|HANDOVER\.md|.*\.log)$|^verification-results\/|^\.zcode\//u;
            const leaked = paths.filter(p => forbidden.test(p));
            console.log(`${packed.name}@${packed.version}: ${paths.length} files in the tarball`);
            if (leaked.length > 0) {
              console.error(`::error::tarball carries local state: ${leaked.join(", ")}`);
              process.exit(1);
            }
          '

      # 不需要 --provenance、也不需要 --access public：public 仓库 + public 包会自动附 provenance。
      - name: Publish to npm
        run: npm publish
```

三道闸的道理：

1. **tag 与版本一致** —— 没有它，忘了升版会变成「试图重发一个旧版本」，报出来的错指向错误的原因。
2. **跑项目自己的自检** —— 只有该项目 main 上已经过的东西才能发出去。
3. **tarball 不夹带本机状态** —— 白名单只是个控件，只在没人放宽它时有效；所以检查的是打好的 tarball，而不是相信白名单。这道闸的价值与项目历史成正比：越是有过凭据事故的仓库越该有它。

另外：**不要在 gate 里 dump npm 的 debug 日志** —— 它可能带请求头，而公开仓库的 Actions 日志是公开的。要看失败日志直接开 Actions 页面。

---

## 4. 第 3 步：首发（只能用直接发布）

```bash
npm login          # 这台机器没登录过就必须先登录，否则连 OTP 都不会问，直接 need auth
npm publish        # 账号 2FA 覆盖写操作时会再要一次 OTP
```

首发之后立刻核验四件事：

```bash
npm view <name> version          # 版本对不对
npm view <name> --json | head    # manifest 字段（engines / bin / repository / publishConfig）
# 再从 registry 真装一份、跑项目自己的自检
```

**第四件最值钱：本地 dry-run 的 shasum 与 registry 的 `dist.shasum` 应当逐字节一致。** 它排除了「审计的是 A、发出去的是 B」这种最坏情况 —— 也就是让第 0 步那次包内容审计的结论对线上那份同样成立。

```bash
npm publish --dry-run 2>&1 | grep -oE "shasum: [a-f0-9]+"
curl -s https://registry.npmjs.org/<name>/latest | python -c "import sys,json;print(json.load(sys.stdin)['dist']['shasum'])"
```

---

## 5. 第 4 步：npm 侧配置（一次性，必须交互式 2FA）

包的设置页 → **Trusted Publisher** → GitHub Actions：

| 字段 | 填什么 |
|---|---|
| Organization/user | 仓库所属账号 |
| Repository | 仓库名 |
| **Workflow filename** | **只填文件名**（如 `publish.yml`），不能带路径；该文件必须先已存在于 `.github/workflows/` |
| Environment | 工作流没用 environment 就**留空**；两边必须一致 |

### 最容易踩的一个默认值

`Allowed actions` 里 **`npm stage publish` 永远允许，而 `npm publish`（直接发布）必须显式勾选**。2026-09-03 之后创建的配置**默认只允许暂存**，于是直接发布会以

```
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/<name> - OIDC permission denied for this action
```

被拒 —— 而且是**在 provenance 证明已经签好、已经进 sigstore 透明度日志之后**才被拒。这个顺序让症状看起来像「OIDC 身份不通」，实际身份是通的，只是**这个动作没被授权**。

### 配置建成后能不能改

npm 文档说不能（existing connections `cannot be changed`），但 **2026-09-22 实测网页界面可以直接改 allowed actions**。别照文档去删配置重建，先试试直接改。

---

## 6. 第 5 步：以后每次发版

```bash
# 1. 改 package.json 的 version（+ 该项目要求的 CHANGELOG）
# 2. 本地先把那三道闸跑一遍 —— 能本地跑就别等 CI
# 3. 提交推 main
# 4. 打 tag 推 tag：这一步就是发布
git tag -a vX.Y.Z -m "<pkg> vX.Y.Z" && git push origin vX.Y.Z
```

**版本号发布过就消耗掉了**：npm 拒绝已存在的版本，所以每次必须是新版本号；一个版本号已发布过的 tag 也不可能靠重跑把它变出来。

---

## 7. 症状对照表

发布前后常见的现象，以及它们是「正常」「要等」还是「真错」：

| 现象 | 是什么 | 怎么办 |
|---|---|---|
| 网页显示 `Validating: Automated review hasn't finished` | npm 对新版本的自动化安全审查，**不是失败** | 等。实测约 **3 分钟**；期间该版本不在公开读面，`registry.npmjs.org/<name>` 仍只列上一个版本 |
| 本机 `npm install <name>@<新版本>` 报 `notarget` | npm 缓存了该包的版本列表 | 加 `--prefer-online` 重新校验。直接用 HTTP 请求 registry 不受影响，所以会出现「curl 看得到、npm 看不到」 |
| `403 ... OIDC permission denied for this action` | trusted publisher 没勾直接发布（见第 5 节） | 去设置页把 `npm publish` 勾上（可能可以直接改） |
| `npm error need auth` | 这台机器没登录 npm | 先 `npm login` |
| 发布成功但 `_npmUser` 不是 `GitHub Actions` | 用的是 token 而不是 OIDC | 检查 `id-token: write` 权限与 trusted publisher 配置 |
| `npm warn publish "bin[...]" ... was invalid and removed` | npm 把 `./` 前缀归一化，**无功能影响**（发布后 manifest 里 `bin` 完好） | 不用管；想消掉警告就本地跑 `npm pkg fix` |
| 市场 / 镜像里还没有新版本 | registry 镜像与市场目录各有自己的刷新节奏 | 等；中国区镜像（如腾讯）通常很快，插件市场目录是按天的 |

### 发布失败之后怎么补救

tag 是唯一的触发入口，所以先分清那个版本**有没有进 registry**：

- **run 在发布步骤之前失败**（闸没过，或被 npm 拒了）：版本号**还没被消耗**。修好 main，然后把 tag 挪到修复后的提交上 —— 删掉再推。这会重写一个 ref，所以只适合该 tag 还很新、且尚未发布的时候。
- **版本已经在 registry 上**：它消耗掉了，只能往前发下一个版本号。
- **只想不改变任何东西地重跑一次**：把 tag 删掉、在同一个提交上再推一次。**创建 ref 这个动作本身才是触发运行的原因**（对 tag 来说，重推同一个指向也算）。

---

## 8. 一条贯穿全程的原则

**只在 runner 上能跑的闸，等于没人能本地核验。**

每一道闸都要能在本机原样跑一遍；工作流里的脚本也不要依赖 runner 独有的环境。实测中至少因此救过一次：一个只在 runner 上崩的解析问题（npm 12 把 `npm pack --json` 从数组改成了以包名为键的对象），是靠本地装同一版 npm 复现才定位的 —— 如果那道闸只在 CI 里跑，就得靠猜。

同理，**遇到「本地过、runner 不过」的差异，先怀疑 npm 大版本**。本机要复现 runner 的 npm，装到临时前缀即可，别动全局：

```bash
npm i --prefix /tmp/npmlatest npm@latest
PATH="/tmp/npmlatest/node_modules/.bin:$PATH" npm --version
```
