# Changelog

## Unreleased
- The npm tarball now ships generated TypeScript declarations and declares them via `types`; the `noflo-cache-preheat` bin entry points at the committed bin script; JSR publishing added (`jsr.json`)

- Fixed a deadlock in Deno where concurrent component evaluation (a synchronous `require()` of an ESM module overlapping with dynamic imports) could hang component discovery. Module evaluation is now serialized
- Initial 2.x line: Node.js component discovery and source storage extracted from NoFlo core
- Implements the `ComponentRegistry` contract (`list`/`get`/`setSource`/`getSource`) with `change`/`invalidate` EventTarget events
- `createNodeModulesRegistry(baseDir, options)` factory performs discovery and resolves to a ready registry
- Discovered graph files (`.fbp`, `.json`) register as pre-parsed `GraphModel` instances
- `noflo-cache-preheat` bin moved here from NoFlo core
- `loadGraphFile`/`saveGraphFile` moved here from NoFlo core
- Licensed EUPL-1.2 as a greenfield package
