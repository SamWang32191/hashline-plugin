# Hashline OpenAgent Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 `hashline-plugin` 的 read/output hash 注入與 edit metadata 行為對標 `oh-my-openagent`，能正確處理真實 OpenCode XML-style read payload，並在 edit 成功後提供完整 diff metadata。

**Architecture:** 保留目前 repo 的精簡結構，只在 `src/hashline/format.ts` 補上 wrapper-aware parsing、在 `src/hooks/hashline-read-enhancer.ts` 補型別守門、在 `src/tools/hashline-edit.ts` 補 rich metadata。先用失敗測試鎖住真實 payload，再做最小實作，最後用 `bun test`、`typecheck`、`build` 驗證不回歸。

**Tech Stack:** TypeScript, Bun, Bun test, @opencode-ai/plugin

---

## File Map

- Modify: `tests/plugin-integration.test.ts`
  - 補真實 `<content>` / `<file>` / truncation read payload regression tests
- Modify: `src/hashline/format.ts`
  - 將 plain-text formatter 升級成 wrapper-aware read output transformer
- Modify: `src/hooks/hashline-read-enhancer.ts`
  - 對 `output.output` 做 string guard，避免非字串 payload 被誤改
- Modify: `tests/hashline-core.test.ts`
  - 補 edit rich metadata regression tests
- Modify: `src/tools/hashline-edit.ts`
  - 為成功 edit 建立 `path/file/filePath/diff/firstChangedLine/filediff` metadata

### Task 1: 先用真實 read payload 建立失敗測試

**Files:**
- Modify: `tests/plugin-integration.test.ts`
- Read for reference: `docs/superpowers/specs/2026-04-03-hashline-openagent-alignment-design.md`

- [ ] **Step 1: 把 `tests/plugin-integration.test.ts` 改成下面這份內容**

```ts
import { describe, expect, it } from "bun:test"

import HashlinePlugin, { computeLineHash } from "../src/index"

describe("HashlinePlugin", () => {
  const input = {
    client: {} as never,
    project: {} as never,
    directory: process.cwd(),
    worktree: process.cwd(),
    serverUrl: new URL("http://localhost"),
    $: {} as never,
  }

  it("registers hashline behavior with default options", async () => {
    const hooks = await HashlinePlugin(input)

    expect(hooks.tool?.edit).toBeDefined()
    expect(hooks["tool.execute.after"]).toBeDefined()

    const output = { title: "read", output: "1: hello", metadata: {} }
    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    expect(output.output).toMatch(/^1#[A-Z]{4}\|hello$/)
  })

  it("keeps hashline behavior enabled when legacy flags are provided", async () => {
    const hooks = await HashlinePlugin(input, {
      hashline_edit: false,
      hooks: { hashline_read_enhancer: false },
    })

    expect(hooks.tool?.edit).toBeDefined()
    expect(hooks["tool.execute.after"]).toBeDefined()

    const output = { title: "read", output: "1: hello", metadata: {} }
    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    expect(output.output).toMatch(/^1#[A-Z]{4}\|hello$/)
  })

  it("rewrites xml <content> read payloads from real opencode output", async () => {
    const hooks = await HashlinePlugin(input)
    const output = {
      title: "read",
      output: `<path>/Users/samwang/Repo/todo-continuation-enforcer/src/index.ts</path>
<type>file</type>
<content>1: import { createPlugin } from "./plugin/create-plugin"
2: 
3: export default createPlugin()

