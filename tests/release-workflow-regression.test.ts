import { describe, expect, it } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

function extractRunBlock(workflowText: string, stepName: string) {
  const lines = workflowText.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`)
  if (startIndex === -1) throw new Error(`Could not find step: ${stepName}`)

  const stepIndent = lines[startIndex].length - lines[startIndex].trimStart().length

  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const lineIndent = line.length - line.trimStart().length
    if (trimmed && lineIndent <= stepIndent && trimmed.startsWith("- name: ")) {
      endIndex = index
      break
    }
  }

  const runIndex = lines.slice(startIndex + 1, endIndex).findIndex((line) => line.trim() === "run: |")
  if (runIndex === -1) throw new Error(`Could not find run block for step: ${stepName}`)

  const runLineIndex = startIndex + 1 + runIndex
  const runLine = lines[runLineIndex]
  const runIndent = runLine.length - runLine.trimStart().length
  const scriptLines: string[] = []

  for (let index = runLineIndex + 1; index < endIndex; index += 1) {
    const line = lines[index]
    scriptLines.push(line.slice(runIndent + 2))
  }

  return scriptLines.join("\n").trimEnd()
}

function extractWorkflowDispatchInputs(workflowText: string) {
  const lines = workflowText.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === "workflow_dispatch:")
  if (startIndex === -1) throw new Error("Could not find workflow_dispatch block")

  const baseIndent = lines[startIndex].length - lines[startIndex].trimStart().length
  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const indent = line.length - line.trimStart().length
    if (trimmed && indent <= baseIndent && !trimmed.startsWith("- ")) {
      endIndex = index
      break
    }
  }

  return lines.slice(startIndex, endIndex).join("\n")
}

function extractNamedBlock(blockText: string, name: string) {
  const lines = blockText.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === `${name}:`)
  if (startIndex === -1) throw new Error(`Could not find block: ${name}`)

  const baseIndent = lines[startIndex].length - lines[startIndex].trimStart().length
  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const indent = line.length - line.trimStart().length
    if (trimmed && indent <= baseIndent && trimmed.endsWith(":")) {
      endIndex = index
      break
    }
  }

  return lines.slice(startIndex, endIndex).join("\n")
}

function extractStepBlock(workflowText: string, stepName: string) {
  const lines = workflowText.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`)
  if (startIndex === -1) throw new Error(`Could not find step: ${stepName}`)

  const stepIndent = lines[startIndex].length - lines[startIndex].trimStart().length
  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const indent = line.length - line.trimStart().length
    if (trimmed && indent <= stepIndent && trimmed.startsWith("- name: ")) {
      endIndex = index
      break
    }
  }

  return lines.slice(startIndex, endIndex).join("\n")
}

