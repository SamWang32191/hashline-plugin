import { describe, expect, it } from "bun:test"

import HashlinePlugin from "../src/index"

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
