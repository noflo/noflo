# Changelog

## [Unreleased]

## [2.0.0-alpha.1] - 2026-10-08
### Added
- The npm tarball now ships generated TypeScript declarations and declares them via `types`; JSR publishing added (`jsr.json`)
- Initial 2.x line: `asComponent` extracted from NoFlo core into this standalone package
- Takes `noflo` as a peer dependency; NoFlo core no longer imports `asComponent` back
- NoFlo core drops the `noflo.asComponent` export and the `get-function-params` dependency
- Licensed EUPL-1.2 as a greenfield package
