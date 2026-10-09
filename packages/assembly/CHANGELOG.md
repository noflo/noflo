# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- The library is ingested into the `noflo/noflo` monorepo as `packages/assembly`, with full git history preserved (work document #27). Source of truth for further development is the monorepo

### Changed

- Package aligned with the monorepo conventions: lockstep version `2.0.0-alpha.2`, repository and issue URLs pointing at `noflo/noflo`, tests under `spec/`, shared `tsconfig` template, and a `jsr.json` for dual-registry publishing. `@noflo/noflo` is now a peer dependency, matching the base-class library convention used by `@noflo/as-component`. Legacy 1.x tooling remnants (Babel, ESLint, package-local lockfile and workflows) were removed

## [2.0.0-alpha.1] - 2026-10-09

### Added

- The package is renamed to `@noflo/assembly`

### Changed

- The multi-port component hook is renamed from `handle` to `processMessage`: NoFlo's Component base class uses `handle` as the instance property holding the processing function, so a subclass method of that name collides with it. Relay-style `relay(msg, output)` hooks are unchanged
- The source was already written in ES module style; the package is now shipped as a NoFlo 2.x esm-only module (`type: module`, `@noflo/noflo` dependency instead of `noflo`), with TypeScript checking and Biome formatting
- The `Component` base class works with the 2.x Process API: the `relay` and `handle` hooks are wired through `process()` with the preconditions-first contract
- The `example/` car-assembly project is converted to ES modules and is now exercised by the test suite through `@noflo/loader-node` discovery, including the `BuildCar` graph with its subgraphs
- Test suite rebuilt on `node:test`, replacing the Mocha setup that depended on the external `noflo-wrapper` harness
