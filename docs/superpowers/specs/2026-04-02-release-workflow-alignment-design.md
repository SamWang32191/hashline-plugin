# Hashline Plugin Release Workflow Alignment Design

## Goal

讓 `hashline-plugin` 的 GitHub Actions release workflow 能正常使用 npm Trusted Publisher 發版，並補上和 `todo-continuation-enforcer` 一致的 auto-bump release version 能力。

## Problem Summary

- `hashline-plugin` 目前正式 release 會在 `Publish to npm` step 失敗，錯誤為 `ENEEDAUTH`。
- 根因是 workflow 在 publish 前同時清掉了 `NODE_AUTH_TOKEN` / `NPM_TOKEN` 與 `NPM_CONFIG_USERCONFIG` / `npm_config_userconfig`，導致 `actions/setup-node` 為 Trusted Publisher 準備的 runner `.npmrc` 無法被 `npm publish --provenance` 使用。
- 目前 workflow 只支援手動輸入 `version`，沒有 `auto-bump` 功能。

## Non-Goals

- 不導入 Changesets、release-please、semantic-release 等新工具鏈。
- 不修改 `todo-continuation-enforcer`。
- 不改變既有正式發版的高階順序：`publish -> atomic push -> gh release create`。

## Proposed Approach

採用與 `todo-continuation-enforcer` 對齊的 release workflow 模式，限制變更面在 `hashline-plugin` repo 內。

### 1. 修正 Trusted Publisher 發版流程

`Publish to npm` step 保留以下原則：

- 清除殘留 token 型認證：`NODE_AUTH_TOKEN`、`NPM_TOKEN`
- 清掉 repo-local / home `.npmrc`
- 保留 `actions/setup-node` 建立的 `NPM_CONFIG_USERCONFIG` / `npm_config_userconfig`
- 使用既有指令：`npm publish --provenance --access public --registry=https://registry.npmjs.org/`

這樣可以避免 token / legacy auth 汙染，同時保留 OIDC Trusted Publisher 所需的 runner userconfig。

### 2. 新增 auto-bump workflow_dispatch input

在 `workflow_dispatch.inputs` 新增：

- `auto-bump`: `no | patch | minor`，預設 `no`
- `version`: 改為非必填，僅在 `auto-bump=no` 時使用

新增 `auto-bump` job：

- 讀取 `package.json.version`
- 使用與 `todo-continuation-enforcer` 一樣的 semver 計算方式產生下一個 patch/minor 版本
- 輸出 `bumped_version`

### 3. 在 readiness 階段統一決定 final_version

`ensure-release-readiness` 會接收：

- 手動 `version`
- `auto-bump` job 算出的 `bumped_version`

並執行以下 runtime validation：

- `auto-bump` 與 `version` 不可同時提供
- `auto-bump=no` 時若沒填 `version`，直接失敗
- `final_version` 必須符合嚴格 semver、不能以 `v` 開頭
- `final_version` 必須大於 `package.json` 目前版本
- `final_version` 對應的 git tag 與 npm package version 都必須尚未存在
- 若只存在其中一邊，視為 partial release，直接失敗

### 4. 保留既有 release job 順序

release job 不改核心順序，只做必要對齊：

1. branch / SHA guard
2. install / typecheck / test / build
3. bump `package.json` version
4. `npm pack --dry-run`
5. release body preparation
6. local release commit / tag
7. preflight push
8. `npm publish --provenance`
9. atomic push commit + tag
10. `gh release create`

## Files to Change

- Modify: `.github/workflows/release.yml`
- Modify: `docs/release-runbook.md`
- Add: `tests/release-workflow-regression.test.ts`

## Testing Strategy

新增 workflow regression test，直接從 `.github/workflows/release.yml` 抽取 `run:` block 執行，覆蓋以下案例：

1. `Read package metadata` 會正確寫出 package name / current version
2. `Resolve and validate release version` 支援：
   - manual version
   - auto-bump version
   - 缺少輸入時失敗
   - 衝突輸入時失敗
3. `Publish to npm` step：
   - cleanup 發生在 publish 前
   - `NODE_AUTH_TOKEN` / `NPM_TOKEN` 在 publish 當下已清除
   - `NPM_CONFIG_USERCONFIG` / `npm_config_userconfig` 在 publish 當下仍保留
   - publish 指令為 `npm publish --provenance --access public --registry=https://registry.npmjs.org/`

另外會執行 repo 既有驗證：

- `bun test`
- `bun run typecheck`
- `bun run build`

## Verification Plan

完成實作後，依序驗證：

1. 本地測試 / typecheck / build 全通過
2. 用 `gh workflow run release.yml` 做一次 `dry_run=true` 驗證手動版號
3. 用 `gh workflow run release.yml` 做一次 `dry_run=true` 驗證 `auto-bump=patch` 或 `minor`
4. 若 dry-run 正常，repo 即進入「可正常正式 release 下一版」狀態

正式 release 會另行執行，因為那一步會改動 npm、remote tag 與 GitHub Release。

## Risks and Mitigations

- **風險：** auto-bump 新增後，dispatch UI 無法原生表達互斥規則  
  **緩解：** 在 runtime validation 明確報錯。

- **風險：** Trusted Publisher 行為被錯誤 cleanup 再次破壞  
  **緩解：** 用 regression test 鎖住 publish 時的 env 與 cleanup 順序。

- **風險：** 發版前只看 dry-run，沒有真的打到 npm  
  **緩解：** 完成定義只保證 workflow 與 preflight 可用；正式發版會在 dry-run 後再執行。

## Success Criteria

- `hashline-plugin` release workflow 不再因 `ENEEDAUTH` 失敗
- workflow 同時支援 manual version 與 `auto-bump=patch|minor`
- 互斥 / 缺輸入驗證清楚可測
- regression test、typecheck、build、test 全通過
- 至少一組 `gh` dry-run 驗證成功
