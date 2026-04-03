## Context

`hashline-plugin` 目前是 Bun/TypeScript 專案，已有 `build`、`typecheck`、`test` 腳本，但 `package.json` 仍為 `private`，也沒有 GitHub Actions workflow 可協助完成 npm 發版。參考 `.ref/todo-continuation-enforcer` 可知，發版流程除了 `npm publish` 本身，還需要處理版本輸入驗證、tag 與 npm registry 狀態檢查、主線分支保護、build 驗證，以及發版後的 GitHub release 建立。

此變更會同時觸及 package metadata、CI workflow 與 release 文件，因此值得先定義一致的技術設計，避免實作時把發版邏輯散落在多處。

## Goals / Non-Goals

**Goals:**
- 提供一個由 GitHub Actions 手動觸發的 npm release workflow。
- 在 publish 前強制執行版本、tag、npm registry 與建置驗證，避免重複或不完整發版。
- 讓專案 package metadata 與 build 產物符合 npm 發佈需求。
- 在成功發版後建立對應 git tag 與 GitHub release，讓發版紀錄可追蹤。

**Non-Goals:**
- 不導入完整的自動語意化版本管理工具（如 changesets 或 semantic-release）。
- 不在這次變更中新增多套件 monorepo 發版流程。
- 不處理 npm 組織、套件命名品牌調整或 marketing 內容，僅保留必要 metadata。

## Decisions

### 1. 採用 `workflow_dispatch` 的手動 release workflow
- **Decision:** 以 `.github/workflows/release.yml` 提供手動觸發發版，至少支援明確版本輸入，並保留可選的 release notes 與 dry-run 能力。
- **Why:** 目前專案沒有既有版本治理流程，手動觸發最容易對齊參考 repo，也能避免在尚未穩定前引入過度自動化。
- **Alternatives considered:**
  - 以 git tag push 自動發版：操作簡單，但若前置驗證不足，容易把錯誤直接推進發版流程。
  - 導入 changesets/semantic-release：長期可擴充，但對目前單一套件來說成本偏高。

### 2. 將 release readiness 檢查拆成 publish 前的明確關卡
- **Decision:** workflow 會在 publish 前驗證輸入版本是嚴格 semver、必須大於目前 `package.json` 版本、git tag 與 npm 上不得已存在相同版本，且工作流必須從最新 `main` 執行。
- **Why:** 這些檢查是參考 repo 中最有價值的保護措施，可避免產生 partial release 或以過舊 commit 發版。
- **Alternatives considered:**
  - 僅檢查 `package.json` 版本：不足以避免 tag 與 npm registry 不一致。
  - 只靠 npm publish 失敗回報：錯誤過晚，且無法阻止本地 tag/commit 已建立的中間狀態。

### 3. 維持現有 Bun build/test 流程，並加上 package contents 驗證
- **Decision:** workflow 使用 Bun 安裝依賴與執行 `typecheck`/`test`/`build`，再以 `npm pack --dry-run` 驗證最終會被發佈的內容。
- **Why:** 專案既有腳本已建立在 Bun 上，延續現有工具可降低改動範圍；`npm pack --dry-run` 則能補足「build 成功但發佈內容不完整」的風險。
- **Alternatives considered:**
  - 改成全 Node/npm 流程：可行，但與現有開發方式不一致。
  - 省略 pack 驗證：實作更快，但容易漏掉 `files` / `exports` / 產物設定問題。

### 4. 發版流程以「更新版本 → 驗證套件 → publish → push tag/commit → 建 GitHub release」為順序
- **Decision:** workflow 會在 CI 內更新 `package.json` 版本、建立 release commit 與 tag；非 dry-run 時先 publish 到 npm，再 push commit/tag，最後建立 GitHub release。
- **Why:** 這個順序與參考 repo一致，可先確保 npm publish 成功，再將 release metadata 對外公開，減少遠端留下半套發版狀態的機率。
- **Alternatives considered:**
  - 先 push tag 再 publish：若 publish 失敗，遠端已暴露一個無法安裝的版本標記。
  - 不建立 GitHub release：可省略一個步驟，但會少掉可追蹤的 release 紀錄。

### 5. 將 package manifest 調整為可公開發佈的單一套件
- **Decision:** 移除 `private: true`，補齊 `main`/`types`/`exports`/`files`/`prepack` 與必要 repository metadata，讓 `dist/` 成為穩定的發佈輸出。
- **Why:** 沒有 publishable manifest，workflow 即使存在也無法可靠發版。
- **Alternatives considered:**
  - 僅新增 workflow，不改 manifest：無法形成可安裝套件。
  - 導入額外打包工具：目前 `bun build` 已足夠，沒有必要增加複雜度。

## Risks / Trade-offs

- **npm 套件名稱可能已被占用** → 在實作與驗證時確認最終 package name；若名稱不可用，改用 scope 名稱並同步更新文件。
- **CI 中 publish 與 git push 的順序仍可能留下極少量部分失敗狀態** → 保留 preflight 檢查與 dry-run，並文件化失敗後的人工恢復步驟。
- **Bun 與 Node 雙 runtime 增加 workflow 複雜度** → 僅在需要的步驟使用對應 runtime，避免在 workflow 內混用過多工具。
- **公開發佈後的 metadata 一旦不完整會影響使用者安裝體驗** → 將 `npm pack --dry-run` 納入必跑關卡，並檢查 `files`/`exports`/型別輸出。

## Migration Plan

1. 調整 `package.json` 與建置腳本，使本地 `npm pack --dry-run` 可成功產出預期內容。
2. 新增 GitHub Actions release workflow，先以 dry-run 驗證流程。
3. 補齊 release 文件與操作前置條件（例如 npm publish 權限、GitHub Actions permissions）。
4. 在主分支上手動執行一次 dry-run，確認版本檢查、建置與 pack 驗證正常。
5. 實際發版時以 workflow_dispatch 提供新版本，完成 npm publish、git tag 與 GitHub release。

回滾方式：若 workflow 本身有問題，可先撤回 workflow/manifest 變更；若 npm 已發版，則不嘗試覆寫同版號，而是修正後用更高版本重新發版。

## Open Questions

- 最終公開的 npm package name 是否沿用 `hashline-plugin`，或需改成 scope 名稱以避免名稱衝突？
- 是否要在第一版就加入自動 bump 選項，還是先僅支援明確版本輸入？本設計預設先不納入 auto-bump。
