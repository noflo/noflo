# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Schema artifact support in the manifest (work document #37 phase 1): a `schemas` table (id → digest, path, computed `implements` closure), an `anonymousSchemas` digest-keyed section for hoisted inline port schemas, and a `foreignSchemas` section for references resolved through the dependency closure. The generator pins authoring-sugar `$ref`/`$id` forms into absolute `urn:noflo:` URNs (writing the published bytes back, idempotently), hoists inline port schemas into content-addressed `schemas/<digest>.json` entries, derives each port's in-band guard from its schema (or lints an explicit guard against the projection), and enforces the publish gate: closure resolvability, reserved-namespace ownership (`std`, `ui`, `runtime`, `noflo`, `assembly`), cross-document reference cycles, closed interfaces, meta-schema identity against the artifacts shipped from `@noflo/fbp-protocol`, and dependency digest mismatches. Manifest ports carry the final `schema` (id + digest) and `guard` fields

## [2.0.0-alpha.1] - 2026-10-10

### Added

- Initial release: publish-time component manifest generation for NoFlo
  libraries, implementing the published-manifest design
- CLI (`noflo-manifest generate [baseDir]`) writing `noflo.json`
- Elementary signature harvest via `getComponent()` execution at publish
  time; data-first graph signature derivation from wired components'
  signatures or their published manifests, with a loader fallback
- Component kind vocabulary (`elementary`/`subgraph`), per-component
  platform derivation from static import analysis, Assembly Line
  convention detection, fbp-spec suite association, library
  self-description (npm, git source + revision, loader flag), and the
  namespaces map for data-only closure resolution
