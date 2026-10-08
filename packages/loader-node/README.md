# @noflo/loader-node

Node.js component discovery and source storage for
[NoFlo](https://noflojs.org), implemented as a `ComponentRegistry`.

The package discovers components from a project directory and its
`node_modules` dependencies, and provides the registry to NoFlo core:

```js
import noflo from "@noflo/noflo";
import { createNodeModulesRegistry } from "@noflo/loader-node";

const registry = await createNodeModulesRegistry(process.cwd());
const loader = new noflo.ComponentLoader({ registry });
```

## Features

* Component discovery from `components/` folders across the dependency tree
* Graph files (`.fbp`, `.json`) register as pre-parsed graph models
* TypeScript components load with on-the-fly transpilation when a
  TypeScript compiler is installed
* Component source storage via `setSource`/`getSource`, including
  fbp-spec test files
* `change`/`invalidate` events for runtime source editing
* `noflo-cache-preheat` tool for populating the `fbp.json` manifest cache

## License

EUPL-1.2
