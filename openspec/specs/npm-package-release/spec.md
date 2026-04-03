## Purpose

TBD.

## Requirements

### Requirement: Maintainer can dispatch an npm release workflow
The repository SHALL provide a GitHub Actions workflow that a maintainer can trigger manually to create an npm release for the package.

#### Scenario: Valid manual release dispatch
- **WHEN** a maintainer dispatches the release workflow from the latest `main` branch with a valid target version
- **THEN** the workflow proceeds to release-readiness validation before attempting any publish action

#### Scenario: Invalid dispatch context is rejected
- **WHEN** the workflow is dispatched from a branch or commit that is not the latest `main`
- **THEN** the workflow MUST fail before mutating package metadata, git tags, npm state, or GitHub releases

### Requirement: Release readiness is validated before publish
The release workflow SHALL validate that the requested version is strict semver, is greater than the current package version, is not already present as a git tag, is not already published to npm, and that the package passes typecheck, tests, build, and package-content verification before publish.

#### Scenario: Requested version is invalid
- **WHEN** the requested release version is missing, not strict `X.Y.Z` semver, or not greater than the current package version
- **THEN** the workflow MUST fail before creating a release commit, tag, npm publish, or GitHub release

#### Scenario: Release version already exists remotely
- **WHEN** the target version already exists as a git tag or published npm version
- **THEN** the workflow MUST fail and report that the release version is already in use

#### Scenario: Package verification fails
- **WHEN** typecheck, tests, build, or `npm pack --dry-run` fails
- **THEN** the workflow MUST stop before publishing to npm or pushing release metadata

### Requirement: Successful release publishes and records the version
For a non-dry-run release, the workflow SHALL update the package version for the release, publish the package to npm with provenance, create the corresponding git tag, push the release commit and tag, and create a GitHub release for the same version.

#### Scenario: Successful non-dry-run release
- **WHEN** all readiness checks pass and dry-run is disabled
- **THEN** the workflow MUST publish the requested version to npm, push the matching release commit and tag, and create a GitHub release for that version

#### Scenario: Dry-run release preview
- **WHEN** all readiness checks pass and dry-run is enabled
- **THEN** the workflow MUST report the publish and push actions it would perform without mutating npm, git remote state, or GitHub releases

### Requirement: Package metadata supports npm distribution
The package SHALL define publishable metadata and outputs so that consumers can install the released package from npm and load the built entrypoint and types from the published artifact.

#### Scenario: Package contents are publishable
- **WHEN** the package is packed for release
- **THEN** the archive MUST include the built distribution files and any required plugin metadata, and MUST exclude source-only files that are not part of the runtime contract
