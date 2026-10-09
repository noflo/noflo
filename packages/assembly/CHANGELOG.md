# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## [2.0.0-alpha.1] - 2026-10-09

### Added

- The package is renamed to `@noflo/assembly`

### Changed

- The source was already written in ES module style; the package is now shipped as a NoFlo 2.x esm-only module (`type: module`, `@noflo/noflo` dependency instead of `noflo`), with TypeScript checking and Biome formatting
- The `Component` base class works with the 2.x Process API: the `relay` and `handle` hooks are wired through `process()` with the preconditions-first contract
- The `example/` car-assembly project is converted to ES modules and is now exercised by the test suite through `@noflo/loader-node` discovery, including the `BuildCar` graph with its subgraphs
- Test suite rebuilt on `node:test`, replacing the Mocha setup that depended on the external `noflo-wrapper` harness
