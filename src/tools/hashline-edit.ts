import { createTwoFilesPatch } from "diff"
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

export type ExecuteHashlineEditResult = {
  ok: boolean
  message: string
  diff: string
  metadata?: {
    filePath: string
    path: string
    file: string
    diff: string
    firstChangedLine: number
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
}

function buildDiff(beforeText: string, afterText: string, filePath: string): string {
  const diff = beforeText === afterText
    ? ""
    : createTwoFilesPatch(filePath, filePath, beforeText, afterText, undefined, undefined, {
      context: 3,
    })

  return diff
}

function applyHashlineEditsAndCountDiffs(
  lines: string[],
  edits: HashlineEdit[],
): {
  additions: number
  deletions: number
  firstChangedLine: number
} {
  let additions = 0
  let deletions = 0
  let firstChangedLine = 0

  for (const edit of edits) {
    if (edit.op !== "replace") {
      throw new Error("unsupported edit operation")
    }

    const parsed = parsePosition(edit.pos)
    if (!parsed) {
      throw new Error("invalid hash reference")
    }

    const currentLine = lines[parsed.lineNumber - 1]
    if (currentLine === undefined) {
      throw new Error("line out of range")
    }

    const currentHash = computeLineHash(parsed.lineNumber, currentLine)
    if (currentHash !== parsed.hash) {
      throw new Error(`hash mismatch - expected ${parsed.lineNumber}#${currentHash}|${currentLine}`)
    }

    const replacementLines = edit.lines ?? []
    const isNoop = replacementLines.length === 1 && replacementLines[0] === currentLine

    if (!isNoop) {
      firstChangedLine = firstChangedLine === 0
        ? parsed.lineNumber
        : Math.min(firstChangedLine, parsed.lineNumber)
      additions += replacementLines.length
      deletions += 1
    }

    lines.splice(parsed.lineNumber - 1, 1, ...replacementLines)
  }

  return {
    additions,
    deletions,
    firstChangedLine: firstChangedLine === 0 ? 0 : firstChangedLine,
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

  const editStats = {
    additions: 0,
    deletions: 0,
    firstChangedLine: 0,
  }

  try {
    const updated = applyHashlineEditsAndCountDiffs(lines, input.edits)
    Object.assign(editStats, updated)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "unsupported edit operation") {
        return { ok: false, message: "Error: unsupported edit operation", diff: "" }
      }
      if (error.message === "invalid hash reference") {
        return { ok: false, message: "Error: invalid hash reference", diff: "" }
      }
      if (error.message === "line out of range") {
        return { ok: false, message: "Error: line out of range", diff: "" }
      }
      if (error.message.startsWith("hash mismatch")) {
        return {
          ok: false,
          message: `Error: ${error.message}`,
          diff: "",
        }
      }
    }
    throw error
  }

  const afterText = `${lines.join(lineEnding)}${hadTrailingNewline ? lineEnding : ""}`
  const fileDiff = buildDiff(beforeText, afterText, input.filePath)
  await writeFile(input.filePath, afterText)

  const finalAdditions = beforeText === afterText ? 0 : editStats.additions
  const finalDeletions = beforeText === afterText ? 0 : editStats.deletions
  const finalFirstChangedLine = beforeText === afterText ? 0 : editStats.firstChangedLine

  const metadata = {
    filePath: input.filePath,
    path: input.filePath,
    file: input.filePath,
    diff: fileDiff,
    firstChangedLine: finalFirstChangedLine,
    filediff: {
        filePath: input.filePath,
        path: input.filePath,
        file: input.filePath,
        before: beforeText,
        after: afterText,
        additions: finalAdditions,
        deletions: finalDeletions,
      },
  }

  return {
    ok: true,
    message: `Updated ${input.filePath}`,
    diff: fileDiff,
    metadata,
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
      if (result.ok) {
        context.metadata({
          title: args.filePath,
          metadata: result.metadata,
        })
      }
      return result.message
    },
  })
}
