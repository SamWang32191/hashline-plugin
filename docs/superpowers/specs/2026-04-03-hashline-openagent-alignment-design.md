# Hashline Plugin OpenAgent Alignment Design

## Goal

讓 `hashline-plugin` 的 hashline read / edit 行為對標 `/Users/samwang/Repo/oh-my-openagent` 目前可正常工作的 hashline-edit 流程，確保 OpenCode 真實 `read` 輸出能正確帶入 hashline，且 `edit` 成功後能提供完整 diff metadata。

## Problem Summary

- `hashline-plugin` 目前只在 `tool.execute.after` 中改寫 `output.output`，但實際 OpenCode 的 read 輸出包含 `<content>` / `<file>` wrapper，現有 formatter 只支援純 `1: text` / `1| text` 行格式。
- 在真實 payload 中，像 `<content>1: import ...` 的第一行不會被目前 regex 轉成 hashline，導致 read 轉換不完整。
- 目前 `hashline-plugin` 的 read 轉換未處理 OpenCode 的 line truncation suffix，也沒有對標參考 repo 的 wrapper-aware 解析邏輯。
- 目前 `hashline-plugin` 的 edit 成功 metadata 只回填最小 `filePath + diff`，缺少 `path` / `file` / `firstChangedLine` / `filediff.before` / `filediff.after` / `additions` / `deletions` 等參考 repo 已提供的資訊。
- 現有測試主要覆蓋簡化過的 `{ output: "1: hello" }` 情境，沒有鎖住真實 XML-style read payload，因此無法提早發現這次的行為落差。

## Non-Goals

- 不把 `hashline-plugin` 整體重構成 `oh-my-openagent` 相同的目錄結構或 plugin pipeline。
- 不導入與 hashline read / edit 對標無關的新工具、guard pipeline、formatter pipeline 或 agent orchestration。
- 不修改 `oh-my-openagent`。
- 不在本次工作中額外擴充新的 edit 操作語意；維持目前 repo 已定義的 public contract，除非參考 repo 的成功 metadata 需要補齊。

## Proposed Approach

採用「**功能對標、結構最小改動**」策略：保留 `hashline-plugin` 目前較精簡的結構，但將 read/output parsing 與 edit metadata 補齊到與 `oh-my-openagent` 等價的行為層級。

### 1. 對標 read hook 的 wrapper-aware 輸出轉換

將 `src/hashline/format.ts` 從單純逐行 regex 改寫，升級為可辨識真實 OpenCode read 輸出的 formatter，支援：

- 純文字 numbered lines：`1: text`、`1| text`
- `<content>...</content>` block
- `<file>...</file>` block
- inline `<content>1: text` / inline `<file>1: text`
- 在遇到第一個非 numbered line 後保留剩餘原文，不做破壞性重寫
- `... (line truncated to 2000 chars)` 行維持原樣，不產生 hashline

`src/hooks/hashline-read-enhancer.ts` 仍維持 `tool.execute.after` 掛點，但只負責判斷 `input.tool === "read"` 後呼叫新的 wrapper-aware formatter，避免 hook 層承擔解析細節。

### 2. 對標 edit 成功 metadata

擴充 `src/tools/hashline-edit.ts` 的成功回傳 metadata，使其至少提供與參考 repo 等價的欄位：

- `filePath`
- `path`
- `file`
- `diff`
- `firstChangedLine`
- `filediff.before`
- `filediff.after`
- `filediff.additions`
- `filediff.deletions`

若目前已有 `noopEdits`、`deduplicatedEdits` 等欄位，會保留既有資訊，不回退現有能力。

### 3. 保持目前 public contract，但補齊參考 repo 的關鍵相容行為

本次不直接搬移 `oh-my-openagent` 的整套 plugin pipeline；只對齊真正影響 caller 行為的部分：

- read 後看到的 hashline 格式
- XML wrapper 情境的正確處理
- truncation 行不產生 hash
- edit 後 metadata/diff 的完整度
- stale hash mismatch / no-op / multiline replace / delete 等既有 contract 仍維持可驗證

### 4. 用真實 payload 測試鎖住相容性

測試改為直接覆蓋真實觀察到的 read payload 型態，而不是只測最小化字串。

至少新增或擴充以下案例：

- `tool.execute.after` 收到 `<content>1: ...` 時，所有可轉換行都要變成 `line#HASH|content`
- `<file>...</file>` 包裝也要正確轉換
- inline `<content>` / `<file>` 第一行要正確轉換
- truncation suffix 行不能被 hash 化
- 非 read tool output 仍保持不變
- edit 成功 metadata 需包含完整 diff / filediff / firstChangedLine

## Files to Change

- Modify: `src/hashline/format.ts`
- Modify: `src/hooks/hashline-read-enhancer.ts`
- Modify: `src/tools/hashline-edit.ts`
- Modify: `tests/plugin-integration.test.ts`
- Modify: `tests/hashline-core.test.ts`

如果為了維持清晰邊界而需要小型 helper，可新增局部 helper 檔，但優先保持目前 repo 的簡潔結構。

## Testing Strategy

採用 TDD：先補失敗測試，再做最小實作。

### Read 行為測試

在 `tests/plugin-integration.test.ts` 與必要時的 core test 裡補齊：

1. 真實 `<content>` payload 轉換
2. 真實 `<file>` payload 轉換
3. inline open tag payload 轉換
4. truncation suffix 保持原樣
5. 非 read tool 不變

### Edit 行為測試

在 `tests/hashline-core.test.ts` 補齊：

1. 成功 edit 會回填完整 metadata
2. `firstChangedLine` 正確
3. multiline replacement metadata 正確
4. delete / stale hash mismatch / no-op 既有行為不回歸

## Verification Plan

完成實作後，依序驗證：

1. `bun test`
2. `bun run typecheck`
3. `bun run build`

若本地測試全綠，代表目前 repo 的 read / edit 契約已被測試鎖住，且對標參考 repo 的關鍵 hashline 行為已具備可重現證據。

## Risks and Mitigations

- **風險：** wrapper-aware parser 改寫過度，破壞非文字 read 輸出  
  **緩解：** 僅在辨識到 numbered text lines 時啟用 hash 轉換，否則回傳原字串。

- **風險：** 轉換過程不小心改到 XML wrapper 外層內容  
  **緩解：** 僅處理 `<content>` / `<file>` 區塊內的 numbered lines，tag 外原文保留。

- **風險：** edit metadata 對齊參考 repo 時破壞既有測試假設  
  **緩解：** 採 additive 方式補欄位，不移除既有 metadata 能力。

- **風險：** read 顯示是否真的帶 hash 還受 OpenCode runtime/UI 讀取欄位影響  
  **緩解：** 本次先把 plugin 端對 `tool.execute.after` 可改寫的 payload 對齊參考 repo；若 runtime 仍未顯示，再把剩餘差異限縮到上游 UI/host 層。

## Success Criteria

- 真實 XML-style read payload 經過 plugin 後，所有可支援 numbered lines 都會變成 `<line>#<hash>|<content>`
- `<content>` / `<file>` wrapper 與 inline wrapper 情境皆可正確處理
- truncation suffix 行不會被錯誤 hash 化
- edit 成功 metadata 至少包含參考 repo 的核心 diff / filediff / firstChangedLine 資訊
- `bun test`、`bun run typecheck`、`bun run build` 全通過