(End of file - total 3 lines)
</content>`,
      metadata: {},
    }

    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    expect(output.output).toContain(
      `<content>1#${computeLineHash(1, 'import { createPlugin } from "./plugin/create-plugin"')}|import { createPlugin } from "./plugin/create-plugin"`,
    )
    expect(output.output).toContain(`2#${computeLineHash(2, "")}|`)
    expect(output.output).toContain(
      `3#${computeLineHash(3, "export default createPlugin()")}|export default createPlugin()`,
    )
    expect(output.output).toContain("(End of file - total 3 lines)")
  })

  it("rewrites inline <file> wrapped output", async () => {
    const hooks = await HashlinePlugin(input)
    const output = {
      title: "read",
      output: `<file>1: alpha
2: beta
</file>`,
      metadata: {},
    }

    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    expect(output.output).toBe(`<file>
1#${computeLineHash(1, "alpha")}|alpha
2#${computeLineHash(2, "beta")}|beta
</file>`)
  })

  it("keeps truncated read lines unchanged while rewriting normal lines", async () => {
    const hooks = await HashlinePlugin(input)
    const truncated = `1: ${"x".repeat(32)}... (line truncated to 2000 chars)`
    const output = {
      title: "read",
      output: `<content>${truncated}
2: beta
</content>`,
      metadata: {},
    }

    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    expect(output.output).toContain(truncated)
    expect(output.output).toContain(`2#${computeLineHash(2, "beta")}|beta`)
  })

  it("leaves non-read output untouched", async () => {
    const hooks = await HashlinePlugin(input)
    const output = { title: "write", output: "1: hello", metadata: {} }

    await hooks["tool.execute.after"]?.(
      { tool: "write", sessionID: "s", callID: "c", args: {} },
      output,
    )

    expect(output.output).toBe("1: hello")
  })

  it("registers a replace-only edit contract", async () => {
    const hooks = await HashlinePlugin(input)
    const editSchema = ((hooks.tool?.edit as any).args.edits as any).element

    expect(editSchema.shape.op.options).toEqual(["replace"])
    expect(editSchema.safeParse({ op: "replace", lines: ["hello"] }).success).toBe(false)
    expect(editSchema.safeParse({ op: "append", pos: "1#ABCD", lines: ["hello"] }).success).toBe(false)
  })
})
```

- [ ] **Step 2: 跑 read integration test，確認新案例先失敗**

Run: `bun test tests/plugin-integration.test.ts`

Expected: FAIL，至少 `rewrites xml <content> read payloads from real opencode output` 與 `rewrites inline <file> wrapped output` 會失敗，因為目前 formatter 還不支援 wrapper-aware parsing。

- [ ] **Step 3: 提交失敗測試**

```bash
git add tests/plugin-integration.test.ts
git commit -m "test: cover real read payload hashline cases"
```

### Task 2: 實作 wrapper-aware read output 轉換

**Files:**
- Modify: `src/hashline/format.ts`
- Modify: `src/hooks/hashline-read-enhancer.ts`
- Test: `tests/plugin-integration.test.ts`
- Regression check: `tests/hashline-core.test.ts`

- [ ] **Step 1: 用下面內容完整替換 `src/hashline/format.ts`**

```ts
import { formatHashLine } from "./hash"

const COLON_READ_LINE_PATTERN = /^\s*(\d+): ?(.*)$/
const PIPE_READ_LINE_PATTERN = /^\s*(\d+)\| ?(.*)$/
const CONTENT_OPEN_TAG = "<content>"
const CONTENT_CLOSE_TAG = "</content>"
const FILE_OPEN_TAG = "<file>"
const FILE_CLOSE_TAG = "</file>"
const OPENCODE_LINE_TRUNCATION_SUFFIX = "... (line truncated to 2000 chars)"

type ParsedReadLine = {
  lineNumber: number
  content: string
}

function parseReadLine(line: string): ParsedReadLine | null {
  const colonMatch = COLON_READ_LINE_PATTERN.exec(line)
  if (colonMatch) {
    return {
      lineNumber: Number.parseInt(colonMatch[1], 10),
      content: colonMatch[2],
    }
  }

  const pipeMatch = PIPE_READ_LINE_PATTERN.exec(line)
  if (pipeMatch) {
    return {
      lineNumber: Number.parseInt(pipeMatch[1], 10),
      content: pipeMatch[2],
    }
  }

  return null
}

function isTextReadBlock(firstLine: string): boolean {
  return parseReadLine(firstLine) !== null
}

function transformLine(line: string): string {
  const parsed = parseReadLine(line)
  if (!parsed) return line
  if (parsed.content.endsWith(OPENCODE_LINE_TRUNCATION_SUFFIX)) {
    return line
  }
  return formatHashLine(parsed.lineNumber, parsed.content)
}

function transformReadLines(lines: string[]): string[] {
  const result: string[] = []

  for (const line of lines) {
    if (!parseReadLine(line)) {
      result.push(...lines.slice(result.length))
      break
    }

    result.push(transformLine(line))
  }

  return result
}

