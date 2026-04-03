---
id: npm-pack-dry-run-needs-built-dist
date: 2026-04-03
scope: project
tags:
  - npm
  - packaging
  - dry-run
  - prepack
  - dist
source: bug-fix
confidence: 0.5
related:
  - [[npm-pack-needs-npmignore-for-dist]]
---

# Build `dist/` before trusting `npm pack --dry-run --json` output

## Context

在這個 repo 驗證版本升級時，直接執行 `npm pack --dry-run --json`，輸出只包含 `LICENSE`、`README.md`、`package.json`，看起來像是 `dist/` 沒被打包。

## Mistake

把未 build 工作樹上的 `npm pack --dry-run --json` 結果，誤判成封包設定錯誤；實際上先執行 `bun run build` 後再跑同一個命令，`dist/*.d.ts` 與 `dist/index.js` 都會正常出現在 tarball 清單裡。

## Lesson

當套件的發佈內容依賴本地 build 產物時，不要直接相信未 build 狀態下的 `npm pack --dry-run --json`。先執行 build（或用等效方式確保 `dist/` 已存在）再檢查封包清單，避免把缺少 build 產物誤判成 `.npmignore` / `files` 設定問題。

## When to Apply

當 Node/TypeScript/Bun 套件用 `dist/` 作為發佈輸出，且要用 `npm pack --dry-run --json` 驗證版本發佈內容時使用。
