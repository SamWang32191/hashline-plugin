## MODIFIED Requirements

### Requirement: Plugin supports hashline-aware read output
The system SHALL transform supported read results into a hashline-aware line format that preserves the original line number, preserves the visible line content, and attaches a stable four-character hash token derived from the line number and normalized line content for each emitted line. Lines that do not match a supported read-line format SHALL remain unchanged.

#### Scenario: Read output is enhanced for line-addressable edits
- **WHEN** a supported read operation returns file content in a supported numbered-line format
- **THEN** the plugin SHALL rewrite each eligible line into `<line-number>#<four-character-token>|<content>`

#### Scenario: Unsupported lines remain unchanged
- **WHEN** the read output contains lines that do not match a supported numbered-line format
- **THEN** the plugin SHALL leave those lines unchanged in the final output

#### Scenario: Hashline anchors use documented normalization
- **WHEN** an eligible line includes carriage returns or trailing whitespace differences in the underlying file representation
- **THEN** the plugin SHALL compute the emitted hash token from the documented normalized line representation while preserving the visible content text in the rewritten output

### Requirement: Plugin provides hashline edit operations
The system SHALL expose a replace-only hashline edit capability that accepts anchored hashline references in the current token format and SHALL apply changes only when every provided hashline reference matches the current file state.

#### Scenario: Hashline edit succeeds with matching references
- **WHEN** the caller submits replace instructions whose hashline references match the current file content
- **THEN** the system SHALL replace the anchored line with the provided replacement lines and return a success result with diff information

#### Scenario: Hashline edit supports deletion and multiline replacement
- **WHEN** the caller submits a matching replace instruction with zero or multiple replacement lines
- **THEN** the system SHALL replace the anchored line with exactly that sequence of lines in the written file

#### Scenario: Hashline edit preserves newline conventions
- **WHEN** a matching replace instruction is applied to a file with existing LF or CRLF line endings and an existing trailing-final-newline state
- **THEN** the system SHALL preserve the original line-ending style and trailing-final-newline presence after writing the file

#### Scenario: Hashline edit fails on mismatched references
- **WHEN** the caller submits edit instructions with stale or mismatched hashline references
- **THEN** the system SHALL reject the edit and return an actionable mismatch error without modifying the file

#### Scenario: Unsupported edit operations are rejected
- **WHEN** the caller submits an operation outside the replace-only hashline contract
- **THEN** the system SHALL reject the request without modifying the file
