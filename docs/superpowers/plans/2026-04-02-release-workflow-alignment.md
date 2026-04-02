# Release Workflow Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 `hashline-plugin` 的 npm Trusted Publisher release workflow，使正式 release 不再因 `ENEEDAUTH` 失敗，並新增 `auto-bump` release version 能力。

**Architecture:** 以既有 `.github/workflows/release.yml` 為基礎做最小對齊，複用 `todo-continuation-enforcer` 已驗證過的 auto-bump 與 runtime validation 模式。用 workflow regression test 鎖住 `Publish to npm` 的 auth cleanup 行為與 `final_version` 決策邏輯，避免之後再回歸。

**Tech Stack:** GitHub Actions, Bun, TypeScript, Bun test, npm Trusted Publisher, gh CLI

---

## File Map

- Modify: `.github/workflows/release.yml`
  - 新增 `auto-bump` input 與 `auto-bump` job
  - 調整 `ensure-release-readiness` 的版本解析
  - 修正 `Publish to npm` step，不再移除 `NPM_CONFIG_USERCONFIG`
- Add: `tests/release-workflow-regression.test.ts`
  - 針對 workflow `run:` block 做黑箱 regression test
- Modify: `docs/release-runbook.md`
  - 補 `auto-bump` 說明與 dry-run / 正式 release 驗收方式

### Task 1: 先建立 workflow regression test

**Files:**
- Create: `tests/release-workflow-regression.test.ts`
- Read for reference: `.github/workflows/release.yml`

- [ ] **Step 1: 寫失敗中的 regression test 檔**

建立 `tests/release-workflow-regression.test.ts`，內容如下：

```ts
import { describe, expect, it } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

function extractRunBlock(workflowText: string, stepName: string) {
  const lines = workflowText.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`)

  if (startIndex === -1) {
    throw new Error(`Could not find step: ${stepName}`)
  }

  const runIndex = lines.slice(startIndex).findIndex((line) => line.trim() === "run: |")
  if (runIndex === -1) {
    throw new Error(`Could not find run block for step: ${stepName}`)
  }

  const runLine = lines[startIndex + runIndex]
  const runIndent = runLine.length - runLine.trimStart().length
  const scriptLines: string[] = []

  for (let index = startIndex + runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const lineIndent = line.length - line.trimStart().length
    if (line.trimStart().startsWith("- name: ") && lineIndent <= runIndent) {
      break
    }

    scriptLines.push(line.slice(runIndent + 2))
  }

  return scriptLines.join("\n").trimEnd()
}

