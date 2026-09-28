# Changelog

## [Unreleased]
### Added
- Initial implementation of the in-process fbp-spec runner: YAML (multi-suite) and JSON spec loading, `node:test`-based suite/case compilation with skip and timeout support, deterministic data-IP execution with pairwise input/expect sequences, and the full fbp-spec expectation operator vocabulary (`equals`, `above`, `below`, `type`, `haveKeys`, `includeKeys`, `contains`, `noterror`, `path`) mapped to `node:assert/strict`
- Vendored, version-pinned third-party bundles for JSONPath and YAML parsing (see `vendor/`), regenerable via `node utils/generate-vendors.mjs`
