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

describe("hashline core", () => {
  it("formats read lines as line#hash|content", () => {
    const formatted = formatHashLine(3, "hello world")

    expect(formatted).toMatch(/^3#[A-Z]{2}\|hello world$/)
    expect(computeLineHash(3, "hello world")).toHaveLength(2)
  })

  it("rewrites supported read output and preserves unsupported lines", () => {
    const rewritten = rewriteReadOutput("1: alpha\n2| beta\nnot-a-read-line")

    expect(rewritten).toContain("1#")
    expect(rewritten).toContain("2#")
    expect(rewritten).toContain("not-a-read-line")
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
            pos: "1#ZZ",
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
})
