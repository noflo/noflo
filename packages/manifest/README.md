# @noflo/manifest

Publish-time component manifest generation for NoFlo libraries.

Generates the library-published data artifact from the NoFlo published
manifest design: a single `noflo.json` covering every `components/` and
`graphs/` entry of a library, readable without executing any library
code.

## What the manifest contains

- **Per component**: library-namespaced name, path, kind
  (`elementary` for code modules, `subgraph` for graph components),
  full port signature (`name`, `datatype`, `addressable`,
  `description`, `required`, `control`), description, icon, the
  associated fbp-spec suite path, the Assembly Line convention flag,
  and a derived `platforms` set (browser / node / deno / bun, from
  static import analysis following the dependency ladder)
- **Per graph**: signatures statically derived from exported ports, and
  `references` — the library-namespaced component names the graph wires
  in, so consumers can resolve the install closure from data alone
- **Library level**: namespace id, description, icon, npm package name,
  git source URL and revision, and a `loader` flag mirroring the
  `noflo.loader` package.json key (a dynamic loader means the catalog
  is not exhaustive)
- **`namespaces` map**: every referenced library namespace resolved to
  its providing npm package
- **Schema artifacts** (work document #37): a `schemas` table keyed by
  `ns/name` id — each entry carries the SHA-256 digest of the published
  body (RFC 8785 canonicalization), its in-package path, the computed
  `implements` interface-closure ids, and the body's `examples` (kept
  publish-side for the revision-acceptance backstop); an
  `anonymousSchemas` section for inline port schemas hoisted into
  content-addressed `schemas/<digest>.json` entries; and a
  `foreignSchemas` section for references resolved through the
  dependency closure. Ports carry the resolved `schema` reference (id +
  digest) and the derived in-band `guard`. Publishing enforces the gate:
  closure resolvability, reserved-namespace ownership (`std`, `ui`,
  `runtime`, `noflo`, `assembly`), cross-document reference cycles,
  closed interfaces, meta-schema identity against the artifacts shipped
  from `@noflo/fbp-protocol`, dependency digest matches, and revision
  acceptance of the prior manifest's `examples`

Elementary signatures are harvested at publish time by calling each
module's `getComponent()` — the author's own code on the author's
machine, the only execution in the pipeline.

## Usage

Command line, from the library's package root:

    noflo-manifest generate

This writes `noflo.json`. Add it to the package's `files` list and
generate it as a publish-workflow step.

Programmatic:

```js
import { generateManifest } from "@noflo/manifest";

const manifest = await generateManifest(baseDir, { revision: "abc123" });
```

## Notes

- Graph signature derivation is data-first: an export's port metadata
  is read from the in-package harvested signature of the wired
  component, or from a dependency's published manifest when it ships
  one. Only when neither source has the wired component does the
  derivation fall back to loading it — so the tool must run where the
  library's dependencies are installed (publish CI), and a graph-only
  library whose dependencies ship manifests has an entirely static
  pipeline.
- Platform derivation is static import analysis: dynamic `import()`
  and `export ... from` clauses are recognized, but relative imports
  are not walked transitively, and import-looking text inside comments
  counts as an import.
- Dynamic loaders (`noflo.loader`) cannot be enumerated without
  execution; the manifest flags their presence instead.
- Unresolved namespaces are a hard failure: if a graph references a
  namespace with no installed provider, generation errors naming the
  namespace rather than shipping a manifest that cannot resolve its
  closure.
