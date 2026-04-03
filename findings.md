# Findings

## 高層地圖
- 專案入口集中在 `src/index.ts`。
- 核心邏輯集中在 `src/tools/hashline-edit.ts`、`src/hashline/hash.ts`、`src/hashline/format.ts`。
- 測試集中於 `tests/`，release 流程集中於 `.github/workflows/release.yml`。

## 初步候選優化點
- `hashline-edit` 的公開操作能力可能與實作不一致。
- hash 強度可能偏弱，需讀碼確認。
- 測試看起來有 happy path，但邊界覆蓋可能不足。
- release workflow 很長，可能有維護成本。

## 待驗證
- `append` / `prepend` 是否真的未支援。
- hash 是否真的只有 2 碼且忽略行尾空白。
- build / package 是否存在可簡化或一致性問題。

## 已驗證
- `src/tools/hashline-edit.ts:59-62`：執行時只有 `replace` 被接受；任何 `append`/`prepend` 都會直接回傳 `unsupported edit operation`。
- `src/tools/hashline-edit.ts:103-107`：tool schema 仍公開 `replace` / `append` / `prepend` 三種 op，與實作不一致。
- `src/hashline/hash.ts:5-17`：hash 只取 2 個字元，且內容在計算前會 `trimEnd()`，代表尾端空白差異不會進入 hash。
- `src/tools/hashline-edit.ts:50-87`：edit 以整檔 read/modify/write 方式處理，沒有額外 path 邊界檢查。
- `src/tools/hashline-edit.ts:23-38`：diff 為簡化版逐行比對，適合小型輸出，但對複雜變更可讀性有限。
- `tests/hashline-core.test.ts:13-80`：目前核心測試僅覆蓋格式化、read rewrite、單筆 stale edit、單筆成功 replace。
- `tests/plugin-integration.test.ts:15-46`：integration test 只驗證 tool/hook 註冊與單一 read output 重寫，未覆蓋錯誤路徑或非 read 情境。
- `README.md:5-30`：README 主要只有安裝與 release 入口，缺少 edit 能力限制與行為邊界說明。
- `.github/workflows/release.yml:79-326` + `tests/release-workflow-regression.test.ts:101-289`：release 流程雖長，但已有對關鍵 shell block 的 regression tests，代表這區塊目前受保護程度不差。
- `openspec/specs/hashline-plugin/spec.md:1-3`：Purpose 仍為 TBD，規格完整度可再提升。
- lockfile 同時存在 `bun.lock`、`.opencode/bun.lock`、`package-lock.json`，包管理訊號略顯分散。

## 驗證結果
- `bun run test`：9 pass / 0 fail。
- `bun run typecheck`：通過。
- `lsp_diagnostics`：`src/tools/hashline-edit.ts`、`src/hashline/hash.ts`、`tests/hashline-core.test.ts` 均無診斷錯誤。
- `package.json:35-37`：build/test/typecheck 腳本非常精簡；目前沒有 lint、coverage 或額外封裝檢查腳本。

## 依產品初衷重新校準
- 這個 plugin 的核心不是做泛用 edit engine，而是提供「hash-anchored、先驗證再寫入」的最小安全編輯能力。
- 因此 `replace-only` 本身不是缺點；真正的問題是 `src/tools/hashline-edit.ts:103-107` 對外宣告了 `append/prepend`，與 `:59-62` 實作不符。
- `src/hashline/hash.ts:15-17` 只外露 2 碼 token，對「拒絕 stale edit、避免 corruption」的核心承諾來說仍偏弱；這是 correctness 問題，不只是實作細節。
- `tests/hashline-core.test.ts` / `tests/plugin-integration.test.ts` 缺少對 CRLF、trailing newline、多筆 edits、delete / multi-line replace、非 read rewrite 等核心 contract 邊界的保護。
- `src/hashline/hash.ts:5-7` 的 `trimEnd()` 更像刻意 trade-off：優先減少 whitespace reproduction 問題，而非做 byte-perfect anchor；若保留，應明文化。
- `src/hashline/format.ts:3-17` 以 regex 重寫 read output，可能值得額外確認是否會誤改非目標格式；這比補泛用 edit 語意更貼近產品理念。
- 路徑邊界檢查仍重要，但優先度取決於 host 是否已保證 sandbox；若 host 已保護，這項可低於 contract/測試/hash token 強度。
