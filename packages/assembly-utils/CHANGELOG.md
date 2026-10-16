# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial 2.x line: `noflo-assembly-utils` ingested into the monorepo as `@noflo/assembly-utils` (work document #36), preserving history and authorship
- `assembly-utils/ExtractField`, `assembly-utils/ToField`, and `assembly-utils/CollectFields`: the adapter components the `asAssembly` generated graphs reference (work document #36). `CollectFields` collects inner component outputs back into the originating assembly message — bracketed inner streams collect as arrays, single packets as values — and accumulates inner errors into `msg.errors`, firing even when the inner component signalled failure instead of delivering
- Generated TypeScript declarations for the component entrypoints, with `@ts-self-types` pointers for the JSR typed surface

### Changed

- Components ported to the Process API on ESM with `@noflo/noflo` and `@noflo/assembly` as peer dependencies
- `ComparePath` renames its `handle` hook to `processMessage` per the `@noflo/assembly` 2.x API decision (work document #27 update #3)
- fbp-spec suites run through the in-process `@noflo/fbp-spec-runner` on a `node:test` harness; the YAML sources stay unchanged
- `assembly-utils/ComparePath` now uses `jsonpath-plus` instead of the `jsonpath` package, dropping the esprima/static-eval expression-evaluation stack from the dependency tree. Semantic difference: jsonpath-plus resolves syntactically invalid paths to `undefined` instead of throwing, so an unresolvable path routes the message to FAIL without accumulating an error. The dependency is declared to JSR via the `imports` mapping (`npm:jsonpath-plus`). The comparison keeps the 1.x loose-equality semantics: the JSONPath-resolved value is compared with `==`/`!=` against the `comparison` control, so string `"42"` compares equal to number `42`

