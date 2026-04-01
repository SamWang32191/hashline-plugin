import { rewriteReadOutput } from "../hashline/format"

export function createReadEnhancer(enabled: boolean) {
  return async (
    input: { tool: string },
    output: { output: string },
  ): Promise<void> => {
    if (!enabled || input.tool !== "read") return
    output.output = rewriteReadOutput(output.output)
  }
}
