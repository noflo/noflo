# Migration notes: noflo-assembly → @noflo/assembly

Migrated 2026-10-09. Single-file library (`src/index.js`, 249 lines);
the source was already written in ES module style, so this was mostly
a packaging migration.

## Scope

- Package renamed, `type: module`, `@noflo/noflo ^2.0.0-alpha.2`
  dependency, TypeScript checking, Biome formatting.
- The `Component` base class wires `relay`/`handle` hooks through the
  2.x Process API in the constructor; `validates` normalization and the
  `fail`/`failed`/`fork`/`merge` message helpers are unchanged.
- The `example/` car-assembly project (14 components, 3 graphs) was
  converted to ES modules and is now discovered by the test suite via
  `@noflo/loader-node` over the `example/` package root (namespace
  `example/`).

## Test notes

- The 1.x Mocha specs leaned on the external `noflo-wrapper` harness;
  the port uses a minimal inline socket harness
  (`test/Component.test.js`) and real subgraph loads for the graphs
  (`test/Graph.test.js`), including `BuildCar` with its nested
  `BuildChassis`/`BuildBody` subgraphs.
- The 1.x spec files were removed with the migration; no behavioral
  changes to the library were needed — the Process API usage was
  already preconditions-first.
