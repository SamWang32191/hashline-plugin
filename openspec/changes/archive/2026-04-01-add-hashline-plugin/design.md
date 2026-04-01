## Context

目前 repo 幾乎只有 OpenSpec 流程骨架與 `.opencode` 內的最小 plugin 相依，尚未有正式程式碼結構。參考 `.ref/oh-my-openagent` 可確認 hashline 相關能力主要由四個部位組成：plugin 入口初始化、設定載入與 schema、tool registry / hooks 串接、以及 hashline-aware read/edit 模組。這次設計需要在不複製整個參考專案的前提下，萃取出可獨立運作的最小子集。

第一版的技術限制也很明確：目前 repo 尚未發現既有 build、typecheck、test script，因此設計必須把實作切成容易逐步驗證的模組；同時要保留未來擴充更多 hooks 或工具的空間。

## Goals / Non-Goals

**Goals:**
- 建立一個可載入的 hashline plugin 入口，採用清楚的初始化順序：config → tools → hooks → plugin interface。
- 提供 hashline-aware read enhancement，讓讀取輸出能包含穩定的 `line#hash|content` 表示法，作為後續精準編輯的依據。
- 提供 hashline edit 工具，支援以 hashline 為基準做內容修改、rename/delete 等操作，並在 hash mismatch 時回傳可行動的錯誤。
- 提供最小設定能力，讓使用者能啟用/停用 hashline edit 與相關 hook。
- 讓第一版設計與 capability spec 對齊，便於後續直接落成實作與測試。

**Non-Goals:**
- 不複製 `.ref/oh-my-openagent` 中與 hashline 無直接關係的 command 系統、agent 配置、builtin commands 或額外 manager。
- 不在第一版加入多 provider、多 plugin 組合、遠端同步或 secrets 管理。
- 不追求完整相容參考 repo 的所有 metadata 欄位；只保留 hashline edit 成功與失敗路徑所需的最小集合。

## Decisions

### 1. 採用精簡版 plugin 組裝骨架
**Decision:** 以單一 plugin 入口模組組裝 config、tool registry、hook registry 與 plugin interface。  
**Why:** 參考 repo 已證明這種初始化順序能把設定、工具與 hook 責任清楚分離，適合在綠地 repo 先建立穩定邊界。  
**Alternatives considered:**
- 把所有邏輯先塞進單一檔案：起步快，但很快會讓 read/edit 與 hook 邊界糾纏，不利後續擴充。
- 直接完整複製 reference repo 結構：風險最低，但會把大量與 hashline 無關的模組一起帶進來，超出第一版範圍。

### 2. Hashline read enhancement 與 edit tool 分成兩個模組
**Decision:** 讀取輸出轉換與編輯執行分離，前者透過 hook 套用，後者透過工具註冊提供。  
**Why:** read enhancement 的責任是讓代理拿到穩定定位資訊；edit tool 的責任是驗證與修改檔案。把兩者分開，才能獨立測試輸出格式與編輯邏輯。  
**Alternatives considered:**
- 由 edit tool 自己兼做 read 格式轉換：會讓工具職責混雜，也難以支援一般 read 工具的輸出一致性。

### 3. 設定採最小 schema，先只暴露 hashline 相關開關
**Decision:** 初版 config 僅定義 `hashline_edit` 與必要的 hook disable/experimental 欄位。  
**Why:** 目前 repo 沒有既有設定慣例，先把可觀察、可驗證的開關做清楚，比提早引入整包 configuration surface 更穩妥。  
**Alternatives considered:**
- 一次導入參考 repo 全部 schema：可擴充性高，但會把未實作能力也暴露出去，造成規格與實作失真。

### 4. Hashline mismatch 視為第一級錯誤路徑
**Decision:** edit tool 必須在 hashline 不匹配時拒絕修改，並回傳明確錯誤訊息與修正指引。  
**Why:** hashline 的價值就是避免陳舊上下文導致錯編；若 mismatch 時仍嘗試套 patch，會破壞整個能力的可信度。  
**Alternatives considered:**
- mismatch 時嘗試模糊比對自動修補：可用性看似更高，但初版容易引入不可預期修改，與最小可驗證目標衝突。

## Risks / Trade-offs

- **[輸出格式與宿主實際介面不完全貼合]** → 先把 read enhancement 與 edit tool 都定義成可單元測試的純函式/小模組，降低與宿主綁定風險。
- **[初版 schema 過小，未來擴充可能調整欄位]** → 保留 `experimental` 與 hook 控制欄位，讓之後能擴充而不必推翻入口組裝方式。
- **[參考 repo 使用的 metadata/diff 格式過於完整，初版縮減可能影響後續代理體驗]** → 先保證 success/failure 與基本 diff 可用，未來再以增量規格擴充 metadata。
- **[目前 repo 缺少明確 build/test 慣例]** → 在 tasks 中顯式加入工具鏈與驗證步驟，避免實作時才補流程。

## Migration Plan

1. 先建立 capability spec，固定 plugin、read enhancement、edit tool、config 的行為契約。
2. 依 spec 建立最小程式骨架與測試入口。
3. 先驗證純邏輯模組（hashline 格式化、驗證、diff），再串接 plugin interface。
4. 若宿主介面與假設不符，保留 rollback 為「退回只有 spec/proposal/design/tasks，暫不宣告可用實作」。

## Open Questions

- plugin 的正式封裝與發佈位置是否應落在 repo 根目錄，或維持 `.opencode` 作為開發環境輔助目錄，需在實作前確認。
- 第一版是否需要完全對齊參考 repo 的回傳 metadata 欄位名稱，或只保留 diff/錯誤訊息即可，需在實作時對宿主需求再驗證。
