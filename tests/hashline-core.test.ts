import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  computeLineHash,
  executeHashlineEdit,
  formatHashLine,
  rewriteReadOutput,
} from "../src/index"
import { createHashlineEditTool } from "../src/tools/hashline-edit"

describe("hashline core", () => {
  it("formats read lines as line#hash|content", () => {
    const formatted = formatHashLine(3, "hello world")

    expect(formatted).toMatch(/^3#[A-Z]{4}\|hello world$/)
    expect(computeLineHash(3, "hello world")).toHaveLength(4)
  })

  it("exposes a replace-only edit schema with required positions", () => {
    const editTool = createHashlineEditTool()
    const editSchema = (editTool.args.edits as any).element

    expect(editSchema.shape.op.options).toEqual(["replace"])
    expect(editSchema.safeParse({ op: "replace", lines: ["ALPHA"] }).success).toBe(false)
    expect(editSchema.safeParse({ op: "append", pos: "1#ABCD", lines: ["ALPHA"] }).success).toBe(false)
  })

  it("rewrites supported read output and preserves unsupported lines", () => {
    const rewritten = rewriteReadOutput("1: alpha\n2| beta\nnot-a-read-line")

    expect(rewritten).toContain("1#")
    expect(rewritten).toContain("2#")
    expect(rewritten).toContain("not-a-read-line")
  })

  it("rewrites read output with normalized hashes while preserving visible content", () => {
    const rewritten = rewriteReadOutput("1: alpha   ")

    expect(rewritten).toBe(`1#${computeLineHash(1, "alpha")}|alpha   `)
  })

  it("rejects stale hashline edits without modifying the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")

    try {
      await writeFile(filePath, "alpha\nbeta\n")

      const result = await executeHashlineEdit({
        filePath,
        edits: [
          {
            op: "replace",
            pos: "1#ZZZZ",
            lines: ["ALPHA"],
          },
        ],
      })

      expect(result.ok).toBe(false)
      expect(result.message).toContain("hash mismatch")
      expect(await readFile(filePath, "utf8")).toBe("alpha\nbeta\n")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("applies matching hashline edits and returns unified diff", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")

    try {
      await writeFile(filePath, "alpha\nbeta\n")

      const result = await executeHashlineEdit({
        filePath,
        edits: [
          {
            op: "replace",
            pos: `1#${computeLineHash(1, "alpha")}`,
            lines: ["ALPHA"],
          },
        ],
      })

      expect(result.ok).toBe(true)
      expect(result.diff).toContain(`--- ${filePath}`)
      expect(result.diff).toContain(`+++ ${filePath}`)
      expect(result.diff).toContain("@@")
      expect(result.diff).toContain("-alpha")
      expect(result.diff).toContain("+ALPHA")
      expect(result.metadata?.diff).toContain(`--- ${filePath}`)
      expect(result.metadata?.diff).toContain(`+++ ${filePath}`)
      expect(await readFile(filePath, "utf8")).toBe("ALPHA\nbeta\n")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("executeHashlineEdit returns rich metadata on success", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")
    const beforeText = "alpha\nbeta\n"
    const afterText = "alpha\nBETA\n"
    const expectedMetadata = {
      filePath,
      path: filePath,
      file: filePath,
      firstChangedLine: 2,
      filediff: {
        filePath,
        path: filePath,
        file: filePath,
        before: beforeText,
        after: afterText,
        additions: 1,
        deletions: 1,
      },
    }

    try {
      await writeFile(filePath, beforeText)

      const result = (await executeHashlineEdit({
        filePath,
        edits: [
          {
            op: "replace",
            pos: `2#${computeLineHash(2, "beta")}`,
            lines: ["BETA"],
          },
        ],
      }) as any)

      expect(result.ok).toBe(true)
      expect(result.metadata).toMatchObject(expectedMetadata)
      expect(result.metadata?.diff).toContain(`--- ${filePath}`)
      expect(result.metadata?.diff).toContain(`+++ ${filePath}`)
      expect(result.metadata?.diff).toContain("-beta")
      expect(result.metadata?.diff).toContain("+BETA")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("is no-op when replacement lines are unchanged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")
    const beforeText = "alpha\nbeta\n"
    const expectedMetadata = {
      filePath,
      path: filePath,
      file: filePath,
      diff: "",
      firstChangedLine: 0,
      filediff: {
        filePath,
        path: filePath,
        file: filePath,
        before: beforeText,
        after: beforeText,
        additions: 0,
        deletions: 0,
      },
    }

    try {
      await writeFile(filePath, beforeText)

      const result = await executeHashlineEdit({
        filePath,
        edits: [
          {
            op: "replace",
            pos: `2#${computeLineHash(2, "beta")}`,
            lines: ["beta"],
          },
        ],
      })

      expect(result.ok).toBe(true)
      expect(result.diff).toBe("")
      expect(result.metadata).toEqual(expectedMetadata)
      expect(await readFile(filePath, "utf8")).toBe(beforeText)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("supports deleting an anchored line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")
    const beforeText = "alpha\nbeta\ngamma\n"
    const afterText = "alpha\ngamma\n"
    const expectedMetadata = {
      filePath,
      path: filePath,
      file: filePath,
      firstChangedLine: 2,
      filediff: {
        filePath,
        path: filePath,
        file: filePath,
        before: beforeText,
        after: afterText,
        additions: 0,
        deletions: 1,
      },
    }

    try {
      await writeFile(filePath, beforeText)

      const result = await executeHashlineEdit({
        filePath,
        edits: [
          {
            op: "replace",
            pos: `2#${computeLineHash(2, "beta")}`,
            lines: null,
          },
        ],
      })

      expect(result.ok).toBe(true)
      expect(result.metadata).toMatchObject(expectedMetadata)
      expect(result.metadata?.diff).toContain(`--- ${filePath}`)
      expect(result.metadata?.diff).toContain(`+++ ${filePath}`)
      expect(result.metadata?.diff).toContain("-beta")
      expect(await readFile(filePath, "utf8")).toBe("alpha\ngamma\n")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("forwards rich metadata from createHashlineEditTool", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")
    const beforeText = "alpha\nbeta\n"
    const afterText = "ALPHA\nbeta\n"
    const expectedMetadata = {
      filePath,
      path: filePath,
      file: filePath,
      firstChangedLine: 1,
      filediff: {
        filePath,
        path: filePath,
        file: filePath,
        before: beforeText,
        after: afterText,
        additions: 1,
        deletions: 1,
      },
    }
    const observedMetadata: unknown[] = []

    try {
      await writeFile(filePath, beforeText)

      const editTool = createHashlineEditTool() as any
      const result = await editTool.execute(
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
          metadata: (payload: unknown) => {
            observedMetadata.push(payload)
          },
        },
      )

      expect(result).toBe(`Updated ${filePath}`)
      expect(observedMetadata).toHaveLength(1)

      const metadataPayload = observedMetadata[0] as {
        title?: string
        metadata?: Record<string, unknown>
      }

      expect(metadataPayload).toMatchObject({
        title: filePath,
        metadata: expectedMetadata,
      })

      const actualMetadata = metadataPayload.metadata as {
        diff?: string
      }
      expect(actualMetadata.diff).toContain(`--- ${filePath}`)
      expect(actualMetadata.diff).toContain(`+++ ${filePath}`)
      expect(actualMetadata.diff).toContain("-alpha")
      expect(actualMetadata.diff).toContain("+ALPHA")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("supports replacing one anchored line with multiple lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")
    const beforeText = "alpha\nbeta\ngamma\n"
    const afterText = "alpha\nBETA\nbeta-2\ngamma\n"
    const expectedMetadata = {
      filePath,
      path: filePath,
      file: filePath,
      firstChangedLine: 2,
      filediff: {
        filePath,
        path: filePath,
        file: filePath,
        before: beforeText,
        after: afterText,
        additions: 2,
        deletions: 1,
      },
    }

    try {
      await writeFile(filePath, beforeText)

      const result = await executeHashlineEdit({
        filePath,
        edits: [
          {
            op: "replace",
            pos: `2#${computeLineHash(2, "beta")}`,
            lines: ["BETA", "beta-2"],
          },
        ],
      })

      expect(result.ok).toBe(true)
      expect(result.metadata).toMatchObject(expectedMetadata)
      expect(result.metadata?.diff).toContain(`--- ${filePath}`)
      expect(result.metadata?.diff).toContain(`+++ ${filePath}`)
      expect(result.metadata?.diff).toContain("-beta")
      expect(result.metadata?.diff).toContain("+BETA")
      expect(await readFile(filePath, "utf8")).toBe("alpha\nBETA\nbeta-2\ngamma\n")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("uses the earliest changed line across out-of-order edits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")
    const beforeText = "alpha\nbeta\ngamma\ndelta\n"
    const afterText = "alpha\nBETA\ngamma\nDELTA\n"
    const expectedMetadata = {
      filePath,
      path: filePath,
      file: filePath,
      firstChangedLine: 2,
      filediff: {
        filePath,
        path: filePath,
        file: filePath,
        before: beforeText,
        after: afterText,
        additions: 2,
        deletions: 2,
      },
    }

    try {
      await writeFile(filePath, beforeText)

      const result = (await executeHashlineEdit({
        filePath,
        edits: [
          {
            op: "replace",
            pos: `4#${computeLineHash(4, "delta")}`,
            lines: ["DELTA"],
          },
          {
            op: "replace",
            pos: `2#${computeLineHash(2, "beta")}`,
            lines: ["BETA"],
          },
        ],
      }) as any)

      expect(result.ok).toBe(true)
      expect(result.metadata).toMatchObject(expectedMetadata)
      expect(await readFile(filePath, "utf8")).toBe(afterText)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("preserves CRLF line endings and trailing final newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")

    try {
      await writeFile(filePath, "alpha\r\nbeta\r\n")

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
      expect(await readFile(filePath, "utf8")).toBe("alpha\r\nBETA\r\n")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("preserves missing trailing final newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hashline-plugin-"))
    const filePath = join(dir, "example.txt")

    try {
      await writeFile(filePath, "alpha\nbeta")

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
      expect(await readFile(filePath, "utf8")).toBe("alpha\nBETA")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
