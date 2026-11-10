# npm automated publishing (RELEASING)

**Target end state**: push a version tag, CI publishes the package to npm itself, with **no long-lived token anywhere in the loop**.

This is a **portable runbook** — it works for any npm package, not just this one. Every npm behaviour described here was measured; where a claim is empirical, the method is stated next to it.

---

## 0. The ordering constraint you cannot route around

**The first publish cannot use OIDC, and cannot use staged publishing.** Two hard constraints:

- The staged-publish documentation says it outright: `you cannot stage a brand-new package` — the package must already exist in the registry;
- The trusted-publisher settings live on the **package's settings page**, and while the package does not exist there is no such page.

So the order is: **the first publish must be a direct publish** (interactive 2FA, or a token with bypass-2FA) → once the package exists → the OIDC path opens.

Know also that **npm is closing off "long-lived token, direct publish"**: granular tokens with bypass-2FA lose direct-publish ability around 2027-01, keeping only "read private packages + staged publish". So **do not treat "long-lived token + script" as a long-term plan** — it is a transition arrangement only, and do not build infrastructure around it (do not, for example, mint a dedicated token and store it in a secret manager).

---

## 1. Step 0: scout first, touch no files

```bash
# Is the name free? (404 = unclaimed)
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/<name>

# private:true makes npm publish fail outright
node -p "require('./package.json').private"

# OIDC needs npm>=11.5.1 and Node>=22.14.0 (a CI requirement, not a package engines requirement)
node -v; npm -v

# The scouting that matters most: what will actually go into the package
npm pack --dry-run --json
```

**Read every file `npm pack` lists.** Continue only when `files` is an allowlist and nothing in it is local state (machine config, keys, logs, handover notes, audit records).

### A non-obvious rule: `.gitignore` does not stop npm

When `files` **lists a whole directory** (e.g. `"tools"`), files ignored by `.gitignore` **inside that directory still get packed**. Measured 2026-09-22:

| Configuration | Does `tools/local.json` get packed? |
|---|---|
| `files: ["tools"]`, `.gitignore` has `tools/local.json` | **packed** |
| `files: ["tools"]`, `.npmignore` has `tools/local.json` | **packed** (`files` wins over ignore files) |
| `files: ["tools", "!tools/local.json"]` | not packed ✓ |

**There is only one reliable fix**: negate with `!` inside `files`, or stop listing whole directories and list files one by one.

> This package's instance: `files` lists the whole `"tools"`, and `tools/local.json` is precisely the **machine config** described in `ADAPTING.md` (it holds the `keyFile` path, the SearXNG address, proxy addresses, and `runtimeNotes` describing which channels work on that machine). The file does not currently exist so nothing leaked — but the day it exists, the next publish carries it.
> The portable lesson: **a file ignored by git is not the same as a file that will not enter the npm tarball** — the two ignore systems are not the same thing.

---

## 2. Step 1: make the manifest publishable

1. **Drop `"private": true`** — otherwise `npm publish` refuses outright.
2. **Add `publishConfig`** and pin the registry:
   ```json
   "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }
   ```
   Reason: many machines have a mirror in `.npmrc`; without a pinned registry a publish can be redirected to a mirror that does not accept publishes.
3. **Run `npm pkg fix` once** and read what npm wants to change — accept it, or reject it knowingly. The common one is the `bin` path: `"./bin/x.mjs"` gets normalised to `"bin/x.mjs"` on every publish, with a scary-sounding `was invalid and removed` warning (measured: **no functional impact** — `bin` is intact in the published manifest). Normalise it yourself first and the publish log stays clean.
4. **DSH plugins only: decide how to write `engines.dsh`.** The plugin market reads this field from npm's latest manifest. Writing an **exact version** makes the market mark it "confirmed incompatible" on every other host version and block install and update; a wide range — or **omitting it entirely** (leaving only `node` under `engines`) — does not block. Without evidence from a version matrix, omitting is the safer choice. Other packages can skip this step.

---

## 3. Step 2: add the workflow (OIDC)

```yaml
name: publish

# Only a version tag can trigger a publish. workflow_dispatch is deliberately absent:
# npm publish publishes the version written in package.json and ignores the tag, so a
# manual trigger would open a path to "publish a version nobody tagged".
on:
  push:
    tags: ['v*']

permissions:
  contents: read
  id-token: write        # required for OIDC: trade identity for a one-shot publish grant

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
          package-manager-cache: false    # a release build never uses a cache

      # the runner's bundled npm may predate the 11.5.1 that trusted publishing needs
      - name: Ensure npm supports trusted publishing
        run: npm install --global npm@latest

      # Gate 1: tag and manifest version must match (publishing takes the manifest version)
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

      # Gate 2: run the project's own self-checks (the same command its main-branch CI runs).
      # npm ci is only needed when there is a lockfile; on a zero-dependency project it fails.
      - name: Offline self-checks
        run: <replace with this project's self-check command>

      # Gate 3: the tarball must not carry local state.
      # Note npm 11 returns an array from --json and npm 12 returns an object keyed by
      # package name; handle both.
      - name: Tarball carries no local state
        run: |
          node -e '
            const { execSync } = require("node:child_process");
            // execSync through the shell, not execFileSync: on Windows npm is npm.cmd,
            // which execFileSync cannot resolve — a gate that only runs on the runner is a
            // gate nobody can verify locally.
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

      # No --provenance, no --access public: a public repo + public package gets provenance automatically.
      - name: Publish to npm
        run: npm publish
```

Why three gates:

1. **Tag matches version** — without it, forgetting a version bump turns into "attempting to republish an old version", and the resulting error points at the wrong cause.
2. **Run the project's own self-checks** — only what already passes on main ships.
3. **The tarball carries no local state** — the allowlist is a control, and it only holds while nobody loosens it; so the gate inspects the built tarball instead of trusting the allowlist. This gate's value scales with the project's history: the more credential incidents a repo has had, the more it needs it.

