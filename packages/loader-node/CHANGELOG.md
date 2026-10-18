# Changelog

## [Unreleased]
### Added
- Signature sidecar discovery (work documents #19 and #24): `components/<name>.json` files — the per-component signature JSON noflo-ui materializes into a project workdir — are discovered as stub components and register as `StubComponent` factories via `StubComponent.fromSignature`, so a materialized project runs entirely on signature stubs without any library code present. Classification is by shape: a JSON object whose `inports` and `outports` are both arrays is a sidecar; anything else keeps the pre-sidecar ignore behavior. Port-level validation is the stub constructor's job, so a malformed sidecar fails loudly at load, named with the component. When an implementation source shares the sidecar's name, the implementation wins and the sidecar is dropped — documentation of the declared signature, not a second component (work document #24 update #2); when the implementation arrives later, the entry graduates
- `normalizeLibraryName` is exported from the package entry point: the library naming conventions are consumed by hosts classifying component names against their own project namespace (work document #19)

## [2.0.0-alpha.11] - 2026-10-18

## [2.0.0-alpha.10] - 2026-10-17

## [2.0.0-alpha.9] - 2026-10-17

## [2.0.0-alpha.8] - 2026-10-17

## [2.0.0-alpha.7] - 2026-10-16

## [2.0.0-alpha.6] - 2026-10-16

## [2.0.0-alpha.5] - 2026-10-16

## [2.0.0-alpha.4] - 2026-10-16

## [2.0.0-alpha.3] - 2026-10-10

## [2.0.0-alpha.2] - 2026-10-09
### Changed
- The `fbp-manifest` dependency is replaced by a local node_modules walker (`src/manifest.js`); the package's runtime dependencies are now `@noflo/fbp` and `@noflo/graph` only. The `recursive` and `runtimes` options are removed: discovery is always recursive, and only the noflo family of runtimes (`noflo`, `noflo-nodejs`, `noflo-browser`) is recognized — packages registering only under other runtimes are ignored. Divergence from fbp-manifest: dependencies without a readable `package.json` are skipped instead of being faked from the directory name
### Added
- The npm tarball now ships generated TypeScript declarations and declares them via `types`; the `noflo-cache-preheat` bin entry points at the committed bin script; JSR publishing added (`jsr.json`)
### Fixed
- A deadlock in Deno where concurrent component evaluation (a synchronous `require()` of an ESM module overlapping with dynamic imports) could hang component discovery. Module evaluation is now serialized

## [2.0.0-alpha.1] - 2026-10-08
### Added
- Initial 2.x line: Node.js component discovery and source storage extracted from NoFlo core
- Implements the `ComponentRegistry` contract (`list`/`get`/`setSource`/`getSource`) with `change`/`invalidate` EventTarget events
- `createNodeModulesRegistry(baseDir, options)` factory performs discovery and resolves to a ready registry
- Discovered graph files (`.fbp`, `.json`) register as pre-parsed `GraphModel` instances
- `noflo-cache-preheat` bin moved here from NoFlo core
- `loadGraphFile`/`saveGraphFile` moved here from NoFlo core
- Licensed EUPL-1.2 as a greenfield package
