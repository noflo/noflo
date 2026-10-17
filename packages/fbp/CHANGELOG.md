# Changelog

## [Unreleased]

## [2.0.0-alpha.10] - 2026-10-17

## [2.0.0-alpha.9] - 2026-10-17

## [2.0.0-alpha.8] - 2026-10-17

## [2.0.0-alpha.7] - 2026-10-16

## [2.0.0-alpha.6] - 2026-10-16

## [2.0.0-alpha.5] - 2026-10-16

## [2.0.0-alpha.4] - 2026-10-16
### Added

- `.fbp` grammar extension (2.x): metadata values may carry `.` and `-` — float and negative coordinates (`Node(Comp:x=10.5,y=-22.5)`), which the reference `fbp` parser rejects. Documented divergence: for every input the reference accepts, `parse` behaves identically; the extension only widens acceptance.

### Fixed

- The component metadata grammar now matches the reference parser's acceptance exactly for non-extended inputs, and `toFBP()` emits float coordinates instead of dropping them

### Added

- `toFBP()`: the `.fbp` writer — renders a canonical graph document (the `GraphModel.serialize()` shape) as `.fbp` DSL source, the inverse of `parse()` for nodes, edges with port indexes, IIPs, and exports. Groups have no DSL representation; metadata is limited to what the syntax carries (finite `x`/`y` coordinates and safe scalar strings). Deterministic output, verified by round-trip through `parse()`.

## [2.0.0-alpha.3] - 2026-10-10

## [2.0.0-alpha.1] - 2026-10-08
### Added
- The npm tarball now ships generated TypeScript declarations (adjacent `.d.ts` files) and declares them via `types`; JSR publishing added (`jsr.json`)
- Initial implementation of the `@noflo/fbp` parser for the `.fbp` flow definition language
- Hand-written recursive-descent parser in zero-dependency modern ESM, targeting Node.js, Deno, Bun, and browsers
- Output is the FBP graph JSON format (processes, connections, inports, outports, groups, properties)
- Semantic compatibility with the reference `fbp` parser, verified by differential parity tests running both parsers with the same explicit options
- Defaults to `caseSensitive: true` per the NoFlo 2.x case-sensitivity policy
- Syntax errors report line/column positions
- Corpus entries reclassified to match actual reference-parser behavior: `Read(ReadFile)DATA->IN …` (missing whitespace) and bare `true`/`null` node names are rejected; `A (a) -> B(b)` and two default port declarations on one line are accepted, matching the reference parser exactly under both case-sensitivity settings