export function rewriteReadOutput(output: string): string {
  if (!output) return output

  const lines = output.split("\n")
  const contentStart = lines.findIndex((line) => line === CONTENT_OPEN_TAG || line.startsWith(CONTENT_OPEN_TAG))
  const contentEnd = lines.indexOf(CONTENT_CLOSE_TAG)
  const fileStart = lines.findIndex((line) => line === FILE_OPEN_TAG || line.startsWith(FILE_OPEN_TAG))
  const fileEnd = lines.indexOf(FILE_CLOSE_TAG)

  const blockStart = contentStart !== -1 ? contentStart : fileStart
  const blockEnd = contentStart !== -1 ? contentEnd : fileEnd
  const openTag = contentStart !== -1 ? CONTENT_OPEN_TAG : FILE_OPEN_TAG

  if (blockStart !== -1 && blockEnd !== -1 && blockEnd > blockStart) {
    const openLine = lines[blockStart] ?? ""
    const inlineFirst = openLine.startsWith(openTag) && openLine !== openTag
      ? openLine.slice(openTag.length)
      : null
    const blockLines = inlineFirst !== null
      ? [inlineFirst, ...lines.slice(blockStart + 1, blockEnd)]
      : lines.slice(blockStart + 1, blockEnd)

    if (!isTextReadBlock(blockLines[0] ?? "")) {
      return output
    }

    const prefixLines = inlineFirst !== null
      ? [...lines.slice(0, blockStart), openTag]
      : lines.slice(0, blockStart + 1)

    return [...prefixLines, ...transformReadLines(blockLines), ...lines.slice(blockEnd)].join("\n")
  }

  if (!isTextReadBlock(lines[0] ?? "")) {
    return output
  }

  return transformReadLines(lines).join("\n")
}
```

- [ ] **Step 2: 用下面內容完整替換 `src/hooks/hashline-read-enhancer.ts`**

```ts
import { rewriteReadOutput } from "../hashline/format"

type ToolExecuteAfterInput = {
  tool: string
}

type ToolExecuteAfterOutput = {
  output?: unknown
}

