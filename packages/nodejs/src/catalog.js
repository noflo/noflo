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

import {
  COMPONENT_TYPE,
  collectSchemaRefs,
  digestSchema,
  parseSchemaRef,
  projectGuard,
  validateGuard,
} from "@noflo/fbp-protocol";

/**
 * Project one port collection to the wire's `PortInfo` list. Only
 * non-default fields are emitted, keeping signatures close to what
 * component authors actually declared.
 *
 * Async because inline schema references digest here: the runtime
 * advertises what it can know from component source (work document #37
 * §3.1 phase-1 seam — references, not bodies).
 *
 * @param {import("@noflo/noflo").InPorts|import("@noflo/noflo").OutPorts} ports
 * @param {boolean} isInport
 * @returns {Promise<Array<import("@noflo/fbp-protocol").PortInfo>>}
 */
async function portInfos(ports, isInport) {
  return Promise.all(
    Object.entries(ports.ports ?? {}).map(async ([name, port]) => {
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
      // The schema layer (work document #37 §3.1): the runtime advertises
      // what component source declares. A string marker advertises its id
      // (compatibility vocabulary; the digest pin is publish work). An
      // inline object digests here when it is pin-stable — no `$id`
      // rewriting and no cross-document `$ref` pinning can change its bytes
      // — and its guard derives from the projection; inline objects with
      // references stay harvest-silent, covered by the manifest data path
      const marker = options.schema;
      if (typeof marker === "string") {
        info.schema = { id: marker };
      } else if (
        marker !== null &&
        typeof marker === "object" &&
        !Array.isArray(marker)
      ) {
        if (typeof marker.digest === "string") {
          // Already pinned (regenerated from a published manifest)
          info.schema =
            marker.id === undefined
              ? { digest: marker.digest }
              : { id: marker.id, digest: marker.digest };
        } else if (collectSchemaRefs(marker).length === 0) {
          const digest = await digestSchema(marker);
          info.schema =
            marker.$id === undefined
              ? { digest }
              : { id: parseSchemaRef(marker.$id).id, digest };
          if (options.guard === undefined || options.guard === null) {
            const projected = projectGuard(marker);
            if (Object.keys(projected).length) {
              info.guard = projected;
            }
          }
        }
      }
      if (options.guard !== null && options.guard !== undefined) {
        // A guard leaving the closed vocabulary fails loudly at component
        // load, like the other structural port options
        validateGuard(options.guard);
        info.guard = options.guard;
      }
      // The `values` and `default` inport options are not emitted: they
      // stay publish-time manifest data pending the schema design
      // (work document #37 §3.4)
      return info;
    }),
  );
}

/**
 * Derive the wire signature for one component instance.
 *
 * @param {any} component An instantiated NoFlo component
 * @returns {Promise<import("@noflo/fbp-protocol").ComponentDetail>}
 */
export async function componentDetail(component) {
  const type = component.isStub?.()
    ? COMPONENT_TYPE.STUB
    : component.isSubgraph()
      ? COMPONENT_TYPE.SUBGRAPH
      : COMPONENT_TYPE.ELEMENTARY;
  const detail = {
    type,
    in: await portInfos(component.inPorts, true),
    out: await portInfos(component.outPorts, false),
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
    signatures[name] = await componentDetail(component);
  }
  return {
    signatures: () => signatures,
  };
}
