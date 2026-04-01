import type { Plugin } from "@opencode-ai/plugin"
import type { ToolDefinition } from "@opencode-ai/plugin"

import { loadConfig } from "./config"
import { rewriteReadOutput } from "./hashline/format"
import { computeLineHash, formatHashLine } from "./hashline/hash"
import { createReadEnhancer } from "./hooks/hashline-read-enhancer"
import { createHashlineEditTool, executeHashlineEdit } from "./tools/hashline-edit"

const HashlinePlugin: Plugin = async (_input, options) => {
  const config = loadConfig(options)
  const tools: Record<string, ToolDefinition> = {}

  if (config.hashlineEditEnabled) {
    tools.edit = createHashlineEditTool()
  }

  return {
    tool: tools,
    "tool.execute.after": createReadEnhancer(config.readEnhancerEnabled),
  }
}

export default HashlinePlugin

export {
  computeLineHash,
  executeHashlineEdit,
  formatHashLine,
  rewriteReadOutput,
}
