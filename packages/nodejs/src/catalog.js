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
import { normalizeLibraryName } from "@noflo/loader-node";
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
 * Read the project's own library namespace: the `package.json` name under
 * the NoFlo naming conventions. Signature uploads materialize into this
 * project's `components/` directory, so a stub's reboot-stable identity
 * is this namespace's — uploads naming another library are rejected, this
 * host does not own those components.
 *
 * @param {string} baseDir
 * @returns {Promise<string|null>} The normalized library name, or null when the project has no readable named package.json
 */
async function projectLibraryName(baseDir) {
  try {
    const contents = await readFile(
      path.resolve(baseDir, "package.json"),
      "utf-8",
    );
    const name = JSON.parse(contents).name;
    if (typeof name === "string" && name) {
      return normalizeLibraryName(name);
    }
  } catch (_err) {
    // No package.json or unreadable: no own namespace to materialize into
  }
  return null;
}

/**
 * Whether a registered component definition is a stub: instantiable as a
 * component that self-describes as one. Graph models and factories that
 * cannot construct count as implementations — the safe side of
 * implementation wins.
 *
 * @param {any} definition
 * @returns {boolean}
 */
function definitionIsStub(definition) {
  /** @type {any} */
  let instance = null;
  try {
    if (typeof definition?.getComponent === "function") {
      instance = definition.getComponent();
    } else if (typeof definition === "function") {
      const isClass =
        definition.prototype?.constructor === definition &&
        /^\s*class\s/.test(String(definition));
      instance = isClass ? new definition() : definition();
    }
  } catch (_err) {
    return false;
  }
  if (!instance || typeof instance !== "object") {
    return false;
  }
  return typeof instance.isStub === "function" ? instance.isStub() : false;
}

/**
 * Look up a stored component source under the key forms the registry
 * uses: `storeSource` keys `sourcesForComponents` as
 * `${packageId}/${name}`, which for library-less packages is the
 * `/${name}` form — not the bare name the catalog registers under.
 *
 * @param {import("@noflo/loader-node").NodeModulesRegistry} registry
 * @param {...string} names - Candidate key forms to probe
 * @returns {{ language: string, source: string }|undefined}
 */
