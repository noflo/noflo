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

## API change (decided)

- The multi-port hook `handle(input, output)` is renamed to `processMessage(input, output)`. NoFlo's Component base class uses `handle` as the instance property holding the processing function (set by `process()`), so a subclass method of that name collides with it — a type error for every subclass and shadowing fragility at runtime (the prototype method is invisible once `process()` runs). The 1.x name would keep working at runtime but fails type checking for all subclass authors.
- Maintainer decision (2026-10-10, work document #27): keep `processMessage`. The new name is the 2.x API; no compatibility alias is provided and no core-level storage change is made. Relay-style `relay(msg, output)` hooks are unchanged.

## Test notes

- The 1.x Mocha specs leaned on the external `noflo-wrapper` harness;
  the port uses a minimal inline socket harness
  (`test/Component.test.js`) and real subgraph loads for the graphs
  (`test/Graph.test.js`), including `BuildCar` with its nested
  `BuildChassis`/`BuildBody` subgraphs.
- The 1.x spec files were removed with the migration; no behavioral
  changes to the library were needed — the Process API usage was
  already preconditions-first.
