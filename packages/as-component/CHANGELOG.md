# Changelog

## [Unreleased]

## [2.0.0-alpha.7] - 2026-10-16

## [2.0.0-alpha.6] - 2026-10-16

## [2.0.0-alpha.5] - 2026-10-16

## [2.0.0-alpha.4] - 2026-10-16
### Changed

- Function parameters with defaults map to optional ports (work document #37 §3.4: the 1.x port-`default` option is retired from the core): the component passes `undefined` when the graph leaves the port unsupplied, and the function's own default parameter — the process-function fallback — applies

## [2.0.0-alpha.3] - 2026-10-10

## [2.0.0-alpha.1] - 2026-10-08
### Added
- The npm tarball now ships generated TypeScript declarations and declares them via `types`; JSR publishing added (`jsr.json`)
- Initial 2.x line: `asComponent` extracted from NoFlo core into this standalone package
- Takes `noflo` as a peer dependency; NoFlo core no longer imports `asComponent` back
- NoFlo core drops the `noflo.asComponent` export and the `get-function-params` dependency
- Licensed EUPL-1.2 as a greenfield package
