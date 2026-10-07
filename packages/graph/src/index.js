/**
 * @file index module
 * @description `@noflo/graph` — the native graph model for NoFlo 2.x
 *   (work document #10): nodes, edges, IIPs, exports, and groups over one
 *   entity model with plain and CRDT operation modes, plus FBP JSON as an
 *   interchange adapter.
 */

export { stableStringify } from "./graph/canonical.js";
export {
  entityKinds,
  GraphModelError,
} from "./graph/entities.js";
export { exportFbpJson, importFbpJson } from "./graph/fbpJson.js";
export { GraphModel } from "./graph/GraphModel.js";
