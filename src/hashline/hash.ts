import { createHash } from "node:crypto"

const ALPHABET = "ZPMQVRWSNKTXJBYH"

function normalizeContent(content: string): string {
  return content.replace(/\r/g, "").trimEnd()
}

export function computeLineHash(lineNumber: number, content: string): string {
  const normalized = normalizeContent(content)
  const digest = createHash("sha256")
    .update(`${lineNumber}:${normalized}`)
    .digest()

  const first = ALPHABET[digest[0] % ALPHABET.length]
  const second = ALPHABET[digest[1] % ALPHABET.length]
  return `${first}${second}`
}

export function formatHashLine(lineNumber: number, content: string): string {
  return `${lineNumber}#${computeLineHash(lineNumber, content)}|${content}`
}

export function isHashReference(value: string): boolean {
  return /^\d+#[A-Z]{2}$/.test(value)
}