export function createReadEnhancer() {
  return async (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput,
  ): Promise<void> => {
    if (input.tool !== "read") return
    if (typeof output.output !== "string") return

    output.output = rewriteReadOutput(output.output)
  }
}
```

- [ ] **Step 3: 跑 read 相關測試，確認由紅轉綠**

Run: `bun test tests/plugin-integration.test.ts tests/hashline-core.test.ts`

Expected: PASS；新的 wrapper-aware integration tests 全通過，既有 `rewriteReadOutput("1: alpha\n2| beta\nnot-a-read-line")` regression 仍保持綠燈。

- [ ] **Step 4: 提交 read 對標實作**

```bash
git add src/hashline/format.ts src/hooks/hashline-read-enhancer.ts tests/plugin-integration.test.ts
git commit -m "feat: align read hashline output with opencode wrappers"
```

### Task 3: 先用失敗測試鎖住 edit rich metadata

**Files:**
- Modify: `tests/hashline-core.test.ts`
- Read for reference: `src/tools/hashline-edit.ts`

- [ ] **Step 1: 在 `tests/hashline-core.test.ts` 內加入下面兩個測試**

把以下兩個 `it(...)` 區塊插入在現有 edit 測試區段內（例如放在 `applies matching hashline edits and returns diff metadata` 後面）：

```ts
  it("returns rich metadata for successful edits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")

    try {
      await writeFile(filePath, "alpha\nbeta\ngamma\n")

      const result = await executeHashlineEdit({
        filePath,
        edits: [
          {
            op: "replace",
            pos: `2#${computeLineHash(2, "beta")}`,
            lines: ["BETA"],
          },
        ],
      })

      expect(result.ok).toBe(true)
      expect(result.metadata).toEqual({
        filePath,
        path: filePath,
        file: filePath,
        diff: "-beta\n+BETA",
        firstChangedLine: 2,
        filediff: {
          filePath,
          path: filePath,
          file: filePath,
          before: "alpha\nbeta\ngamma\n",
          after: "alpha\nBETA\ngamma\n",
          additions: 1,
          deletions: 1,
        },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("forwards rich metadata through the tool context", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")

    try {
      await writeFile(filePath, "alpha\nbeta\n")

      const editTool = createHashlineEditTool()
      let captured: unknown = undefined

      const message = await (editTool.execute as any)(
        {
          filePath,
          edits: [
            {
              op: "replace",
              pos: `1#${computeLineHash(1, "alpha")}`,
              lines: ["ALPHA"],
            },
          ],
        },
        {
          metadata(value: unknown) {
            captured = value
          },
        },
      )

      expect(message).toBe(`Updated ${filePath}`)
      expect(captured).toEqual({
        title: filePath,
        metadata: {
          filePath,
          path: filePath,
          file: filePath,
          diff: "-alpha\n+ALPHA",
          firstChangedLine: 1,
          filediff: {
            filePath,
            path: filePath,
            file: filePath,
            before: "alpha\nbeta\n",
            after: "ALPHA\nbeta\n",
            additions: 1,
            deletions: 1,
          },
        },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
```

- [ ] **Step 2: 先跑 core test，確認 metadata case 失敗**

Run: `bun test tests/hashline-core.test.ts`

Expected: FAIL，因為目前 `ExecuteHashlineEditResult` 沒有 `metadata`，tool context 也只回填最小 `filePath + diff`。

- [ ] **Step 3: 提交失敗測試**

```bash
git add tests/hashline-core.test.ts
git commit -m "test: lock rich hashline edit metadata"
```

### Task 4: 實作 rich edit metadata 並對齊 tool metadata

**Files:**
- Modify: `src/tools/hashline-edit.ts`
- Test: `tests/hashline-core.test.ts`

- [ ] **Step 1: 用下面內容完整替換 `src/tools/hashline-edit.ts`**

```ts
import { readFile, writeFile } from "node:fs/promises"
import { tool } from "@opencode-ai/plugin"

import { computeLineHash, isHashReference } from "../hashline/hash"

export type HashlineEdit = {
  op: "replace"
  pos: string
  lines: string[] | null
}

export type ExecuteHashlineEditInput = {
  filePath: string
  edits: HashlineEdit[]
}

export type ExecuteHashlineEditMetadata = {
  filePath: string
  path: string
  file: string
  diff: string
  firstChangedLine?: number
  filediff: {
    filePath: string
    path: string
    file: string
    before: string
    after: string
    additions: number
    deletions: number
  }
}

export type ExecuteHashlineEditResult = {
  ok: boolean
  message: string
  diff: string
  metadata?: ExecuteHashlineEditMetadata
}

function buildDiff(beforeText: string, afterText: string): string {
  const beforeLines = beforeText.replace(/\r/g, "").split("\n")
  const afterLines = afterText.replace(/\r/g, "").split("\n")
  const max = Math.max(beforeLines.length, afterLines.length)
  const chunks: string[] = []

  for (let index = 0; index < max; index += 1) {
    const beforeLine = beforeLines[index]
    const afterLine = afterLines[index]

    if (beforeLine === afterLine) continue
    if (beforeLine !== undefined) chunks.push(`-${beforeLine}`)
    if (afterLine !== undefined) chunks.push(`+${afterLine}`)
  }

  return chunks.join("\n")
}

function countLineDiffs(beforeText: string, afterText: string): { additions: number; deletions: number } {
  const beforeLines = beforeText.replace(/\r/g, "").split("\n")
  const afterLines = afterText.replace(/\r/g, "").split("\n")
  const max = Math.max(beforeLines.length, afterLines.length)
  let additions = 0
  let deletions = 0

  for (let index = 0; index < max; index += 1) {
    const beforeLine = beforeLines[index]
    const afterLine = afterLines[index]

    if (beforeLine === afterLine) continue
    if (beforeLine !== undefined) deletions += 1
    if (afterLine !== undefined) additions += 1
  }

  return { additions, deletions }
}

function findFirstChangedLine(beforeText: string, afterText: string): number | undefined {
  const beforeLines = beforeText.replace(/\r/g, "").split("\n")
  const afterLines = afterText.replace(/\r/g, "").split("\n")
  const max = Math.max(beforeLines.length, afterLines.length)

  for (let index = 0; index < max; index += 1) {
    if ((beforeLines[index] ?? "") !== (afterLines[index] ?? "")) {
      return index + 1
    }
  }

  return undefined
}

function buildSuccessMetadata(
  filePath: string,
  beforeText: string,
  afterText: string,
  diff: string,
): ExecuteHashlineEditMetadata {
  const { additions, deletions } = countLineDiffs(beforeText, afterText)

  return {
    filePath,
    path: filePath,
    file: filePath,
    diff,
    firstChangedLine: findFirstChangedLine(beforeText, afterText),
    filediff: {
      filePath,
      path: filePath,
      file: filePath,
      before: beforeText,
      after: afterText,
      additions,
      deletions,
    },
  }
}

function parsePosition(position: string): { lineNumber: number; hash: string } | null {
  if (!isHashReference(position)) return null
  const [lineNumber, hash] = position.split("#")
  return { lineNumber: Number(lineNumber), hash }
}

export async function executeHashlineEdit(
  input: ExecuteHashlineEditInput,
): Promise<ExecuteHashlineEditResult> {
  const beforeText = await readFile(input.filePath, "utf8")
  const lineEnding = beforeText.includes("\r\n") ? "\r\n" : "\n"
  const hadTrailingNewline = beforeText.endsWith(lineEnding)
  const lines = beforeText.replace(/\r/g, "").split("\n")

  if (hadTrailingNewline) {
    lines.pop()
  }

  for (const edit of input.edits) {
    if (edit.op !== "replace") {
      return { ok: false, message: "Error: unsupported edit operation", diff: "" }
    }

    const parsed = parsePosition(edit.pos)
    if (!parsed) {
      return { ok: false, message: "Error: invalid hash reference", diff: "" }
    }

    const currentLine = lines[parsed.lineNumber - 1]
    if (currentLine === undefined) {
      return { ok: false, message: "Error: line out of range", diff: "" }
    }

    const currentHash = computeLineHash(parsed.lineNumber, currentLine)
    if (currentHash !== parsed.hash) {
      return {
        ok: false,
        message: `Error: hash mismatch - expected ${parsed.lineNumber}#${currentHash}|${currentLine}`,
        diff: "",
      }
    }

    lines.splice(parsed.lineNumber - 1, 1, ...(edit.lines ?? []))
  }

  const afterText = `${lines.join(lineEnding)}${hadTrailingNewline ? lineEnding : ""}`
  await writeFile(input.filePath, afterText)

  const diff = buildDiff(beforeText, afterText)

  return {
    ok: true,
    message: `Updated ${input.filePath}`,
    diff,
    metadata: buildSuccessMetadata(input.filePath, beforeText, afterText, diff),
  }
}

export function createHashlineEditTool() {
  return tool({
    description: "Replace file lines using hashline references",
    args: {
      filePath: tool.schema.string().describe("Absolute path to the target file"),
      edits: tool.schema
        .array(
          tool.schema.object({
            op: tool.schema.enum(["replace"]),
            pos: tool.schema.string(),
            lines: tool.schema.array(tool.schema.string()).nullable(),
          }),
        )
        .describe("Replace-only hashline edits to apply"),
    },
    async execute(args, context) {
      const result = await executeHashlineEdit(args)
      if (result.ok && result.metadata) {
        context.metadata({
          title: args.filePath,
          metadata: result.metadata,
        })
      }
      return result.message
    },
  })
}
```

- [ ] **Step 2: 跑 edit/core tests，確認 rich metadata case 轉綠**

Run: `bun test tests/hashline-core.test.ts tests/plugin-integration.test.ts`

Expected: PASS；新增 metadata regression 與既有 stale hash / delete / multiline / CRLF / no-final-newline case 都保持綠燈。

- [ ] **Step 3: 提交 edit 對標實作**

```bash
git add src/tools/hashline-edit.ts tests/hashline-core.test.ts
git commit -m "feat: enrich hashline edit metadata output"
```

### Task 5: 做完整驗證

**Files:**
- Verify only: `src/hashline/format.ts`, `src/hooks/hashline-read-enhancer.ts`, `src/tools/hashline-edit.ts`, `tests/plugin-integration.test.ts`, `tests/hashline-core.test.ts`

- [ ] **Step 1: 跑完整測試**

Run: `bun test`

Expected: PASS，所有測試綠燈。

- [ ] **Step 2: 跑型別檢查**

Run: `bun run typecheck`

Expected: PASS，無 TypeScript error。

- [ ] **Step 3: 跑 build**

Run: `bun run build`

Expected: PASS，`dist/` 成功產出。

- [ ] **Step 4: 提交最終整理**

```bash
git add src/hashline/format.ts src/hooks/hashline-read-enhancer.ts src/tools/hashline-edit.ts tests/plugin-integration.test.ts tests/hashline-core.test.ts
git commit -m "feat: align hashline read and edit behavior with openagent"
```

## Self-Review Notes

- Spec coverage: read wrapper parsing、truncation handling、edit rich metadata、tool metadata forwarding、驗證命令皆已覆蓋。
- Placeholder scan: 無 `TODO` / `TBD` / 「similar to」型描述；每個 code step 都附具體內容。
- Type consistency: `ExecuteHashlineEditMetadata`、`result.metadata`、`context.metadata({ title, metadata })` 在 Task 3 / Task 4 使用同一組名稱。
