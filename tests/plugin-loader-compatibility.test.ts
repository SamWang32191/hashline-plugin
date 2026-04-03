import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import HashlinePlugin, { server } from "../src/index"

type PackageJson = {
  ["oc-plugin"]?: {
    targets?: string[]
  }
}

describe("OpenCode plugin loader compatibility", () => {
  it("declares server in oc-plugin targets", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson

    expect(packageJson["oc-plugin"]).toBeDefined()
    expect(Array.isArray(packageJson["oc-plugin"]?.targets)).toBe(true)
    expect(packageJson["oc-plugin"]?.targets).toContain("server")
  })

  it("provides named server export and keeps default export", () => {
    expect(typeof HashlinePlugin).toBe("function")
    expect(typeof server).toBe("function")
    expect(server).toBe(HashlinePlugin)
  })
})
