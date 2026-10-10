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

- The tool must run where the library's dependencies are installed
  (publish CI), since graph signature derivation resolves the internal
  components of graph exports.
- Dynamic loaders (`noflo.loader`) cannot be enumerated without
  execution; the manifest flags their presence instead.
