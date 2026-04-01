## Context

目前 hashline plugin 會先讀取 `hashline_edit` 與 `hooks.hashline_read_enhancer`，再決定是否註冊 edit tool 與是否啟用 read enhancement hook。這讓 plugin 的核心能力必須依賴額外設定才能成立，也讓規格、程式與測試都帶著一條「停用模式」分支。這次 change 要把 hashline 視為 plugin 的固定能力：只要 plugin 被載入，read/edit 相關能力就應該直接可用。

## Goals / Non-Goals

**Goals:**
- 移除 hashline-specific feature toggle，讓 plugin 載入後固定註冊 edit tool 並啟用 read enhancement。
- 讓 OpenSpec requirement、程式組裝邏輯與測試案例都改成描述同一個 always-on 契約。
- 簡化目前只為了 enable/disable 分支而存在的 config 判斷與 hook gating。

**Non-Goals:**
- 不變更 hashline read output 格式、hash 計算方式或 edit mismatch 驗證規則。
- 不新增新的 plugin 設定面，也不擴充與 hashline 無關的能力。
- 不處理 plugin 載入範圍之外的開關需求；若某處不想提供 hashline 功能，應由是否載入 plugin 來決定。

## Decisions

### 1. 將 hashline 能力定義為 plugin 的固定行為
**Decision:** plugin 載入時一律註冊 `edit` tool，並一律啟用 read enhancement hook。  
**Why:** hashline 是此 plugin 的核心價值，不應要求使用者再額外開啟；這也能消除目前 enabled/disabled 兩套初始化路徑。  
**Alternatives considered:**
- 保留 toggle 但改成預設開啟：仍然留下額外設定面與停用分支，無法達成「不要有開關」的要求。
- 只固定啟用 edit tool、保留 hook 開關：read/edit 契約會被拆開，增加使用上的不一致。

### 2. 移除以設定值驅動的組裝分支
**Decision:** `src/index.ts` 與 hook 建立流程不再依賴布林開關決定是否註冊能力；舊的 hashline-specific options 不再是控制來源。  
**Why:** 目前只有 `hashline_edit` / `hooks.hashline_read_enhancer` 兩個欄位在驅動核心能力，移除後可直接簡化 plugin 組裝路徑與測試矩陣。  
**Alternatives considered:**
- 保留 `loadConfig()` 但永遠回傳 `true`：能維持介面，但實際上保留了沒有價值的抽象。
- 收到舊欄位時丟錯：雖然更嚴格，但會增加遷移摩擦，且對本次需求沒有額外收益。

### 3. 把遷移重點放在文件與驗證同步
**Decision:** delta spec、proposal、design 與測試都要明確改寫成 always-on 行為，並把舊 toggle 視為已失效的遷移項。  
**Why:** 這是契約層級的變更；若只改程式不改 spec/tests，後續容易再把 toggle 邏輯加回來。  
**Alternatives considered:**
- 只更新實作與測試、不更新 spec：會讓 OpenSpec 契約落後於實際行為。

## Risks / Trade-offs

- **[依賴舊 disable 設定的使用者會失去關閉能力]** → 在 proposal/spec 中標示 BREAKING，並明確要求改以「不要載入 plugin」作為停用方式。
- **[移除 config gating 可能讓未來新增設定時少一個既有入口]** → 只有在出現新的真實設定需求時，再重新引入有價值的 config boundary。
- **[舊測試案例若只檢查 enabled/disabled，容易留下空洞覆蓋]** → 將測試改為驗證預設 always-on 與舊欄位不再改變行為。

## Migration Plan

1. 以 delta spec 移除「configuration controls hashline behavior」需求，新增 always-on requirement。
2. 簡化 plugin 組裝邏輯，移除或停用目前只服務於 hashline toggle 的 config / hook gating 分支。
3. 更新整合測試，改成驗證 plugin 在無設定或帶舊設定時都會啟用 hashline 能力。
4. 若需要 rollback，恢復原本的 config-gated requirement、組裝分支與 disabled 測試情境。

## Open Questions

- 無；本次 change 的目標是移除開關並直接啟用，實作時依此原則收斂即可。
