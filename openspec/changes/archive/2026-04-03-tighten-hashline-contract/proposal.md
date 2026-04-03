## Why

Hashline exists to solve the harness problem by giving agents stable, verifiable line anchors and rejecting stale edits before they corrupt files. The current implementation already follows that direction, but its public contract is still looser and less explicit than the product intent, which makes it easier for callers to misuse and harder to verify the safety guarantees.

## What Changes

- Tighten the hashline edit contract so the public tool surface matches the current minimal safety model instead of implying unsupported generic edit semantics.
- **BREAKING** Strengthen exposed hash anchors so stale references are less likely to be accepted by accident, which changes the visible hash token format returned by read output and accepted by edit references.
- Define and document hashline normalization and read-rewrite behavior, including the deliberate whitespace trade-offs that support agent reliability.
- Add focused contract tests for hashline read/edit behavior, especially newline, deletion, multiline replacement, and stale-reference rejection paths.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `hashline-plugin`: tighten the hash-anchored read/edit contract around replace-only anchored edits, stronger visible hash tokens, explicit normalization behavior, and stronger verification coverage.

## Impact

- Affected code: `src/tools/hashline-edit.ts`, `src/hashline/hash.ts`, `src/hashline/format.ts`, `src/index.ts`
- Affected specs/docs: `openspec/specs/hashline-plugin/spec.md`, `README.md`
- Affected tests: `tests/hashline-core.test.ts`, `tests/plugin-integration.test.ts`
- Affected API surface: hash token length in emitted hashlines and accepted edit references
- No new runtime dependencies are expected
