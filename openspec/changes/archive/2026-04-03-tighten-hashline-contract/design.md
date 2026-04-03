## Context

Hashline is intentionally a harness-safety feature, not a general-purpose patch engine. Its value comes from returning verifiable line anchors during read and rejecting edits when those anchors no longer match the file, but the current implementation still exposes a broader edit shape than it actually supports and compresses visible hash anchors into a token that is too short for that safety contract.

The change spans multiple modules: `src/hashline/hash.ts` defines anchor generation, `src/hashline/format.ts` rewrites read output, `src/tools/hashline-edit.ts` validates and applies anchored edits, and the current tests and docs do not fully encode the intended contract. That makes this a cross-cutting contract-tightening change rather than a narrow implementation tweak.

## Goals / Non-Goals

**Goals:**
- Align the public edit contract with the existing minimal safety model: replace-only anchored edits.
- Increase visible hash token length to reduce accidental acceptance of stale anchors while keeping anchors ergonomic for agents to reproduce.
- Make normalization and read-rewrite behavior explicit so the product trade-offs are intentional and testable.
- Add contract-focused tests that protect newline handling, stale rejection, deletion, multiline replacement, and read passthrough behavior.

**Non-Goals:**
- Adding generic `append` or `prepend` edit semantics.
- Building fuzzy patch application, merge behavior, or best-effort recovery for stale anchors.
- Reworking plugin registration or introducing unrelated manager/orchestration features.
- Changing trailing-whitespace handling into a byte-perfect identity model.

## Decisions

### 1. Expose a single replace-only edit primitive
The edit tool will expose only `replace` operations. Each edit will continue to target a required hashline reference (`pos`) and replace the anchored line with zero or more lines (`lines: string[] | null`). This preserves the current minimal primitive while removing the misleading `append` and `prepend` surface.

**Why:** a single verified replacement primitive is enough to express line replacement, deletion, and line expansion without pretending Hashline is a generic patch DSL.

**Alternatives considered:**
- Keep `append` / `prepend` in the schema and implement them later: rejected because the public API would continue to misrepresent the supported safety contract.
- Add a richer edit language now: rejected because it expands scope away from the harness problem.

### 2. Expand visible hash anchors from two characters to four characters
Hash computation will continue to derive from the line number plus normalized content, but the visible anchor token will expand to four characters from the existing alphabet. This preserves the current lightweight anchor style while materially reducing accidental collisions.

**Why:** the current two-character surface token is too small for a feature whose main job is to reject stale edits before corruption.

**Alternatives considered:**
- Keep two characters: rejected because the collision space is too small for the intended guardrail.
- Move to a much longer token: rejected for now because it increases anchor verbosity and reproduction cost for agents without clear evidence that four characters are insufficient.

### 3. Keep the current normalization trade-off, but make it explicit
Hashline will continue to normalize content for anchor generation by removing carriage returns and trimming trailing whitespace, while preserving the visible line content in rewritten read output. The read enhancer will continue to rewrite only supported numbered-line formats and leave unsupported lines untouched.

**Why:** this keeps anchors stable across common line-ending and trailing-whitespace noise, which supports the plugin's goal of reducing harness failures caused by exact reproduction requirements.

**Alternatives considered:**
- Use byte-perfect hashing: rejected because it would make anchors overly sensitive to formatting noise the product is explicitly trying to smooth over.
- Broaden the rewrite parser further: rejected because a wider parser raises the risk of false-positive rewrites.

### 4. Treat contract tests as part of the product surface
The test suite will explicitly lock down the public contract: four-character anchors, replace-only validation, stale-reference rejection, CRLF/LF preservation, trailing-final-newline preservation, delete/multiline replacement semantics, and non-read passthrough behavior.

**Why:** Hashline's value is correctness under failure conditions. The most important regressions are contract regressions, not internal refactors.

**Alternatives considered:**
- Rely on a few happy-path tests: rejected because the missing edge cases are exactly where corruption-prevention claims fail.

## Risks / Trade-offs

- **Breaking visible token format** → Callers must reread before editing after upgrading. Mitigation: document the new token format in README/specs and call it out in release notes.
- **Trailing-whitespace changes may still share an anchor** → This is an intentional trade-off in favor of agent reliability. Mitigation: document it as part of the normalization contract and add tests so it remains explicit.
- **Regex-based read rewriting still depends on host output shape** → False positives or missed rewrites remain possible if host formats change. Mitigation: keep supported patterns narrow and add passthrough tests for unsupported lines.
- **Path sandboxing is still mostly a host concern** → This change does not make path hardening the primary scope. Mitigation: document as a follow-up if host guarantees are unclear.

## Migration Plan

1. Update the visible token format and accepted hash-reference pattern together.
2. Tighten the edit schema to replace-only so read and edit contracts remain aligned.
3. Add contract tests before or alongside implementation updates.
4. Update README and delta specs to describe the new anchor contract and normalization behavior.

Rollback is straightforward: revert the contract-tightening change and restore the previous token format if compatibility issues outweigh the safety improvement.

## Open Questions

- Does the host already guarantee worktree/path sandboxing for plugin-provided edit tools, or should that be tracked as a follow-up hardening change?
- Should multi-edit batches be explicitly documented as applying in request order, or should a future change move them to snapshot-based validation semantics?
