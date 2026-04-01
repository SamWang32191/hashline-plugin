---
id: npm-pack-needs-npmignore-for-dist
date: 2026-04-01
scope: project
tags:
  - npm
  - packaging
  - gitignore
  - typescript
  - release
source: bug-fix
confidence: 0.5
related:
  - [[opencode-plugin-bundler-tsconfig]]
---

# Add `.npmignore` when published build output is ignored by `.gitignore`

## Context

在這個 repo 為 npm release 流程補齊 `dist/` 發佈設定，`package.json` 已使用 `files: ["dist", ...]`，且 build 會產生 `dist/index.d.ts` 與其他 declaration files。

## Mistake

根目錄 `.gitignore` 已忽略 `dist/`，導致 `npm pack --dry-run --json` 一開始只打包 `dist/index.js`，遺漏其他 declaration files；光靠 `files` 欄位不足以保證所有 build 產物都會被收進 tarball。

## Lesson

當 repo 會把發佈產物目錄（例如 `dist/`）加入 `.gitignore`，又要靠 `npm pack` / `npm publish` 發佈該目錄時，應加入 `.npmignore`（即使是空檔也可）來隔離 `.gitignore` 對封包內容的影響，並用 `npm pack --dry-run --json` 驗證最終清單。

## When to Apply

當 TypeScript/Bun/Node 套件在 repo 內忽略 build 產物，但 npm 發佈時仍要把這些產物（尤其 `.d.ts`）一起包進 tarball 時使用。
