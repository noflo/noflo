//     @noflo/assembly - Message relay conventions for NoFlo
//     SPDX-License-Identifier: MIT

/**
 * @module catalog
 * @description The `assembly` metadata catalog (work document #37 §3.2):
 *   the config-class metadata keys `asAssembly`-generated adapter graphs
 *   carry. Owned by this package — the namespace is reserved to it — and
 *   shipped as a digest-addressed JSON artifact in the package's
 *   `schemas/` directory, with this dependency-free mirror in `src`. The
 *   test suite verifies the two stay identical.
 */

/* @ts-self-types="./catalog.d.ts" */

import { AssemblyCatalog } from "./schemas/catalog.js";

/**
 * The `assembly` namespace catalog body.
 *
 * @type {Record<string, any>}
 */
export const ASSEMBLY_CATALOG = AssemblyCatalog;
