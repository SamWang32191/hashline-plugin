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

  it("rewrites wrapped <content> read output", async () => {
    const hooks = await HashlinePlugin(input)

    expect(hooks.tool?.edit).toBeDefined()
    expect(hooks["tool.execute.after"]).toBeDefined()

    const output = {
      title: "read",
      output: [
        "<path>/tmp/demo.ts</path>",
        "<type>file</type>",
        "<content>",
        "1: const x = 1",
        "2: const y = 2",
        "",
        "(End of file - total 2 lines)",
        "</content>",
      ].join("\n"),
      metadata: {},
    }
    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    const lines = output.output.split("\n")
    expect(lines).toEqual([
      "<path>/tmp/demo.ts</path>",
      "<type>file</type>",
      "<content>",
      expect.stringMatching(/^1#[A-Z]{4}\|const x = 1$/),
      expect.stringMatching(/^2#[A-Z]{4}\|const y = 2$/),
      "",
      "(End of file - total 2 lines)",
      "</content>",
    ])
  })

  it("rewrites inline <content> read output", async () => {
    const hooks = await HashlinePlugin(input, {
      hashline_edit: false,
      hooks: { hashline_read_enhancer: false },
    })

    expect(hooks.tool?.edit).toBeDefined()
    expect(hooks["tool.execute.after"]).toBeDefined()

    const output = {
      title: "read",
      output: [
        "<path>/tmp/demo.ts</path>",
        "<type>file</type>",
        "<content>1: const x = 1",
        "2: const y = 2",
        "",
        "(End of file - total 2 lines)",
        "</content>",
      ].join("\n"),
      metadata: {},
    }
    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    const lines = output.output.split("\n")
    expect(lines).toEqual([
      "<path>/tmp/demo.ts</path>",
      "<type>file</type>",
      "<content>",
      expect.stringMatching(/^1#[A-Z]{4}\|const x = 1$/),
      expect.stringMatching(/^2#[A-Z]{4}\|const y = 2$/),
      "",
      "(End of file - total 2 lines)",
      "</content>",
    ])
  })

  it("rewrites inline <file> read output", async () => {
    const hooks = await HashlinePlugin(input)

    const output = {
      title: "read",
      output: [
        "<path>/tmp/demo.ts</path>",
        "<type>file</type>",
        "<file>00001| const x = 1",
        "00002| const y = 2",
        "",
        "(End of file - total 2 lines)",
        "</file>",
      ].join("\n"),
      metadata: {},
    }
    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    const lines = output.output.split("\n")
    expect(lines).toEqual([
      "<path>/tmp/demo.ts</path>",
      "<type>file</type>",
      "<file>",
      expect.stringMatching(/^1#[A-Z]{4}\|const x = 1$/),
      expect.stringMatching(/^2#[A-Z]{4}\|const y = 2$/),
      "",
      "(End of file - total 2 lines)",
      "</file>",
    ])
  })

  it("rewrites inline read output while keeping truncation placeholder", async () => {
    const hooks = await HashlinePlugin(input)
    const truncated = `${"x".repeat(60)}... (line truncated to 2000 chars)`

    const output = {
      title: "read",
      output: [
        "<content>1: " + truncated,
        "2: normal line",
        "",
        "(End of file - total 2 lines)",
        "</content>",
      ].join("\n"),
      metadata: {},
    }
    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s", callID: "c", args: {} },
      output,
    )

    const lines = output.output.split("\n")
    expect(lines).toEqual([
      "<content>",
      "1: " + truncated,
      expect.stringMatching(/^2#[A-Z]{4}\|normal line$/),
      "",
      "(End of file - total 2 lines)",
      "</content>",
    ])
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
