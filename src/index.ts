import type { Plugin } from "@opencode-ai/plugin"
import type { ToolDefinition } from "@opencode-ai/plugin"

import { rewriteReadOutput } from "./hashline/format"
import { computeLineHash, formatHashLine } from "./hashline/hash"
import { createReadEnhancer } from "./hooks/hashline-read-enhancer"
import { createHashlineEditTool, executeHashlineEdit } from "./tools/hashline-edit"

const server: Plugin = async () => {
  const tools: Record<string, ToolDefinition> = {
    edit: createHashlineEditTool(),
  }

  return {
    tool: tools,
    "tool.execute.after": createReadEnhancer(),
  }
}

export default server

export { server }

export {
  computeLineHash,
  executeHashlineEdit,
  formatHashLine,
  rewriteReadOutput,
}