describe("release workflow regressions", () => {
  it("Read package metadata step 能成功寫出 package metadata", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")
    const runBlock = extractRunBlock(workflowText, "Read package metadata")

    const tempDir = mkdtempSync(join(tmpdir(), "release-workflow-"))
    try {
      const scriptPath = join(tempDir, "read-package-metadata.sh")
      const outputPath = join(tempDir, "github-output.txt")
      const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; version: string }

      writeFileSync(scriptPath, `${runBlock}\n`)
      writeFileSync(outputPath, "")

      const result = spawnSync("bash", [scriptPath], {
        env: { ...process.env, GITHUB_OUTPUT: outputPath },
        encoding: "utf8",
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")
      expect(readFileSync(outputPath, "utf8")).toBe(`package_name=${packageJson.name}\ncurrent_version=${packageJson.version}\n`)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("Resolve and validate release version step 能處理 manual/auto-bump/錯誤輸入", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")
    const runBlock = extractRunBlock(workflowText, "Resolve and validate release version")
    const tempDir = mkdtempSync(join(tmpdir(), "release-workflow-"))

    try {
      const scriptPath = join(tempDir, "resolve-version.sh")
      const outputPath = join(tempDir, "github-output.txt")
      writeFileSync(scriptPath, `${runBlock}\n`)

      const runScenario = (env: Record<string, string>) => {
        writeFileSync(outputPath, "")
        return spawnSync("bash", [scriptPath], {
          env: { ...process.env, ...env, GITHUB_OUTPUT: outputPath },
          encoding: "utf8",
        })
      }

      const autoBumpResult = runScenario({
        AUTO_BUMP_VERSION: "0.1.1",
        INPUT_VERSION: "",
        CURRENT_VERSION: "0.1.0",
      })
      expect(autoBumpResult.status).toBe(0)
      expect(autoBumpResult.stderr).toBe("")
      expect(readFileSync(outputPath, "utf8")).toBe("final_version=0.1.1\n")

      const manualResult = runScenario({
        AUTO_BUMP_VERSION: "",
        INPUT_VERSION: "0.2.0",
        CURRENT_VERSION: "0.1.0",
      })
      expect(manualResult.status).toBe(0)
      expect(manualResult.stderr).toBe("")
      expect(readFileSync(outputPath, "utf8")).toBe("final_version=0.2.0\n")

      const missingInputsResult = runScenario({
        AUTO_BUMP_VERSION: "",
        INPUT_VERSION: "",
        CURRENT_VERSION: "0.1.0",
      })
      expect(missingInputsResult.status).not.toBe(0)
      expect(missingInputsResult.stderr).toContain("Either select auto-bump or provide version input")

      const conflictingInputsResult = runScenario({
        AUTO_BUMP_VERSION: "0.1.1",
        INPUT_VERSION: "0.2.0",
        CURRENT_VERSION: "0.1.0",
      })
      expect(conflictingInputsResult.status).not.toBe(0)
      expect(conflictingInputsResult.stderr).toContain("Provide either auto-bump or version input, not both")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("Publish to npm step 會清理 token auth 並保留 setup-node userconfig", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")
    const runBlock = extractRunBlock(workflowText, "Publish to npm")
    const tempDir = mkdtempSync(join(tmpdir(), "release-workflow-"))

    try {
      const scriptPath = join(tempDir, "publish-to-npm.sh")
      const fakeBinDir = join(tempDir, "bin")
      const callLogPath = join(tempDir, "calls.jsonl")

      mkdirSync(fakeBinDir)
      writeFileSync(
        join(fakeBinDir, "npm"),
        `#!/usr/bin/env node
const fs = require('node:fs')
const logPath = process.env.CALL_LOG_PATH
if (!logPath) throw new Error('CALL_LOG_PATH is required')
fs.appendFileSync(
  logPath,
  JSON.stringify({
    tool: 'npm',
    argv: process.argv.slice(2),
    NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? '__UNSET__',
    NPM_TOKEN: process.env.NPM_TOKEN ?? '__UNSET__',
    NPM_CONFIG_USERCONFIG: process.env.NPM_CONFIG_USERCONFIG ?? '__UNSET__',
    npm_config_userconfig: process.env.npm_config_userconfig ?? '__UNSET__',
  }) + '\\n',
)
`,
      )
      writeFileSync(
        join(fakeBinDir, "rm"),
        `#!/usr/bin/env node
const fs = require('node:fs')
const logPath = process.env.CALL_LOG_PATH
if (!logPath) throw new Error('CALL_LOG_PATH is required')
fs.appendFileSync(
  logPath,
  JSON.stringify({
    tool: 'rm',
    argv: process.argv.slice(2),
  }) + '\\n',
)
`,
      )
      chmodSync(join(fakeBinDir, "npm"), 0o755)
      chmodSync(join(fakeBinDir, "rm"), 0o755)
      writeFileSync(scriptPath, `${runBlock}\n`)

      const result = spawnSync("bash", [scriptPath], {
        env: {
          ...process.env,
          PATH: `${fakeBinDir}:${process.env.PATH}`,
          CALL_LOG_PATH: callLogPath,
          NODE_AUTH_TOKEN: "parent-node-auth-token",
          NPM_TOKEN: "parent-npm-token",
          NPM_CONFIG_USERCONFIG: "parent-upper-userconfig",
          npm_config_userconfig: "parent-userconfig",
        },
        encoding: "utf8",
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")

      expect(runBlock).toMatch(/unset\s+NODE_AUTH_TOKEN\s+NPM_TOKEN/)
      expect(runBlock).not.toMatch(/unset\s+NPM_CONFIG_USERCONFIG\s+npm_config_userconfig/)

      const calls = readFileSync(callLogPath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as {
          tool: string
          argv: string[]
          NODE_AUTH_TOKEN?: string
          NPM_TOKEN?: string
          NPM_CONFIG_USERCONFIG?: string
          npm_config_userconfig?: string
        })

      const publishCallIndex = calls.findIndex((call) => call.tool === "npm" && call.argv[0] === "publish")
      const configDeleteCallIndex = calls.findIndex(
        (call) => call.tool === "npm" && call.argv[0] === "config" && call.argv[1] === "delete" && call.argv[2] === "//registry.npmjs.org/:_authToken",
      )
      const homeNpmrc = `${process.env.HOME ?? ""}/.npmrc`
      const rmCallIndex = calls.findIndex(
        (call) => call.tool === "rm" && call.argv.length === 3 && call.argv[0] === "-f" && call.argv[1] === homeNpmrc && call.argv[2] === ".npmrc",
      )

      const publishCall = calls[publishCallIndex]

      expect({
        cleanupBeforePublish: configDeleteCallIndex !== -1 && rmCallIndex !== -1 && configDeleteCallIndex < publishCallIndex && rmCallIndex < publishCallIndex,
        publishArgs: publishCall?.argv.join(" ") ?? null,
        publishEnv: {
          NODE_AUTH_TOKEN: publishCall?.NODE_AUTH_TOKEN ?? "__UNSET__",
          NPM_TOKEN: publishCall?.NPM_TOKEN ?? "__UNSET__",
          NPM_CONFIG_USERCONFIG: publishCall?.NPM_CONFIG_USERCONFIG ?? "__UNSET__",
          npm_config_userconfig: publishCall?.npm_config_userconfig ?? "__UNSET__",
        },
      }).toEqual({
        cleanupBeforePublish: true,
        publishArgs: "publish --provenance --access public --registry=https://registry.npmjs.org/",
        publishEnv: {
          NODE_AUTH_TOKEN: "__UNSET__",
          NPM_TOKEN: "__UNSET__",
          NPM_CONFIG_USERCONFIG: "parent-upper-userconfig",
          npm_config_userconfig: "parent-userconfig",
        },
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: 先跑新測試，確認它會失敗**

Run: `bun test tests/release-workflow-regression.test.ts`

Expected: FAIL，因為目前 workflow 沒有 `auto-bump` job，且 `Publish to npm` step 仍然會 unset `NPM_CONFIG_USERCONFIG` / `npm_config_userconfig`。

- [ ] **Step 3: 提交測試骨架**

```bash
git add tests/release-workflow-regression.test.ts
git commit -m "test: add release workflow regression coverage"
```

### Task 2: 更新 release workflow 對齊成功模式

**Files:**
- Modify: `.github/workflows/release.yml`
- Test against: `tests/release-workflow-regression.test.ts`

- [ ] **Step 1: 在 workflow inputs 加入 auto-bump**

把開頭的 `workflow_dispatch.inputs` 改成這段：

```yml
on:
  workflow_dispatch:
    inputs:
      auto-bump:
        description: Auto bump release version
        required: false
        type: choice
        default: "no"
        options:
          - "no"
          - "patch"
          - "minor"
      version:
        description: Release version (X.Y.Z), required if auto-bump = no
        required: false
        type: string
      notes:
        description: Release notes
        required: false
        type: string
      dry_run:
        description: Skip mutating publish/push steps
        required: true
        default: true
        type: boolean
```

- [ ] **Step 2: 新增 auto-bump job**

在 `jobs:` 下、`ensure-release-readiness` 之前加入：

```yml
  auto-bump:
    runs-on: ubuntu-latest
    if: ${{ inputs.auto-bump != 'no' }}
    outputs:
      bumped_version: ${{ steps.bump.outputs[inputs.auto-bump] }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd
        with:
          fetch-depth: 0

      - name: Read current version
        id: package-meta
        run: |
          printf 'current_version=%s\n' "$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Compute bumped version
        id: bump
        uses: WyriHaximus/github-action-next-semvers@v1
        with:
          version: ${{ steps.package-meta.outputs.current_version }}
```

- [ ] **Step 3: 更新 readiness job 的 needs 與版本解析**

把 `ensure-release-readiness` job header 改成：

```yml
  ensure-release-readiness:
    runs-on: ubuntu-latest
    if: ${{ !failure() }}
    needs: [auto-bump]
```

再把 `Resolve and validate release version` step 替換成：

```yml
      - name: Resolve and validate release version
        id: resolve-version
        env:
          AUTO_BUMP_VERSION: ${{ needs.auto-bump.outputs.bumped_version }}
          INPUT_VERSION: ${{ inputs.version }}
          CURRENT_VERSION: ${{ steps.package-meta.outputs.current_version }}
        run: |
          node <<'EOF'
          const fs = require('node:fs')

          const autoBumpVersion = process.env.AUTO_BUMP_VERSION ?? ''
          const input = process.env.INPUT_VERSION ?? ''
          const current = process.env.CURRENT_VERSION ?? ''

          if (autoBumpVersion && input) {
            throw new Error('Provide either auto-bump or version input, not both')
          }

          const finalVersion = autoBumpVersion || input

          const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
          if (!finalVersion) {
            throw new Error('Either select auto-bump or provide version input')
          }

          if (finalVersion.startsWith('v')) throw new Error('version must not start with v')
          if (!semver.test(finalVersion)) throw new Error('version must match X.Y.Z')
          if (!semver.test(current)) throw new Error(`current package version is not strict semver: ${current}`)

          const toTuple = (value) => value.split('.').map((part) => Number(part))
          const [inMajor, inMinor, inPatch] = toTuple(finalVersion)
          const [curMajor, curMinor, curPatch] = toTuple(current)

          const isGreater =
            inMajor > curMajor ||
            (inMajor === curMajor && inMinor > curMinor) ||
            (inMajor === curMajor && inMinor === curMinor && inPatch > curPatch)

          if (!isGreater) {
            throw new Error(`version ${finalVersion} must be greater than current version ${current}`)
          }

          fs.appendFileSync(process.env.GITHUB_OUTPUT, `final_version=${finalVersion}\n`)
          EOF
```

- [ ] **Step 4: 修正 Publish to npm step 的 cleanup**

把 `Publish to npm` step 改成：

```yml
      - name: Publish to npm
        if: ${{ !inputs.dry_run }}
        run: |
          set -euo pipefail
          unset NODE_AUTH_TOKEN NPM_TOKEN
          npm config delete //registry.npmjs.org/:_authToken || true
          rm -f ~/.npmrc .npmrc || true
          npm publish --provenance --access public --registry=https://registry.npmjs.org/
```

重點是：**不要**再 unset `NPM_CONFIG_USERCONFIG` / `npm_config_userconfig`。

- [ ] **Step 5: 確認 release job 在 auto-bump skipped 時仍可執行**

保留這個條件：

```yml
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: ensure-release-readiness
    if: ${{ !failure() && !cancelled() }}
```

- [ ] **Step 6: 跑剛才的 regression test，確認轉綠**

Run: `bun test tests/release-workflow-regression.test.ts`

Expected: PASS

- [ ] **Step 7: 提交 workflow 修正**

```bash
git add .github/workflows/release.yml tests/release-workflow-regression.test.ts
git commit -m "fix: align release workflow with trusted publishing"
```

### Task 3: 更新 runbook 並做完整驗證

**Files:**
- Modify: `docs/release-runbook.md`

- [ ] **Step 1: 更新 runbook 的 workflow inputs 與 dry run 說明**

把 `docs/release-runbook.md` 的 input 區塊改成包含：

```md
## Workflow inputs

- `auto-bump`: `no` / `patch` / `minor`，預設 `no`
- `version`: 當 `auto-bump=no` 時提供發佈版本
- `notes`: release notes（選填）
- `dry_run`: 先走完整驗證與本地 release 模擬，不做 npm publish / remote push / GitHub release
```

並在 dry run 區塊補上：

```md
- 若要驗證 auto-bump，將 `auto-bump` 設為 `patch` 或 `minor`，並保持 `version` 空白。
- 若同時提供 `auto-bump` 與 `version`，workflow 會在 readiness 階段直接失敗。
```

- [ ] **Step 2: 跑完整本地驗證**

Run: `bun test && bun run typecheck && bun run build`

Expected: 全部 PASS

- [ ] **Step 3: 用 gh 觸發手動版號 dry-run**

Run: `gh workflow run release.yml -f version=0.1.1 -f dry_run=true`

Expected: workflow successfully dispatched

- [ ] **Step 4: 看最新 run 結果並確認乾跑成功**

Run: `gh run list --workflow release.yml --limit 1 && gh run view --log`

Expected: `ensure-release-readiness` 與 `release` job 成功，且 `Dry-run summary` step 有列出 publish / push / release 指令

- [ ] **Step 5: 用 gh 觸發 auto-bump dry-run**

Run: `gh workflow run release.yml -f auto-bump=patch -f dry_run=true`

Expected: workflow successfully dispatched

- [ ] **Step 6: 再確認最新 run 成功**

Run: `gh run list --workflow release.yml --limit 1 && gh run view --log`

Expected: `auto-bump` job 成功算出新版本，後續 dry-run 成功

- [ ] **Step 7: 提交 runbook 更新**

```bash
git add docs/release-runbook.md
git commit -m "docs: document auto-bump release flow"
```

## Final verification checklist

- [ ] `bun test tests/release-workflow-regression.test.ts`
- [ ] `bun test`
- [ ] `bun run typecheck`
- [ ] `bun run build`
- [ ] `gh workflow run release.yml -f version=0.1.1 -f dry_run=true`
- [ ] `gh workflow run release.yml -f auto-bump=patch -f dry_run=true`
- [ ] 最後確認 workflow 已具備正式 release 下一版的能力
