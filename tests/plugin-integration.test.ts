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

  it("does not register hashline behavior when disabled", async () => {
    const hooks = await HashlinePlugin(input, { hashline_edit: false })

    expect(hooks.tool?.edit).toBeUndefined()
    expect(hooks["tool.execute.after"]).toBeDefined()

    const output = { title: "read", output: "1: hello", metadata: {} }
    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    expect(output.output).toBe("1: hello")
  })

  it("registers edit tool and rewrites read output when enabled", async () => {
    const hooks = await HashlinePlugin(input, { hashline_edit: true })

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
