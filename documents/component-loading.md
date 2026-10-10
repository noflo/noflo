# Component loading in NoFlo 2.0

This document captures the component-loading architecture introduced by the registry-only core (work documents #6 and #16), including the patterns applications use to supply components. It is living documentation: extend it as more loading patterns solidify on the 2.0 line.

## The registry contract

NoFlo core no longer discovers components. An application supplies a component registry when constructing a loader or network:

- `list()` — required. Returns the component catalog as an object mapping names to component definitions. Synchronous: the registry is ready and populated at handoff, and the loader reads it once at construction
- `get(name)` — optional. Resolves a component by name asynchronously, covering names not present in `list()` (lazy imports, #593-style dummy components for top-down design)
- `setSource(packageId, name, source, language)` and `getSource(name)` — optional. Source storage for systems that edit component code at runtime (FBP protocol runtimes, IDE sessions)
- `change` and `invalidate` events — optional. Registries that are EventTargets can signal updated components (`change`, with `detail: { name }`) or a fully changed catalog (`invalidate`); the loader refreshes its cache accordingly. Static registries simply never dispatch

A component definition is a platform-neutral value: an ESM module object exporting `getComponent`, a factory function returning a component instance, or a live `GraphModel` (or FBP JSON object) which the loader wraps in a subgraph. There are no path strings, no source evaluation, and no filesystem access in core.

## Minimal static registry (browser)

For an application with a few known components, the registry is a data literal:

```js
import * as noflo from "@noflo/noflo";

import * as Repeat from "./components/Repeat.js";
import * as Split from "./components/Split.js";

const registry = {
  list: () => ({
    "my-app/Repeat": Repeat,
    "my-app/Split": Split,
  }),
};

const network = await noflo.createNetwork(graph, { registry });
```

The values are the imported ESM module namespace objects themselves; the loader only requires `getComponent` to be a function on them. Graph components work the same way: put a `GraphModel` or FBP JSON object in the list and the loader instantiates the `Subgraph` wrapper around it.

No class, no factory, no build step, no bundler plugin. The 1.x equivalent required generating a loader module with the `noflo-component-loader` webpack plugin.

## Lazy registry (code-splitting)

To keep components out of the initial bundle, resolve them through `get()` and give them name-only entries in the catalog. Catalog entries with falsy values fall through to `get()` at load time:

```js
const registry = {
  list: () => ({
    "my-app/Repeat": undefined, // catalog name only, resolved via get()
  }),
  get: (name) =>
    name === "my-app/Repeat" ? import("./components/Repeat.js") : undefined,
};
```

`get()` stays asynchronous so the same contract also covers registries backed by URL maps, HTTP fetches, or other dynamic sources.

## Node.js: @noflo/loader-node

On Node.js (also Deno and Bun), filesystem and `node_modules` discovery is provided by the `@noflo/loader-node` package as a registry implementation:

```js
import noflo from "@noflo/noflo";
import { createNodeModulesRegistry } from "@noflo/loader-node";

const registry = await createNodeModulesRegistry(process.cwd());
const network = await noflo.createNetwork(graph, { registry });
```

The factory discovers components and graph files (registering graphs as pre-parsed `GraphModel`s), supports the `fbp.json` manifest cache (`noflo-cache-preheat`), transpiles TypeScript components when a compiler is installed, evaluates component sources for `setSource`, and drives `noflo.loader` plugin modules from package manifests. A plugin module's default export is a function receiving a registration shim (`registerComponent`, `registerGraph`, `setLibraryIcon`) and returning a Promise (or nothing) that settles when its registration work is done.

## Passing registries around

- `new noflo.ComponentLoader({ registry })` constructs a loader around a registry
- `noflo.createNetwork(graph, { registry })` and `noflo.asCallback(component, { registry })` construct one when no loader is given
- Subgraph child networks inherit the parent loader, so the registry applies to the whole network tree
- Runtimes that edit component sources keep their own reference to the registry and call `setSource` on it directly; the loader stays current through `change` events

For migrating an existing 1.x component library to this architecture (layout, discovery rules, Process API, testing), see [component-library-migration.md](./component-library-migration.md).
