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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  COMPONENT_TYPE,
  collectSchemaRefs,
  digestSchema,
  parseSchemaRef,
  projectGuard,
  validateGuard,
} from "@noflo/fbp-protocol";
import { StubComponent } from "@noflo/noflo";

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
 * The component source extensions an implementation can exist as in the
 * project's `components/` directory. A stub upload refuses to overwrite
 * any of them — implementation wins (work document #24 update #2).
 *
 * @type {string[]}
 */
const implementationExtensions = [".js", ".ts", ".coffee", ".litcoffee"];

/**
 * Split a library-namespaced component name into its library prefix and
 * bare component name. A name without a slash keeps the empty library.
 *
 * @param {string} componentName
 * @returns {{ library: string, bareName: string }}
 */
function splitComponentName(componentName) {
  const slash = componentName.indexOf("/");
  if (slash === -1) {
    return { library: "", bareName: componentName };
  }
  return {
    library: componentName.slice(0, slash),
    bareName: componentName.slice(slash + 1),
  };
}

/**
 * Classify a `0x25` source payload: a parseable JSON object whose
 * `inports` and `outports` are both arrays is a signature declaration —
 * the on-disk sidecar shape noflo-ui materializes (work documents #19 and
 * #24) — not component source. The two grammars do not overlap: component
 * sources are JS/TS/Coffee, a signature is this fixed JSON shape. The
 * classification belongs to the catalog — the signature owner — not to
 * the wire: `0x25` stays an opaque string payload, and a runtime whose
 * catalog does not implement the convention treats the payload as source.
 *
 * @param {string} source
 * @returns {Object<string, any>|null} The signature, or null when the payload is component source
 */
export function parseSignaturePayload(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (_err) {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  if (!Array.isArray(parsed.inports) || !Array.isArray(parsed.outports)) {
    return null;
  }
  return parsed;
}

/**
 * Sort object keys recursively, so a materialized sidecar is byte-stable
 * across uploads (the noflo-ui materializer's own emission order).
 *
 * @param {any} value
 * @returns {any}
 */
function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    /** @type {Object<string, any>} */
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Build a {@link RuntimeCatalog} for `assembleRuntime` from a component
 * loader: every component in the loader's catalog is instantiated and
 * signature-harvested eagerly, so the registry snapshot is complete before
 * the first client syncs.
 *
 * When the host's node-modules registry is supplied, the catalog also
 * backs the `0x25`/`0x26` source hooks (work document #19): a source
 * payload that classifies as a signature declaration materializes as a
 * `components/<name>.json` sidecar and registers as a StubComponent — the
 * upload path for top-down design — while anything else stores as
 * component source through the registry's own `setSource`, implementing a
 * stub in place. A signature upload over an existing implementation is
 * rejected: implementation wins, the sidecar never replaces code.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader
 * @param {import("@noflo/loader-node").NodeModulesRegistry} [registry] The
 *   host's component registry; also the persistence root for materialized
 *   sidecars (its `baseDir`)
 * @returns {Promise<import("@noflo/runtime/registry-protocol").RuntimeCatalog>}
 */
export async function catalogFromLoader(loader, registry = null) {
  /** @type {Record<string, import("@noflo/fbp-protocol").ComponentDetail>} */
  const signatures = {};
  const list = await loader.listComponents();
  for (const name of Object.keys(list)) {
    const component = await loader.load(name);
    signatures[name] = await componentDetail(component);
  }
  if (!registry) {
    return {
      signatures: () => signatures,
    };
  }
  const baseDir = registry.baseDir;
  return {
    signatures: () => signatures,
    /**
     * @param {string} componentName
     * @param {string} source
     * @returns {Promise<void>}
     */
    writeSource: async (componentName, source) => {
      const signature = parseSignaturePayload(source);
      if (!signature) {
        // Component source: store and evaluate through the registry. A
        // source write to a stub-only entry implements it in place; the
        // sidecar stays on disk, ignored while the implementation exists
        const { library, bareName } = splitComponentName(componentName);
        await registry.setSource(library, bareName, source, "javascript");
        return;
      }
      // Signature upload: refuse to stub over an implementation. The disk
      // is the truth, so the check is file presence — a setSource-written
      // implementation is covered by the registry's own bookkeeping
      const { library, bareName } = splitComponentName(componentName);
      for (const extension of implementationExtensions) {
        const candidate = path.resolve(
          baseDir,
          "components",
          `${bareName}${extension}`,
        );
        let implemented = false;
        try {
          await readFile(candidate);
          implemented = true;
        } catch (_err) {
          // Not there
        }
        if (implemented || registry.sourcesForComponents[componentName]) {
          throw new Error(
            `Component ${componentName} is already implemented — refusing to overwrite it with a signature stub (implementation wins)`,
          );
        }
      }
      // Materialize the sidecar in the project workdir — the same shape
      // noflo-ui writes — canonicalized for byte-stable disk state, then
      // register the stub factory and signal the catalog change. The file
      // is the persistence: discovery re-derives the stub on every boot
      signature.name = bareName;
      const sidecarPath = path.resolve(
        baseDir,
        "components",
        `${bareName}.json`,
      );
      await mkdir(path.dirname(sidecarPath), { recursive: true });
      await writeFile(
        sidecarPath,
        `${JSON.stringify(sortKeys(signature), null, 2)}\n`,
        "utf-8",
      );
      registry.registerComponent(library, bareName, {
        getComponent: () =>
          StubComponent.fromSignature(componentName, signature),
      });
      registry.invalidate();
    },
    /**
     * @param {string} componentName
     * @returns {Promise<string|null>}
     */
    readSource: async (componentName) => {
      // A stub-only entry's source is its signature sidecar: the read
      // round-trips the upload exactly
      const { bareName } = splitComponentName(componentName);
      try {
        const sidecar = await readFile(
          path.resolve(baseDir, "components", `${bareName}.json`),
          "utf-8",
        );
        if (parseSignaturePayload(sidecar)) {
          return sidecar;
        }
      } catch (_err) {
        // No sidecar: fall through to the implementation's stored source
      }
      try {
        const source = await registry.getSource(componentName);
        return source.code;
      } catch (_err) {
        // Native components, graph models, and stub factories without a
        // sidecar hold no readable source
        return null;
      }
    },
  };
}
