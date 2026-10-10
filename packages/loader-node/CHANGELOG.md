# Changelog

## [Unreleased]

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
