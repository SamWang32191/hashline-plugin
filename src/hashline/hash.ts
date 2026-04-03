import { createHash } from "node:crypto"

const ALPHABET = "ZPMQVRWSNKTXJBYH"
const HASH_TOKEN_LENGTH = 4

function normalizeContent(content: string): string {
  return content.replace(/\r/g, "").trimEnd()
}

export function computeLineHash(lineNumber: number, content: string): string {
  const normalized = normalizeContent(content)
  const digest = createHash("sha256")
    .update(`${lineNumber}:${normalized}`)
    .digest()

  return Array.from({ length: HASH_TOKEN_LENGTH }, (_, index) => ALPHABET[digest[index] % ALPHABET.length]).join("")
}

export function formatHashLine(lineNumber: number, content: string): string {
  return `${lineNumber}#${computeLineHash(lineNumber, content)}|${content}`
}

export function isHashReference(value: string): boolean {
  return new RegExp(`^\\d+#[A-Z]{${HASH_TOKEN_LENGTH}}$`).test(value)
}
