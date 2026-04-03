## 1. Prepare package for npm distribution

- [x] 1.1 Confirm the final npm package name and update `package.json` metadata required for public publishing.
- [x] 1.2 Replace `private: true` with publishable package fields (`main`, `types`, `exports`, `files`, `license`, repository/homepage/bugs as needed).
- [x] 1.3 Update build-related scripts so `bun run build` and `npm pack --dry-run` produce the intended publishable artifact.

## 2. Add GitHub Actions release workflow

- [x] 2.1 Create `.github/workflows/release.yml` with `workflow_dispatch` inputs for release version, optional notes, and dry-run mode.
- [x] 2.2 Implement release-readiness checks for strict semver validation, latest `main` enforcement, and existing git tag/npm version detection.
- [x] 2.3 Run install, typecheck, tests, build, and `npm pack --dry-run` before any publish step.
- [x] 2.4 Implement the non-dry-run release path that bumps the package version for the release, publishes to npm with provenance, pushes the release commit/tag, and creates a GitHub release.
- [x] 2.5 Implement the dry-run path that reports intended publish/push actions without mutating remote state.

## 3. Document and verify the release flow

- [x] 3.1 Add release documentation covering prerequisites, workflow inputs, dry-run usage, and failure recovery guidance.
- [x] 3.2 Verify the workflow locally where possible (`build`, `typecheck`, `test`, `npm pack --dry-run`) and ensure the documented release artifact matches the package contract.
- [ ] 3.3 Perform a GitHub Actions dry-run validation from `main` after merge readiness and confirm the workflow summary is sufficient for maintainers.
