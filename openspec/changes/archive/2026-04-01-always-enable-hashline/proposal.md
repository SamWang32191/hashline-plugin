## Why

目前 hashline plugin 需要透過 `hashline_edit` 與 `hooks.hashline_read_enhancer` 設定才會啟用主要能力，讓基本可用路徑多出一層不必要的開關判斷。既然這個 plugin 的核心價值就是提供 hashline read/edit 能力，應該改成載入後直接可用，降低設定成本並讓規格與預設行為一致。

## What Changes

- 移除 hashline plugin 對 `hashline_edit` 與 `hooks.hashline_read_enhancer` 啟用開關的依賴，改為載入後一律註冊 edit tool 與 read enhancement hook。
- **BREAKING**：調整 plugin configuration 契約，不再以 hashline-specific enable/disable flags 控制核心能力。
- 更新 capability spec、設計與任務，將 hashline 行為定義為預設且固定啟用，而不是可選功能。
- 補齊對應的程式與測試調整範圍，確保整體行為、文件與驗證案例同步。

## Capabilities

### New Capabilities

無。

### Modified Capabilities
- `hashline-plugin`: 將 hashline edit 與 read enhancement 從 configuration-gated behavior 改為 plugin 載入時固定啟用，並移除相關 enable/disable 要求。

## Impact

- 影響 `src/config.ts`、`src/index.ts`、`src/hooks/hashline-read-enhancer.ts` 等目前依賴設定開關的組裝邏輯。
- 影響 `tests/plugin-integration.test.ts` 等驗證啟用/停用行為的測試案例。
- 影響 `openspec/specs/hashline-plugin/spec.md` 與後續 delta spec，因為需求層級的設定行為會改變。
- 可能影響依賴舊設定欄位的使用方式，需要在文件中明確標示破壞性變更。
