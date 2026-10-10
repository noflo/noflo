# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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
