# Changelog

## Unreleased

- Initial 2.x line: `noflo-assembly-utils` ingested into the monorepo as `@noflo/assembly-utils` (work document #36), preserving history and authorship
- Components ported to the Process API on ESM with `@noflo/noflo` and `@noflo/assembly` as peer dependencies
- `ComparePath` renames its `handle` hook to `processMessage` per the `@noflo/assembly` 2.x API decision (work document #27 update #3)
- fbp-spec suites ported to `node:test`### Changed

-  now uses  instead of the  package, dropping the esprima/static-eval expression-evaluation stack from the dependency tree. Semantic difference: jsonpath-plus resolves syntactically invalid paths to  instead of throwing, so an unresolvable path routes the message to FAIL without accumulating an error. The dependency is declared to JSR via the  mapping ().

