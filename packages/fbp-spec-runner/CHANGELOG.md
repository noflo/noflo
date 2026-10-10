# Changelog

## Unreleased
### Added
- Explicit graph fixture support, compatible with the reference fbp-spec runner: suites may declare `fixture: {type: 'json', data: ...}` (FBP graph JSON) or `fixture: {type: 'fbp', data: ...}` (FBP DSL source, parsed case-insensitively like the reference `fbp` parser). Fixture graphs run as real NoFlo networks sharing the suite's ComponentLoader, with inputs and expectations addressed through the graph's exported inports and outports. New `./fixture` module resolves fixture graphs with fbp-spec-compatible error messages
- fbp-spec error semantics: a data packet arriving on a port named `error` fails the case unless the case expects data on that port; the port can also be asserted against like any other
- Expectation operator semantics aligned with the released fbp-spec@0.8.0: `contains` matches array members with deep equality and supports deep-equal subset checks on objects; `above`/`below` accept any ordered values, not just numbers; `haveKeys`/`includeKeys` take keys from any value without an upfront object type check; `noterror` passes non-errors silently. The `type` operator keeps chai `a()` type-name semantics (`array`, `null`, `date`, `regexp`), matching the released chai-based fbp-spec — the unreleased ESM rewrite of fbp-spec switching it to `typeof` was fixed upstream in fbp-spec itself
- The package ships to JSR: `jsr.json` manifest with the CLI (`.`) and the programmatic modules (`./compiler`, `./network`, `./assertions`, `./loader`) as entrypoints, generated TypeScript declarations for the `src/` modules and the vendored bundles (adjacent `.d.ts`, emitted by `npm run types`), and `@ts-self-types` pointers so JSR scores the typed surface

## [2.0.0-alpha.2] - 2026-10-09
- Socket event wiring uses the EventTarget API (`addEventListener`), so running the tester no longer emits NoFlo EventEmitter deprecation warnings

## [2.0.0-alpha.1] - 2026-10-08
### Added
- Initial implementation of the in-process fbp-spec runner: YAML (multi-suite) and JSON spec loading, `node:test`-based suite/case compilation with skip and timeout support, deterministic data-IP execution with pairwise input/expect sequences, and the full fbp-spec expectation operator vocabulary (`equals`, `above`, `below`, `type`, `haveKeys`, `includeKeys`, `contains`, `noterror`, `path`) mapped to `node:assert/strict`
- Vendored, version-pinned third-party bundles for JSONPath and YAML parsing (see `vendor/`), regenerable via `node utils/generate-vendors.js`
