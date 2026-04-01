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

    expect(output.output).toMatch(/^1#[A-Z]{2}\|hello$/)
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

    expect(output.output).toMatch(/^1#[A-Z]{2}\|hello$/)
  })
})
