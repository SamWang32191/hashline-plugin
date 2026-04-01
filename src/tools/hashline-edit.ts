import { readFile, writeFile } from "node:fs/promises"
import { tool } from "@opencode-ai/plugin"

import { computeLineHash, isHashReference } from "../hashline/hash"

export type HashlineEdit = {
  op: "replace" | "append" | "prepend"
  pos?: string
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
    if (edit.op !== "replace" || !edit.pos) {
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

  return {
    ok: true,
    message: `Updated ${input.filePath}`,
    diff: buildDiff(beforeText, afterText),
  }
}

export function createHashlineEditTool() {
  return tool({
    description: "Edit a file using hashline references",
    args: {
      filePath: tool.schema.string().describe("Absolute path to the target file"),
      edits: tool.schema
        .array(
          tool.schema.object({
            op: tool.schema.enum(["replace", "append", "prepend"]),
            pos: tool.schema.string().optional(),
            lines: tool.schema.array(tool.schema.string()).nullable(),
          }),
        )
        .describe("Hashline edits to apply"),
    },
    async execute(args, context) {
      const result = await executeHashlineEdit(args)
      if (result.ok) {
        context.metadata({
          title: args.filePath,
          metadata: {
            filePath: args.filePath,
            diff: result.diff,
          },
        })
      }
      return result.message
    },
  })
}
