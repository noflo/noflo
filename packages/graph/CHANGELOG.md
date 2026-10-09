# Changelog

## [Unreleased]

## [2.0.0-alpha.2] - 2026-10-09

## [2.0.0-alpha.1] - 2026-10-08
- The npm tarball now ships generated TypeScript declarations and declares them via `types`; JSR publishing added (`jsr.json`)
### Added
- Initial plain-mode graph model: the five first-class entity kinds (Node, Edge, IIP, Export, Group) from work document #10, with referential integrity on plain mode, native `EventTarget` change events, node renaming with reference rewriting, and cascading node removal
- Deterministic canonical serialization (`serialize`/`fromCanonical` plus `stableStringify`) as the foundation for content-addressed epoch snapshots
- FBP JSON interchange adapter (`importFbpJson`/`exportFbpJson`) covering properties, nodes, edges, IIPs (`inits`), exported ports, and groups, including legacy NoFlo JSON documents (`processes`/`connections` shape) on import
- Native array-port support: `index` is a validated, identity-participating field on port references — connections to different slots of the same port are distinct entities, with O(1) duplicate detection via a connection index
- `component` is optional on nodes, allowing placeholder nodes that the engine registers without instantiating a process
