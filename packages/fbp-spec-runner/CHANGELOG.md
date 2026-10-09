# Changelog

## [Unreleased]

## [2.0.0-alpha.2] - 2026-10-09
- Socket event wiring uses the EventTarget API (`addEventListener`), so running the tester no longer emits NoFlo EventEmitter deprecation warnings

## [2.0.0-alpha.1] - 2026-10-08
### Added
- Initial implementation of the in-process fbp-spec runner: YAML (multi-suite) and JSON spec loading, `node:test`-based suite/case compilation with skip and timeout support, deterministic data-IP execution with pairwise input/expect sequences, and the full fbp-spec expectation operator vocabulary (`equals`, `above`, `below`, `type`, `haveKeys`, `includeKeys`, `contains`, `noterror`, `path`) mapped to `node:assert/strict`
- Vendored, version-pinned third-party bundles for JSONPath and YAML parsing (see `vendor/`), regenerable via `node utils/generate-vendors.js`
