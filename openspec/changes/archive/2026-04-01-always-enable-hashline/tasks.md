## 1. Simplify plugin assembly to always-on behavior

- [x] 1.1 Remove the hashline-specific enable/disable gating from the plugin entrypoint so `edit` registration and read enhancement are always wired when the plugin loads.
- [x] 1.2 Simplify or remove the config / hook helper paths that only existed to carry `hashline_edit` and `hooks.hashline_read_enhancer` booleans.

## 2. Align verification with the new contract

- [x] 2.1 Update integration coverage to verify hashline behavior is enabled by default and remains enabled even if legacy toggle fields are provided.
- [x] 2.2 Run the relevant test and validation commands for the plugin after the always-on change, and fix any regressions caused by removing the toggle path.

## 3. Remove stale toggle references

- [x] 3.1 Update any remaining code comments, exported option types, or developer-facing docs that still describe hashline activation as configurable.
- [x] 3.2 Confirm the repository no longer documents `hashline_edit` or `hooks.hashline_read_enhancer` as supported control knobs for plugin activation.
