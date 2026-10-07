# Changelog

## Unreleased

- Initial 2.x line: Node.js component discovery and source storage extracted from NoFlo core
- Implements the `ComponentRegistry` contract (`list`/`get`/`setSource`/`getSource`) with `change`/`invalidate` EventTarget events
- `createNodeModulesRegistry(baseDir, options)` factory performs discovery and resolves to a ready registry
- Discovered graph files (`.fbp`, `.json`) register as pre-parsed `GraphModel` instances
- CommonJS component evaluation is deprecated, matching core behavior
- `noflo-cache-preheat` bin moved here from NoFlo core
- `loadGraphFile`/`saveGraphFile` moved here from NoFlo core
- Licensed EUPL-1.2 as a greenfield package
