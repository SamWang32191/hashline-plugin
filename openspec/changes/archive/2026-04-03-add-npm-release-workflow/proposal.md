## Why

目前 `hashline-plugin` 沒有標準化的 npm 發版流程，也沒有 GitHub Actions workflow 可在 release 前檢查版本、驗證可發佈內容並完成 npm 發佈。參考 `.ref/todo-continuation-enforcer` 的做法，可降低手動發版失誤並讓 npm release 流程可重複、可審計。

## What Changes

- 新增一個 GitHub Actions release workflow，支援手動觸發 npm 發版。
- 在 workflow 中加入版本輸入驗證、tag/npm 重複發版檢查、build/typecheck/test 與 package contents 驗證。
- 讓套件具備可發佈到 npm 的必要 package metadata 與產物設定。
- 補上 release 使用方式與必要前置條件文件。

## Capabilities

### New Capabilities
- `npm-package-release`: 以 GitHub Actions 執行可重複的 npm 發版流程，包含版本驗證、發版前檢查、npm publish 與 GitHub release 建立。

### Modified Capabilities
- None.

## Impact

- 受影響檔案包含 `package.json`、可能新增的 `.github/workflows/release.yml`、建置輸出設定與 release 文件。
- 需要使用 GitHub Actions 權限、npm registry 發佈設定，以及 `gh`/npm publish 所需的 CI 環境能力。
