import { formatHashLine } from "./hash"

const READ_LINE_PATTERNS = [/^\s*(\d+):\s?(.*)$/, /^\s*(\d+)\|\s?(.*)$/]

export function rewriteReadOutput(output: string): string {
  const lines = output.split("\n")
  let sawReadLine = false

  const rewritten = lines.map((line) => {
    for (const pattern of READ_LINE_PATTERNS) {
      const match = line.match(pattern)
      if (!match) continue

      sawReadLine = true
      const lineNumber = Number(match[1])
      const content = match[2] ?? ""
      return formatHashLine(lineNumber, content)
    }

    return line
  })

  return sawReadLine ? rewritten.join("\n") : output
}
