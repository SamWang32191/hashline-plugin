# @w32191/hashline-plugin

Hashline plugin for OpenCode that adds hashline-aware read output and guarded edit operations.

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

## Package contents

- `dist/index.js`: bundled plugin entrypoint
- `dist/index.d.ts`: published type declarations

## Release

See `docs/release-runbook.md` for the GitHub Actions release flow.
