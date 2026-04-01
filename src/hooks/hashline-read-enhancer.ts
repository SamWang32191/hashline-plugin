import { rewriteReadOutput } from "../hashline/format"

export function createReadEnhancer() {
  return async (
    input: { tool: string },
    output: { output: string },
  ): Promise<void> => {
    if (input.tool !== "read") return
    output.output = rewriteReadOutput(output.output)
  }
}
