# Changelog

## [Unreleased]

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