describe("release workflow regressions", () => {
  it("Read package metadata step 能成功寫出 package name / current version", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")
    const runBlock = extractRunBlock(workflowText, "Read package metadata")
    const tempDir = mkdtempSync(join(tmpdir(), "release-workflow-"))

    try {
      const scriptPath = join(tempDir, "read-package-metadata.sh")
      const outputPath = join(tempDir, "github-output.txt")
      const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; version: string }

      writeFileSync(scriptPath, `${runBlock}\n`)
      writeFileSync(outputPath, "")

      const result = spawnSync("bash", [scriptPath], {
        env: { ...process.env, GITHUB_OUTPUT: outputPath },
        encoding: "utf8",
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")
      expect(readFileSync(outputPath, "utf8")).toBe(`package_name=${packageJson.name}\ncurrent_version=${packageJson.version}\n`)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("Resolve and validate release version step 能處理 manual version、auto-bump version、缺少輸入、互斥輸入", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")

    const dispatchInputsText = extractWorkflowDispatchInputs(workflowText)
    const autoBumpInputBlock = extractNamedBlock(dispatchInputsText, "auto-bump")
    expect(autoBumpInputBlock).toContain("required: false")
    expect(autoBumpInputBlock).toContain('default: "no"')
    expect(autoBumpInputBlock).toContain("options:")
    expect(autoBumpInputBlock).toContain('- "no"')
    expect(autoBumpInputBlock).toContain('- "patch"')
    expect(autoBumpInputBlock).toContain('- "minor"')

    const versionInputBlock = extractNamedBlock(dispatchInputsText, "version")
    expect(versionInputBlock).toContain("required: false")

    const resolveStepBlock = extractStepBlock(workflowText, "Resolve and validate release version")
    expect(resolveStepBlock).toContain("AUTO_BUMP_VERSION: ${{ needs.auto-bump.outputs.bumped_version }}")

    const runBlock = extractRunBlock(workflowText, "Resolve and validate release version")
    const tempDir = mkdtempSync(join(tmpdir(), "release-workflow-"))

    try {
      const scriptPath = join(tempDir, "resolve-version.sh")
      const outputPath = join(tempDir, "github-output.txt")
      writeFileSync(scriptPath, `${runBlock}\n`)

      const runScenario = (env: Record<string, string>) => {
        writeFileSync(outputPath, "")
        return spawnSync("bash", [scriptPath], {
          cwd: tempDir,
          env: { ...process.env, ...env, GITHUB_OUTPUT: outputPath },
          encoding: "utf8",
        })
      }

      const manualResult = runScenario({ INPUT_VERSION: "0.2.0", AUTO_BUMP_VERSION: "", CURRENT_VERSION: "0.1.1" })
      expect(manualResult.status).toBe(0)
      expect(readFileSync(outputPath, "utf8")).toBe("final_version=0.2.0\n")

      const autoBumpResult = runScenario({ INPUT_VERSION: "", AUTO_BUMP_VERSION: "0.1.2", CURRENT_VERSION: "0.1.1" })
      expect(autoBumpResult.status).toBe(0)
      expect(readFileSync(outputPath, "utf8")).toBe("final_version=0.1.2\n")

      const missingInputsResult = runScenario({ INPUT_VERSION: "", AUTO_BUMP_VERSION: "", CURRENT_VERSION: "0.1.1" })
      expect(missingInputsResult.status).not.toBe(0)
      expect(missingInputsResult.stderr).toContain("Either select auto-bump or provide version input")

      const conflictingInputsResult = runScenario({ INPUT_VERSION: "0.2.0", AUTO_BUMP_VERSION: "0.1.2", CURRENT_VERSION: "0.1.1" })
      expect(conflictingInputsResult.status).not.toBe(0)
      expect(conflictingInputsResult.stderr).toContain("Provide either auto-bump or version input, not both")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("Publish to npm step 會清理 NODE_AUTH_TOKEN / NPM_TOKEN，但保留 userconfig 並正確 publish", () => {
    const workflowText = readFileSync(".github/workflows/release.yml", "utf8")
    const runBlock = extractRunBlock(workflowText, "Publish to npm")
    const tempDir = mkdtempSync(join(tmpdir(), "release-workflow-"))

    try {
      const scriptPath = join(tempDir, "publish-to-npm.sh")
      const fakeBinDir = join(tempDir, "bin")
      const callLogPath = join(tempDir, "calls.jsonl")

      mkdirSync(fakeBinDir)
      writeFileSync(
        join(fakeBinDir, "npm"),
        [
          "#!/usr/bin/env node",
          "const fs = require('node:fs')",
          "const logPath = process.env.CALL_LOG_PATH",
          "if (!logPath) throw new Error('CALL_LOG_PATH is required')",
          "fs.appendFileSync(logPath, JSON.stringify({",
          "  tool: 'npm',",
          "  argv: process.argv.slice(2),",
          "  NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? '__UNSET__',",
          "  NPM_TOKEN: process.env.NPM_TOKEN ?? '__UNSET__',",
          "  NPM_CONFIG_USERCONFIG: process.env.NPM_CONFIG_USERCONFIG ?? '__UNSET__',",
          "  npm_config_userconfig: process.env.npm_config_userconfig ?? '__UNSET__',",
          "}) + '\\n')",
          "",
        ].join("\n"),
      )
      writeFileSync(
        join(fakeBinDir, "rm"),
        [
          "#!/usr/bin/env node",
          "const fs = require('node:fs')",
          "const logPath = process.env.CALL_LOG_PATH",
          "if (!logPath) throw new Error('CALL_LOG_PATH is required')",
          "fs.appendFileSync(logPath, JSON.stringify({ tool: 'rm', argv: process.argv.slice(2) }) + '\\n')",
          "",
        ].join("\n"),
      )
      chmodSync(join(fakeBinDir, "npm"), 0o755)
      chmodSync(join(fakeBinDir, "rm"), 0o755)
      writeFileSync(scriptPath, `${runBlock}\n`)

      const result = spawnSync("bash", [scriptPath], {
        cwd: tempDir,
        env: {
          ...process.env,
          PATH: `${fakeBinDir}:${process.env.PATH}`,
          CALL_LOG_PATH: callLogPath,
          NODE_AUTH_TOKEN: "parent-node-auth-token",
          NPM_TOKEN: "parent-npm-token",
          NPM_CONFIG_USERCONFIG: "parent-upper-userconfig",
          npm_config_userconfig: "parent-userconfig",
        },
        encoding: "utf8",
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")
      expect(runBlock).toMatch(/unset\s+NODE_AUTH_TOKEN\s+NPM_TOKEN/)
      expect(runBlock).not.toMatch(/unset\s+NPM_CONFIG_USERCONFIG\s+npm_config_userconfig/)

      const calls = readFileSync(callLogPath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { tool: string; argv: string[]; NODE_AUTH_TOKEN?: string; NPM_TOKEN?: string; NPM_CONFIG_USERCONFIG?: string; npm_config_userconfig?: string })

      const publishCallIndex = calls.findIndex((call) => call.tool === "npm" && call.argv[0] === "publish")
      const configDeleteCallIndex = calls.findIndex((call) => call.tool === "npm" && call.argv[0] === "config" && call.argv[1] === "delete" && call.argv[2] === "//registry.npmjs.org/:_authToken")
      const homeNpmrc = `${process.env.HOME ?? ""}/.npmrc`
      const rmCallIndex = calls.findIndex((call) => call.tool === "rm" && call.argv.length === 3 && call.argv[0] === "-f" && call.argv[1] === homeNpmrc && call.argv[2] === ".npmrc")
      const publishCall = calls[publishCallIndex]

      expect({
        cleanupBeforePublish: configDeleteCallIndex !== -1 && rmCallIndex !== -1 && configDeleteCallIndex < publishCallIndex && rmCallIndex < publishCallIndex,
        publishArgs: publishCall?.argv.join(" ") ?? null,
        publishEnv: {
          NODE_AUTH_TOKEN: publishCall?.NODE_AUTH_TOKEN ?? "__UNSET__",
          NPM_TOKEN: publishCall?.NPM_TOKEN ?? "__UNSET__",
          NPM_CONFIG_USERCONFIG: publishCall?.NPM_CONFIG_USERCONFIG ?? "__UNSET__",
          npm_config_userconfig: publishCall?.npm_config_userconfig ?? "__UNSET__",
        },
        configDeleteEnv: calls[configDeleteCallIndex] ? {
          NPM_CONFIG_USERCONFIG: calls[configDeleteCallIndex].NPM_CONFIG_USERCONFIG ?? "__UNSET__",
          npm_config_userconfig: calls[configDeleteCallIndex].npm_config_userconfig ?? "__UNSET__",
        } : null,
      }).toEqual({
        cleanupBeforePublish: true,
        publishArgs: "publish --provenance --access public --registry=https://registry.npmjs.org/",
        publishEnv: {
          NODE_AUTH_TOKEN: "__UNSET__",
          NPM_TOKEN: "__UNSET__",
          NPM_CONFIG_USERCONFIG: "parent-upper-userconfig",
          npm_config_userconfig: "parent-userconfig",
        },
        configDeleteEnv: {
          NPM_CONFIG_USERCONFIG: "parent-upper-userconfig",
          npm_config_userconfig: "parent-userconfig",
        },
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
