## Why

目前這個 repo 只有 OpenSpec 與最小 plugin 相依骨架，還沒有真正可用的 plugin 實作。參考 `.ref/oh-my-openagent` 可看出 hashline 流程已經有可驗證的設計，因此現在先把需求收斂成正式 change，能讓後續實作聚焦在最小可用的 hashline plugin，而不是一開始就複製整個參考專案。

## What Changes

- 新增一個以 hashline 為核心能力的 plugin 提案，定義初始化骨架、設定載入、工具註冊與 hook 掛載點。
- 定義 hashline-aware read/output 行為，讓讀取結果能產生穩定的行號與 hashline 標記格式。
- 定義 hashline edit 工具行為，支援依 hashline 進行編輯、驗證 mismatch，並回傳可供代理使用的 diff 與錯誤訊息。
- 定義 plugin 設定能力，至少支援啟用/停用 hashline edit 與相關 hook 的控制。
- 明確限制第一版範圍為最小可行 hashline plugin，不包含參考 repo 中與 hashline 無直接關聯的擴充能力。

## Capabilities

### New Capabilities
- `hashline-plugin`: 定義一個可載入的 plugin，提供 hashline-aware 的讀取、編輯、設定與 hook 整合能力。

### Modified Capabilities

無。

## Impact

- 會新增 plugin 入口、設定 schema/載入模組、tool registry、tool hooks，以及 hashline read/hashline edit 相關模組。
- 會依賴既有的 `@opencode-ai/plugin` 生態，並以目前 repo 偏向 Bun 的環境作為初始工具鏈假設。
- 會建立新的 capability spec，作為後續設計與實作任務的契約來源。
