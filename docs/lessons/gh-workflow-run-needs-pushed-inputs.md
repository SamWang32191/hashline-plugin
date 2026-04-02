---
id: gh-workflow-run-needs-pushed-inputs
date: 2026-04-02
scope: project
tags:
  - github-actions
  - gh-cli
  - workflow-dispatch
  - release
  - validation
source: bug-fix
confidence: 0.5
related:
  - [[npm-pack-needs-npmignore-for-dist]]
---

# Push workflow changes before testing new workflow_dispatch inputs with gh

## Context

在為這個 repo 的 release workflow 新增 `auto-bump` input 後，先在本地完成 workflow 修改與測試，接著想直接用 `gh workflow run release.yml -f auto-bump=patch` 驗證 GitHub Actions 的 dry-run。

## Mistake

若遠端 `origin/main` 上的 workflow 還是舊版，`gh workflow run` 會依照遠端 workflow 定義驗證 `workflow_dispatch` inputs；此時就算本地 YAML 已新增新 input，CLI / API 仍會回 `422 Unexpected inputs provided`。

## Lesson

當 workflow 變更包含新的 `workflow_dispatch` inputs、input 名稱調整或 contract 改變時，必須先把 workflow commit 並 push 到目標 ref，再用 `gh workflow run` 驗證這些新 inputs。對這類變更，本地測試只能驗證 YAML 與腳本邏輯，不能代表 GitHub 遠端 dispatch contract 已更新。

## When to Apply

當修改 GitHub Actions workflow 的 `workflow_dispatch` inputs，並打算用 `gh workflow run` 或 GitHub API 立刻驗證新輸入時使用。
