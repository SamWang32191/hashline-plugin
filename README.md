# @w32191/hashline-plugin

Hashline plugin for OpenCode that adds hashline-aware read output and guarded edit operations.

## Behavior contract

Hashline is designed to reduce harness failures by giving the agent stable line anchors during `read`, then rejecting stale edits before file corruption.

Read output is rewritten into this format:

```text
11#VKQT|function hello() {
12#XJMB|  return "world"
```

- The visible hash token is **4 characters**.
- The edit tool is **replace-only**: each edit targets a required `line#hash` anchor and replaces that anchored line with zero or more lines.
- `lines: null` deletes the anchored line.
- `lines: ["a", "b"]` replaces one anchored line with multiple lines.

## Normalization trade-off

Hashline anchors are computed from the line number plus normalized line content:

- carriage returns are ignored for hashing
- trailing whitespace is trimmed for hashing
- visible read output content is preserved as displayed

This is intentional: Hashline optimizes for stable, verifiable agent edits rather than byte-perfect whitespace identity.

## Upgrade note

The current contract uses 4-character visible hash tokens. If you upgrade from an older 2-character token release, agents must reread files before attempting hashline edits.

## Configure in `opencode.json`

According to the official OpenCode plugin docs, npm plugins are configured with the singular `plugin` key in `opencode.json`.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@w32191/hashline-plugin"]
}
```

Notes:

- Use `plugin`, not `plugins`.
- You can add this in your project `opencode.json` or global `~/.config/opencode/opencode.json`.
- OpenCode installs npm plugins automatically at startup.
- Official docs: <https://opencode.ai/docs/plugins/> and <https://opencode.ai/docs/config/>

### Loader compatibility

- `src/index.ts` exports a named `server` plugin function (and keeps `default` export for backward compatibility).
- `package.json` declares `oc-plugin.targets` with `server` so OpenCode npm loader can discover the server target.

## Package contents

- `dist/index.js`: bundled plugin entrypoint
- `dist/index.d.ts`: published type declarations

## Release

See `docs/release-runbook.md` for the GitHub Actions release flow.
