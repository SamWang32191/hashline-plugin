# Release runbook

## Prerequisites

- `main` 必須是最新 commit
- 版本號需是嚴格 semver，例如 `1.2.3`
- npm package 需已啟用 GitHub Actions trusted publishing
- GitHub Actions 需要 `contents: write` 與 `id-token: write`
- 觸發者需確認目標版本尚未存在於 git tag 與 npm registry

## Workflow inputs

- `auto-bump`: `no|patch|minor`，預設 `no`
- `version`: 發佈版本
- `notes`: release notes（選填）
- `dry_run`: 先走完整驗證與本地 release 模擬，不做 npm publish / remote push / GitHub release；只會產生 dry-run summary，不會變更遠端狀態

## Input rules

- 只有在 `auto-bump=no` 時才提供 `version`
- 驗證 `auto-bump` 時，`version` 必須留空
- 同時提供 `auto-bump` 與 `version` 會在 readiness 階段失敗

## Dry run

先用 `dry_run=true` 跑一次，確認 install、typecheck、test、build、更新版本後的 `npm pack --dry-run` 都成功。

Dry run 會在 runner 內：

- 檢查 `main` 與最新 `origin/main` HEAD
- 驗證版本格式與版本遞增
- 檢查 git tag / npm version 是否已存在
- 建立 local release commit 與 tag
- 產生 workflow summary，列出原本會執行的 publish / push / release 指令

## 失敗恢復

- 若失敗在 preflight 階段：修正後重新跑 workflow
- 若失敗在 publish 後、push 前：先確認 npm 是否已發布，再補做同版號對應的 tag / GitHub release，或用更高版本重新發版
- 若失敗在 push 前：先看 `Preflight push` 的錯誤，修正 branch protection / 權限 / fast-forward 問題後再重新跑

## Expected release order

1. readiness checks
2. install / typecheck / test / build
3. bump `package.json` version in CI
4. `npm pack --dry-run`
5. local release commit / tag
6. `npm publish --provenance`
7. atomic push of release commit + tag
8. `gh release create`
