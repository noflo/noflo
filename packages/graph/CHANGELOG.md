# Changelog

## [Unreleased]
### Added
- Initial plain-mode graph model: the five first-class entity kinds (Node, Edge, IIP, Export, Group) from work document #10, with referential integrity on plain mode, native `EventTarget` change events, node renaming with reference rewriting, and cascading node removal
- Deterministic canonical serialization (`serialize`/`fromCanonical` plus `stableStringify`) as the foundation for content-addressed epoch snapshots
- FBP JSON interchange adapter (`importFbpJson`/`exportFbpJson`) covering properties, nodes, edges, IIPs (`inits`), exported ports, and groups