function storedSourceFor(registry, ...names) {
  const stored = /** @type {any} */ (registry).sourcesForComponents ?? {};
  for (const name of names) {
    if (stored[name]) {
      return stored[name];
    }
  }
  return undefined;
}

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
 * signature-harvested eagerly at construction, and the snapshot stays
 * live — every write path re-derives the affected entry in place, so the
 * registry protocol's post-write `refresh()`, the `0x24` details, the
 * registry hash, and the execution guard resolver (which holds the same
 * snapshot object) all see uploaded stubs and newly written source
 * without a restart.
 *
 * When the host's node-modules registry is supplied, the catalog also
 * backs the `0x25`/`0x26` source hooks (work document #19): a source
 * payload that classifies as a signature declaration materializes as a
 * `components/<name>.json` sidecar and registers as a StubComponent — the
 * upload path for top-down design — while anything else stores as
 * component source through the registry's own `setSource`, implementing a
 * stub in place. Upload rules:
 *
 * - The stub's stable identity is the project's own library namespace
 *   (its package.json name, normalized): the upload must use that prefix
 *   or none, and the stub registers under the full project-namespace name
 *   — the same name discovery re-derives on every boot. Uploads naming
 *   another library are rejected: this host does not own those
 *   components, and materializing them would change identity on restart.
 * - Implementation wins (work document #24 update #2): a signature upload
 *   is rejected when an implementation exists anywhere it can — a source
 *   file in the project's `components/`, a stored source, or any live
 *   catalog entry that is not itself a stub. Refining an existing stub's
 *   signature stays allowed.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader
 * @param {import("@noflo/loader-node").NodeModulesRegistry} [registry] The
 *   host's component registry; also the persistence root for materialized
 *   sidecars (its `baseDir`)
 * @returns {Promise<import("@noflo/runtime/registry-protocol").RuntimeCatalog>}
 */
export async function catalogFromLoader(loader, registry = null) {
  /** @type {Record<string, import("@noflo/fbp-protocol").ComponentDetail>} */
  const snapshot = {};
  const list = await loader.listComponents();
  for (const name of Object.keys(list)) {
    const component = await loader.load(name);
    snapshot[name] = await componentDetail(component);
  }
  if (!registry) {
    return {
      signatures: () => snapshot,
    };
  }
  const baseDir = registry.baseDir;

  /**
   * Re-derive one catalog entry after a write: let the loader's change
   * bookkeeping settle (the registry's `change` dispatch resolves
   * asynchronously), load the written component, and patch the snapshot
   * in place — the object reference every consumer holds. A component
   * that no longer loads drops from the snapshot: the registry keeps the
   * broken definition, and the next load attempt surfaces the loud error.
   *
   * @param {string} name
   * @returns {Promise<void>}
   */
  async function rederive(name) {
    await new Promise((resolve) => setImmediate(resolve));
    try {
      const instance = await loader.load(name);
      snapshot[name] = await componentDetail(instance);
    } catch (_err) {
      delete snapshot[name];
    }
  }

  return {
    signatures: () => snapshot,
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
        await rederive(componentName);
        return;
      }
      // Signature upload: the stub's stable identity is the project's own
      // library namespace. Another library's prefix is rejected outright —
      // this host does not own installed components, and materializing a
      // stub under a foreign prefix would change identity on reboot
      const { library, bareName } = splitComponentName(componentName);
      const projectPrefix = await projectLibraryName(baseDir);
      if (projectPrefix === null) {
        throw new Error(
          `Cannot upload a signature stub for ${componentName}: the project has no readable named package.json, so there is no library namespace to materialize the stub into`,
        );
      }
      if (library && library !== projectPrefix) {
        throw new Error(
          `Cannot upload a signature stub for ${componentName}: signature stubs materialize into this project's components/ directory, so the library prefix must be the project's own ('${projectPrefix}') or absent — '${library}' names another library, whose components this host does not own`,
        );
      }
      const stableName = projectPrefix
        ? `${projectPrefix}/${bareName}`
        : bareName;
      // Implementation wins, checked everywhere an implementation can
      // live: a source file in the project's components directory, a
      // stored source, or a live catalog entry that is not itself a stub
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
        if (implemented) {
          throw new Error(
            `Component ${stableName} is already implemented — refusing to overwrite it with a signature stub (implementation wins)`,
          );
        }
      }
      if (
        storedSourceFor(registry, componentName, stableName, `/${bareName}`)
      ) {
        throw new Error(
          `Component ${stableName} is already implemented — refusing to overwrite it with a signature stub (implementation wins)`,
        );
      }
      /** @type {Record<string, any>} */
      const catalog = /** @type {any} */ (registry).components ?? {};
      // A parseable sidecar for this name is itself the stub declaration:
      // reaching this point with one on disk means no implementation file
      // and no stored source exist, so this upload refines that stub —
      // even if the previously registered factory cannot construct (a
      // signature the stub constructor rejects, for instance)
      let declaredStub = false;
      try {
        const existingSidecar = await readFile(
          path.resolve(baseDir, "components", `${bareName}.json`),
          "utf-8",
        );
        declaredStub = parseSignaturePayload(existingSidecar) !== null;
      } catch (_err) {
        // No sidecar: the live catalog decides
      }
      const existing = catalog[stableName] ?? catalog[componentName];
      if (!declaredStub && existing && !definitionIsStub(existing)) {
        throw new Error(
          `Component ${stableName} is already implemented — refusing to overwrite it with a signature stub (implementation wins)`,
        );
      }
      // Validate by construction before any state changes: the stub
      // constructor's loud, named checks — duplicate port names,
      // non-string datatypes, control on an outport, control-only
      // signatures under the throw policy — reject the upload here, with
      // no disk state touched. Persisting first would poison the workdir:
      // the entry would vanish from the snapshot (rederive drops what
      // cannot load) and every boot would fail loading the component
      // until another upload overwrote the sidecar
      StubComponent.fromSignature(stableName, signature);
      // Materialize the sidecar in the project workdir — the same shape
      // noflo-ui writes — canonicalized for byte-stable disk state, then
      // register the stub factory under the stable project-namespace name
      // and signal the catalog change. The file is the persistence:
      // discovery re-derives the stub on every boot under this same name
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
      registry.registerComponent(projectPrefix, bareName, {
        getComponent: () => StubComponent.fromSignature(stableName, signature),
      });
      registry.invalidate();
      await rederive(stableName);
    },
    /**
     * @param {string} componentName
     * @returns {Promise<string|null>}
     */
    readSource: async (componentName) => {
      const { bareName } = splitComponentName(componentName);
      // A stored implementation source wins over the sidecar: source and
      // signature are orthogonal, and once a stub is implemented the
      // implementation is the truth — checking both key forms the
      // registry's storeSource produces
      const stored = storedSourceFor(registry, componentName, `/${bareName}`);
      if (stored) {
        return stored.source;
      }
      // A stub-only entry's source is its signature sidecar: the read
      // round-trips the upload exactly
      try {
        const sidecar = await readFile(
          path.resolve(baseDir, "components", `${bareName}.json`),
          "utf-8",
        );
        if (parseSignaturePayload(sidecar)) {
          return sidecar;
        }
      } catch (_err) {
        // No sidecar: fall through to the registry's own source surface
      }
      try {
        const source = await registry.getSource(componentName);
        return source.code;
      } catch (_err) {
        // Native components and factories without stored source or
        // sidecar hold no readable source
        return null;
      }
    },
  };
}
