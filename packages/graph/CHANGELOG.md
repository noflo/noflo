# Changelog

## [Unreleased]

## [2.0.0-alpha.13] - 2026-10-19

## [2.0.0-alpha.12] - 2026-10-19

## [2.0.0-alpha.11] - 2026-10-18
### Changed
- FBP JSON import honors the document's `caseSensitive` flag (work document #15): legacy documents carrying `caseSensitive: false` (the 1.x interchange default, where the reference parser lowercased port names) import with port names folded to lowercase across edges, IIP targets, and exports — both the public export name and the internal reference — so mixed-case references against lowercase-declared 1.x components resolve. `caseSensitive: true` or absent preserves casing as authored, and a case-mismatched reference fails loudly at network build instead of silently resolving. The fold builds a fresh document — the caller's object is never rewritten — port values must be strings (the normalization does not coerce), an export-name case collision throws rather than silently dropping one, and top-level `inits`/`case` fields survive legacy normalization on modern documents

## [2.0.0-alpha.10] - 2026-10-17

## [2.0.0-alpha.9] - 2026-10-17

## [2.0.0-alpha.8] - 2026-10-17

## [2.0.0-alpha.7] - 2026-10-16

## [2.0.0-alpha.6] - 2026-10-16

## [2.0.0-alpha.5] - 2026-10-16

## [2.0.0-alpha.4] - 2026-10-16

## [2.0.0-alpha.3] - 2026-10-10
### Added
- The entity type vocabulary (`GraphPortRef`, `GraphNode`, `GraphEdge`, `GraphIIP`, `GraphExport`, `GraphGroup`, `EntityKind`) is now re-exported from the package root as documented types

## [2.0.0-alpha.2] - 2026-10-09

## [2.0.0-alpha.1] - 2026-10-08
- The npm tarball now ships generated TypeScript declarations and declares them via `types`; JSR publishing added (`jsr.json`)
### Added
- Initial plain-mode graph model: the five first-class entity kinds (Node, Edge, IIP, Export, Group) from work document #10, with referential integrity on plain mode, native `EventTarget` change events, node renaming with reference rewriting, and cascading node removal
- Deterministic canonical serialization (`serialize`/`fromCanonical` plus `stableStringify`) as the foundation for content-addressed epoch snapshots
- FBP JSON interchange adapter (`importFbpJson`/`exportFbpJson`) covering properties, nodes, edges, IIPs (`inits`), exported ports, and groups, including legacy NoFlo JSON documents (`processes`/`connections` shape) on import
- Native array-port support: `index` is a validated, identity-participating field on port references — connections to different slots of the same port are distinct entities, with O(1) duplicate detection via a connection index
- `component` is optional on nodes, allowing placeholder nodes that the engine registers without instantiating a process