Also: **never dump npm's debug log inside a gate** — it can contain request headers, and a public repo's Actions logs are public. Read failures on the Actions page instead.

---

## 4. Step 3: first publish (direct only)

```bash
npm login          # if this machine has never logged in, do this first; otherwise you get "need auth" without even an OTP prompt
npm publish        # if the account's 2FA covers writes, it asks for one more OTP
```

Verify four things immediately after the first publish:

```bash
npm view <name> version          # is the version right
npm view <name> --json | head    # manifest fields (engines / bin / repository / publishConfig)
# then actually install a copy from the registry and run the project's own self-checks
```

**The fourth is the valuable one: the shasum from a local dry-run should match the registry's `dist.shasum` byte for byte.** It rules out the worst case — auditing A while shipping B — which is what makes the step-0 audit conclusion hold for the thing that is actually live.

```bash
npm publish --dry-run 2>&1 | grep -oE "shasum: [a-f0-9]+"
curl -s https://registry.npmjs.org/<name>/latest | python -c "import sys,json;print(json.load(sys.stdin)['dist']['shasum'])"
```

---

## 5. Step 4: npm-side configuration (one time, interactive 2FA required)

Package settings page → **Trusted Publisher** → GitHub Actions:

| Field | What to put |
|---|---|
| Organization/user | The account that owns the repo |
| Repository | The repo name |
| **Workflow filename** | **The filename only** (e.g. `publish.yml`), no path; the file must already exist under `.github/workflows/` |
| Environment | **Leave blank** if the workflow declares no environment; both sides must agree |

### The default that bites

Under `Allowed actions`, **`npm stage publish` is always allowed, while `npm publish` (direct publish) must be ticked explicitly**. Configurations created after 2026-09-03 **allow staged publishing only by default**, so a direct publish is rejected with

```
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/<name> - OIDC permission denied for this action
```

— and the rejection arrives **after** the provenance attestation has already been signed and pushed to the sigstore transparency log. That ordering makes the symptom look like "OIDC identity does not work", when in fact the identity works and **the action is not authorised**.

### Can the configuration be changed after creation

The npm docs say it cannot (existing connections `cannot be changed`), but **a 2026-09-22 measurement found the web UI changes allowed actions directly**. Do not follow the docs into delete-and-recreate; try editing first.

---

## 6. Step 5: every release after that

```bash
# 1. bump the version in package.json (+ whatever CHANGELOG this project requires)
# 2. run those three gates locally first — if it can run locally, do not wait for CI
# 3. commit and push to main
# 4. tag and push the tag: this step *is* the publish
git tag -a vX.Y.Z -m "<pkg> vX.Y.Z" && git push origin vX.Y.Z
```

**A version number is consumed by publishing**: npm rejects an existing version, so every release needs a new number, and a tag whose version was already published cannot be re-run into existence.

---

## 7. Symptom table

Things you will see around a publish, and whether each is "normal", "wait", or "genuinely broken":

| Symptom | What it is | What to do |
|---|---|---|
| The page shows `Validating: Automated review hasn't finished` | npm's automated security review of a new version — **not a failure** | Wait. Measured at about **3 minutes**; until it clears the version is not publicly readable and `registry.npmjs.org/<name>` still lists only the previous version |
| Local `npm install <name>@<new version>` says `notarget` | npm has cached that package's version list | Re-validate with `--prefer-online`. Plain HTTP requests to the registry are unaffected, hence "curl can see it, npm cannot" |
| `403 ... OIDC permission denied for this action` | The trusted publisher does not have direct publish ticked (see §5) | Tick `npm publish` on the settings page (editing may work directly) |
| `npm error need auth` | This machine is not logged in to npm | `npm login` first |
| Publish succeeded but `_npmUser` is not `GitHub Actions` | A token was used rather than OIDC | Check the `id-token: write` permission and the trusted-publisher configuration |
| `npm warn publish "bin[...]" ... was invalid and removed` | npm normalised the `./` prefix; **no functional impact** (`bin` is intact in the published manifest) | Ignore it; run `npm pkg fix` locally if you want the warning gone |
| The market / a mirror does not show the new version yet | Registry mirrors and market catalogues refresh on their own schedules | Wait; the China mirror (Tencent, for example) is usually quick, while the plugin market catalogue refreshes daily |

### Recovering from a failed publish

The tag is the only trigger, so first work out whether that version **reached the registry**:

- **The run failed before the publish step** (a gate failed, or npm rejected it): the version number is **not consumed**. Fix main, then move the tag onto the fixed commit — delete and re-push. This rewrites a ref, so it is only appropriate while that tag is fresh and unpublished.
- **The version is already on the registry**: it is consumed; publish the next version number.
- **You only want to re-run without changing anything**: delete the tag and push it again on the same commit. **Creating the ref is what triggers the run** (for tags, re-pushing the same target counts).

---

## 8. One principle that runs through everything

**A gate that only runs on the runner is a gate nobody can verify locally.**

Every gate must be runnable verbatim on your own machine, and scripts inside the workflow must not depend on anything only the runner has. That has paid for itself at least once: a parsing problem that only crashed on the runner (npm 12 changed `npm pack --json` from an array to an object keyed by package name) was only located by reproducing it locally with the same npm version — had that gate only existed in CI, it would have been guesswork.

By the same token, **when something passes locally and fails on the runner, suspect the npm major version first**. To reproduce the runner's npm locally, install it into a temporary prefix rather than touching the global one:

```bash
npm i --prefix /tmp/npmlatest npm@latest
PATH="/tmp/npmlatest/node_modules/.bin:$PATH" npm --version
```
