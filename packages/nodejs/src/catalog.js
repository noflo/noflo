//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module catalog
 * @description Derives the runtime's component catalog from the host's
 *   component loader (work document #31): every discovered component is
 *   instantiated once and its port definitions projected to the
 *   `0x24`-shaped signatures the FBP Protocol registry serves.
 *
 *   A local host executes the project's own components anyway, so
 *   constructor-time harvesting is the same trust level as running them.
 *   Once `@noflo/manifest` lands (noflo/noflo#1076), libraries that ship a
 *   published `noflo.json` manifest can serve their signatures data-first;
 *   the harvest stays as the fallback for libraries without a manifest.
 */
/* @ts-self-types="./catalog.d.ts" */

import { COMPONENT_TYPE } from "@noflo/fbp-protocol";

/**
 * Project one port collection to the wire's `PortInfo` list. Only
 * non-default fields are emitted, keeping signatures close to what
 * component authors actually declared.
 *
 * @param {import("@noflo/noflo").InPorts|import("@noflo/noflo").OutPorts} ports
 * @param {boolean} isInport
 * @returns {Array<import("@noflo/fbp-protocol").PortInfo>}
 */
function portInfos(ports, isInport) {
  return Object.entries(ports.ports ?? {}).map(([name, port]) => {
    const options = /** @type {any} */ (port).options ?? {};
    /** @type {any} */
    const info = {
      id: name,
      type: options.datatype || "all",
    };
    if (options.addressable) {
      info.addressable = true;
    }
    if (options.description) {
      info.description = options.description;
    }
    if (options.required) {
      info.required = true;
    }
    // Control-port identification rides the InPort's own option, matching
    // the manifest harvest's field (noflo-ui work document #40)
    if (isInport && options.control) {
      info.control = true;
    }
    if (options.values !== undefined) {
      info.values = options.values;
    }
    if (options.default !== undefined) {
      info.default = options.default;
    }
    return info;
  });
}

/**
 * Derive the wire signature for one component instance.
 *
 * @param {any} component An instantiated NoFlo component
 * @returns {import("@noflo/fbp-protocol").ComponentDetail}
 */
export function componentDetail(component) {
  const type = component.isStub?.()
    ? COMPONENT_TYPE.STUB
    : component.isSubgraph()
      ? COMPONENT_TYPE.SUBGRAPH
      : COMPONENT_TYPE.ELEMENTARY;
  const detail = {
    type,
    in: portInfos(component.inPorts, true),
    out: portInfos(component.outPorts, false),
  };
  // Component-level description and icon, matching the manifest harvest's
  // component fields (external review: UIs render icons)
  if (component.description) {
    detail.description = component.description;
  }
  const icon = component.getIcon?.() ?? component.icon;
  if (icon) {
    detail.icon = icon;
  }
  return detail;
}

/**
 * Build a {@link RuntimeCatalog} for `assembleRuntime` from a component
 * loader: every component in the loader's catalog is instantiated and
 * signature-harvested eagerly, so the registry snapshot is complete before
 * the first client syncs.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader
 * @returns {Promise<import("@noflo/runtime/registry-protocol").RuntimeCatalog>}
 */
export async function catalogFromLoader(loader) {
  /** @type {Record<string, import("@noflo/fbp-protocol").ComponentDetail>} */
  const signatures = {};
  const list = await loader.listComponents();
  for (const name of Object.keys(list)) {
    const component = await loader.load(name);
    signatures[name] = componentDetail(component);
  }
  return {
    signatures: () => signatures,
  };
}
