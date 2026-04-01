---
id: opencode-plugin-bundler-tsconfig
date: 2026-04-01
scope: project
tags:
  - opencode
  - bun
  - typescript
  - plugin
  - build
source: retrospective
confidence: 0.3
related: []
---

# OpenCode plugin root repo should use Bundler resolution with bun-types

## Context

在這個 repo 為 `@opencode-ai/plugin` 建立 root-level TypeScript plugin package，並使用 Bun 來跑測試與 build。

## Mistake

一開始把 `tsconfig.json` 設成 `module: NodeNext` / `moduleResolution: NodeNext`，而且沒有安裝 `bun-types`，導致 `tsc --noEmit` 因為缺少 Bun 型別與 ESM 副檔名規則而失敗。

## Lesson

若是以 Bun 為主的 OpenCode plugin repo，應優先使用 `moduleResolution: "Bundler"`（搭配 ESM module），並把 `bun-types` 納入 devDependencies，這樣比較符合 Bun 實際執行與測試方式，也能避免為了 NodeNext 補一堆 `.js` 副檔名。

## When to Apply

當你在綠地 repo 建立以 Bun 執行、且會直接 import `@opencode-ai/plugin` 的 TypeScript plugin 時，先用這組 tsconfig/tooling，再開始實作與驗證。
