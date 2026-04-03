import { rewriteReadOutput } from "../hashline/format"

export function createReadEnhancer() {
  return async (
    input: { tool: string },
    output: { output: unknown },
  ): Promise<void> => {
    if (input.tool !== "read") return
    if (typeof output.output !== "string") return
    output.output = rewriteReadOutput(output.output)
  }
}
