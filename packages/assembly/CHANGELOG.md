# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `asAssembly` out mappings accept the `'*'` spread marker (one per adapter): the generated collector's fields config carries it, and the wrap-time validation rejects a doubled marker the way it rejects a doubled whole-message replace.

## [2.0.0-alpha.13] - 2026-10-19

## [2.0.0-alpha.12] - 2026-10-19

## [2.0.0-alpha.11] - 2026-10-18
### Changed

- `asAssembly`'s out-mapping accepts `null`: the mapped outport's inner output replaces the message entirely — the transform-the-message shape (a component that mutates and forwards the message, e.g. `packets/ScopeFromObject`) — and the named fields merge on top of the replacement, so the result is independent of the inner component's outport declaration order. The replace output must be a plain object; anything else (a non-object, an array, a class instance) accumulates an error into `msg.errors` instead of replacing. Only one outport may map to `null`; `asAssembly` validates loudly at wrap time (work document #36's mapping vocabulary, the out-side completion of the whole-message mapping)

## [2.0.0-alpha.10] - 2026-10-17
### Changed
- `asAssembly` generated graphs wire each field extractor's `error` outport into the result collector's error accumulation, so an extractor's missing-field failure completes the message on the error leg instead of stranding the collector's wait for a field that will never deliver (work document #35 update #13)

## [2.0.0-alpha.9] - 2026-10-17

## [2.0.0-alpha.8] - 2026-10-17

## [2.0.0-alpha.7] - 2026-10-16
### Added

- The `assembly` metadata catalog (work document #37 phase 2): the config-class `assembly.field` key, declared in the digest-addressed `schemas/catalog.json` artifact (pinned to the `@noflo/fbp-protocol` meta-catalog's shipped digest) with a dependency-free `src` mirror. `asAssembly`-generated adapter nodes now carry the namespaced key, and the adapter components read it via `getComponent(metadata)` — the declared form of the configuration mechanism work document #36 exercised. A §5.1 proof-of-concept suite validates every metadata map in a generated adapter graph against the catalog, round-trips the graph through FBP JSON, encodes the metadata through `0x14` insert ops unchanged, and re-instantiates the adapters identically
- The library is ingested into the `noflo/noflo` monorepo as `packages/assembly`, with full git history preserved (work document #27). Source of truth for further development is the monorepo
- `asAssembly(componentName, options)` and `wrapAssembly(...)`: the work document #36 machinery for turning any regular Process API component into an assembly participant. `asAssembly` builds the adapter as a real generated graph — message fanout, per-inport field extractors, the inner component, and a result collector that merges inner outputs back into the originating message and accumulates inner errors — so the graph the loader runs is the same graph `getSource` reports. The wrapper refuses already-assembly components, and `wrapAssembly` decorates configured libraries with wrapped components while reporting skips
- The noflo-assembly wiki is brought into `packages/assembly/docs`
- A scope-based correlation contract for wrapped components: messages carrying scopes stay paired through out-of-order async completions

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
