# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0-alpha.11] - 2026-10-18
### Added

- `ToAssembly` accepts the `assembly.field` node metadata to name the field the incoming value lands under (default `data`): the envelope creation goes stock — e.g. `field: "path"` turns a bare path string into `{ errors: [], path: value }` for a downstream adapter consuming `path`. The error envelope stays `{ errors: [error] }` regardless of the field

### Changed

- `CollectFields` honors `null` entries in its `fields` config as the whole-message replace mapping: the collected inner output becomes the message and supersedes the incoming envelope's error state — the inner received the full envelope and owns the accumulation, so a relay-convention inner carries the accumulated errors forward in its replacement and the collector's error port remains the out-of-band channel (merging the two channels would double-count the envelope's original errors) — with a non-object output accumulating an error instead (the collector-side of `asAssembly`'s `null` out-mapping)

## [2.0.0-alpha.10] - 2026-10-17
### Changed
- `ExtractField` signals a missing mapped field on the `error` outport instead of silently delivering `undefined`: the generated adapter graphs wire the extractor's error leg into the collector's error accumulation, so a message lacking a required field completes on the error leg with the failure recorded, rather than crashing the inner component on a null deref. A field that is present with a `null` value is a value and delivers (work document #35 update #13, question (b))
### Documented
- `CollectFields`: the error contract is normative in the component docs — the inner's `error` port is the message's terminal event for its scope (the collector fires with the errors and whatever fields delivered); inner data arriving after the error for the same scope has no collector waiting and surfaces in the shutdown diagnostics. Pairing is per scope via the scope-aware has-checks (work document #35 update #13, question (c))

## [2.0.0-alpha.9] - 2026-10-17

## [2.0.0-alpha.8] - 2026-10-17

## [2.0.0-alpha.7] - 2026-10-16
### Fixed

- `assembly-utils/CollectFields` firing pattern: the collector consumed the originating message in an activation that then waited for the inner component's outputs — new arrivals fire fresh contexts, so a relay split across activations lost the message and hung the network (the activation pended forever with the inner output buffered). The collector now has-checks the complete precondition set — the message, the fields config, and every mapped inner output stream (or the error stream) — before consuming anything, so the message stays buffered until the collector can fire with both. Found via a flowtrace of a wrapped component running inside a network (work document #36 update #11)

### Added

- Initial 2.x line: `noflo-assembly-utils` ingested into the monorepo as `@noflo/assembly-utils` (work document #36), preserving history and authorship
- `assembly-utils/ExtractField`, `assembly-utils/ToField`, and `assembly-utils/CollectFields`: the adapter components the `asAssembly` generated graphs reference (work document #36). `CollectFields` collects inner component outputs back into the originating assembly message — bracketed inner streams collect as arrays, single packets as values — and accumulates inner errors into `msg.errors`, firing even when the inner component signalled failure instead of delivering
- Generated TypeScript declarations for the component entrypoints, with `@ts-self-types` pointers for the JSR typed surface

### Changed

- Components ported to the Process API on ESM with `@noflo/noflo` and `@noflo/assembly` as peer dependencies
- `ComparePath` renames its `handle` hook to `processMessage` per the `@noflo/assembly` 2.x API decision (work document #27 update #3)
- fbp-spec suites run through the in-process `@noflo/fbp-spec-runner` on a `node:test` harness; the YAML sources stay unchanged
- `assembly-utils/ComparePath` now uses `jsonpath-plus` instead of the `jsonpath` package, dropping the esprima/static-eval expression-evaluation stack from the dependency tree. Semantic difference: jsonpath-plus resolves syntactically invalid paths to `undefined` instead of throwing, so an unresolvable path routes the message to FAIL without accumulating an error. The dependency is declared to JSR via the `imports` mapping (`npm:jsonpath-plus`). The comparison keeps the 1.x loose-equality semantics: the JSONPath-resolved value is compared with `==`/`!=` against the `comparison` control, so string `"42"` compares equal to number `42`
