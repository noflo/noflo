//     @noflo/loader-node - Node.js component discovery for NoFlo
//     (c) 2013-2026 Flowhub UG
//     SPDX-License-Identifier: EUPL-1.2

/**
 * Node.js component discovery and source storage for NoFlo, implemented
 * as a `ComponentRegistry` (work document #16).
 *
 * @example
 * import noflo from "noflo";
 * import { createNodeModulesRegistry } from "@noflo/loader-node";
 *
 * const registry = await createNodeModulesRegistry(process.cwd());
 * const loader = new noflo.ComponentLoader({ registry });
 *
 * @module @noflo/loader-node
 */

export {
  NodeModulesRegistry,
  createNodeModulesRegistry,
} from "./registry.js";
export {
  loadGraphFile,
  loadGraphJson,
  saveGraphFile,
} from "./graphFile.js";
