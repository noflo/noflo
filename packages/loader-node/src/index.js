/**
 * @noflo/loader-node - Node.js component discovery for NoFlo
 * (c) 2021-2026 Henri Bergius
 * (c) 2013-2020 Flowhub UG
 * SPDX-License-Identifier: EUPL-1.2
 *
 * Node.js component discovery and source storage for NoFlo, implemented
 * as a `ComponentRegistry` (work document #16).
 *
 * @example
 * import noflo from "@noflo/noflo";
 * import { createNodeModulesRegistry } from "@noflo/loader-node";
 *
 * const registry = await createNodeModulesRegistry(process.cwd());
 * const loader = new noflo.ComponentLoader({ registry });
 *
 * @module @noflo/loader-node
 */

/* @ts-self-types="./index.d.ts" */

export {
  loadGraphFile,
  loadGraphJson,
  saveGraphFile,
} from "./graphFile.js";
export {
  createNodeModulesRegistry,
  NodeModulesRegistry,
} from "./registry.js";
