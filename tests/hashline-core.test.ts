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

  it("applies matching hashline edits and returns diff metadata", async () => {
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
      expect(result.diff).toContain("-alpha")
      expect(result.diff).toContain("+ALPHA")
      expect(await readFile(filePath, "utf8")).toBe("ALPHA\nbeta\n")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("supports deleting an anchored line", async () => {
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
            lines: null,
          },
        ],
      })

      expect(result.ok).toBe(true)
      expect(await readFile(filePath, "utf8")).toBe("alpha\ngamma\n")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("supports replacing one anchored line with multiple lines", async () => {
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
            lines: ["BETA", "beta-2"],
          },
        ],
      })

      expect(result.ok).toBe(true)
      expect(await readFile(filePath, "utf8")).toBe("alpha\nBETA\nbeta-2\ngamma\n")
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
