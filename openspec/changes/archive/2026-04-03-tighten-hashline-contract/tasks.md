## 1. Tighten the public hashline contract

- [x] 1.1 Update hash generation and hash-reference parsing to use the new four-character visible token format.
- [x] 1.2 Narrow the hashline edit tool surface to the replace-only contract and keep `lines` semantics as zero-or-more replacement lines.
- [x] 1.3 Ensure read-output rewriting and edit validation share the same documented hashline format and normalization behavior.

## 2. Lock down contract behavior with tests

- [x] 2.1 Expand core tests to cover four-character anchors, stale-reference rejection, deletion, and multiline replacement.
- [x] 2.2 Add newline-focused tests for LF/CRLF preservation and trailing-final-newline preservation during anchored edits.
- [x] 2.3 Expand integration tests to cover supported read rewrite behavior, unsupported-line passthrough, and the replace-only edit contract.

## 3. Document the tightened behavior

- [x] 3.1 Update README to describe the replace-only model, the new visible token format, and the documented normalization trade-off.
- [x] 3.2 Add release-facing notes for the breaking anchor-format change so callers know they must reread before editing after upgrade.
