import { formatHashLine } from "./hash"

const READ_LINE_PATTERNS = [/^\s*(\d+):\s?(.*)$/, /^\s*(\d+)\|\s?(.*)$/]
const OPENCODE_LINE_TRUNCATION_SUFFIX = "... (line truncated to 2000 chars)"
const CONTENT_OPEN_TAG = "<content>"
const CONTENT_CLOSE_TAG = "</content>"
const FILE_OPEN_TAG = "<file>"
const FILE_CLOSE_TAG = "</file>"

type ReadLine = {
  lineNumber: number
  content: string
}

function parseReadLine(line: string): ReadLine | null {
  for (const pattern of READ_LINE_PATTERNS) {
    const match = line.match(pattern)
    if (!match) continue

    return {
      lineNumber: Number(match[1]),
      content: match[2] ?? "",
    }
  }

  return null
}

function transformReadLine(line: string): string | null {
  const parsed = parseReadLine(line)
  if (!parsed) {
    return null
  }

  if (parsed.content.endsWith(OPENCODE_LINE_TRUNCATION_SUFFIX)) {
    return line
  }

  return formatHashLine(parsed.lineNumber, parsed.content)
}

function transformReadLines(lines: string[]): string[] {
  const transformed: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const transformedLine = transformReadLine(line)
    if (transformedLine === null) {
      transformed.push(...lines.slice(index))
      return transformed
    }

    transformed.push(transformedLine)
  }

  return transformed
}

function isTextFileLine(line: string): boolean {
  return parseReadLine(line) !== null
}

function transformWrappedReadLines(lines: string[], openTag: string, closeTag: string): string[] {
  const start = lines.findIndex((line) => line === openTag || line.startsWith(openTag))
  const end = lines.indexOf(closeTag)

  if (start === -1 || end === -1 || end <= start) {
    return lines
  }

  const openLine = lines[start] ?? ""
  const inlineFirst = openLine !== openTag ? openLine.slice(openTag.length) : null
  const wrappedLines = inlineFirst !== null
    ? [inlineFirst, ...lines.slice(start + 1, end)]
    : lines.slice(start + 1, end)

  if (wrappedLines.length === 0 || !isTextFileLine(wrappedLines[0] ?? "")) {
    return lines
  }

  const prefix = inlineFirst !== null ? [...lines.slice(0, start), openTag] : lines.slice(0, start + 1)
  const rewritten = transformReadLines(wrappedLines)

  return [...prefix, ...rewritten, ...lines.slice(end)]
}

function transformPlainReadLines(lines: string[]): string[] {
  if (!isTextFileLine(lines[0] ?? "")) {
    return lines
  }

  return transformReadLines(lines)
}

export function rewriteReadOutput(output: string): string {
  const lines = output.split("\n")

  const transformedLines = transformWrappedReadLines(lines, CONTENT_OPEN_TAG, CONTENT_CLOSE_TAG)
  if (transformedLines !== lines) {
    return transformedLines.join("\n")
  }

  const transformedWithFile = transformWrappedReadLines(lines, FILE_OPEN_TAG, FILE_CLOSE_TAG)
  if (transformedWithFile !== lines) {
    return transformedWithFile.join("\n")
  }

  return isTextFileLine(lines[0] ?? "") ? transformPlainReadLines(lines).join("\n") : output
}
