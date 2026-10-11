//     @noflo/assembly - Message relay conventions for NoFlo
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT

/**
 * @file wrapAssembly module
 * @description Best-effort library-wide assembly decoration over a
 *   component registry (work document #36). Components that wrap cleanly
 *   become assembly participants; the rest stay native, with the skipped
 *   names and reasons reported.
 */

import { asAssembly } from "./asAssembly.js";

/**
 * @typedef {import("./asAssembly.js").AsAssemblyMapping} AsAssemblyMapping
 */
/**
 * Per-library wrapping configuration.
 *
 * @typedef {Object} WrapAssemblyLibrary
 * @property {string} library - Library namespace to decorate (for example `filesystem`)
 * @property {AsAssemblyMapping} [mapping] - Mapping overrides applied to every component of the library, keyed by component name
 */
/**
 * @typedef {Object} WrapAssemblyConfig
 * @property {WrapAssemblyLibrary[]} [libraries] - Libraries to decorate
 * @property {(report: { name: string, reason: string }) => void} [onSkip] - Called for every component the wrapper declines
 */
/**
 * A skip report entry.
 *
 * @typedef {Object} WrapSkip
 * @property {string} name - Full component name
 * @property {string} reason - Why the wrapper declined the component
 */

/**
 * The underlying registry shape used here: the subset of the
 * ComponentRegistry contract the decorator needs.
 *
 * @typedef {Object} WrapAssemblyRegistry
 * @property {() => Object<string, any>} list - Component catalog
 * @property {(name: string) => Promise<any>} get - Resolve a component definition
 */

/**
 * Wrap every component of the configured libraries in the registry as
 * assembly participants, leaving the rest native. Returns a decorated
 * registry with the same `list`/`get` contract: `list()` reports the
 * wrapped definitions, `get(name)` resolves them (fresh instances per
 * resolution — the wrapped component is a graph, instantiated per load).
 *
 * Decoration is best-effort: no surveyed library is fully wrappable, so
 * components the wrapper declines (addressable ports, streaming shapes)
 * stay native and land in the skip report. Skipped components resolve
 * through to their original definitions.
 *
 * @param {WrapAssemblyRegistry} registry - The application registry to decorate
 * @param {WrapAssemblyConfig} config - Which libraries to wrap and how
 * @returns {WrapAssemblyRegistry & { skips: WrapSkip[] }}
 */
export function wrapAssembly(registry, /** @type {WrapAssemblyConfig} */ config = {}) {
  /** @type {WrapSkip[]} */
  const skips = [];
  /** @type {Object<string, any>} */
  const wrapped = {};
  const libraries = config.libraries ?? [];

  const matches = (name) =>
    libraries.some((lib) => {
      const prefix = `${lib.library}/`;
      return name.startsWith(prefix);
    });

  for (const [name, definition] of Object.entries(registry.list())) {
    if (!matches(name)) {
      continue;
    }
    const library = libraries.find((lib) =>
      name.startsWith(`${lib.library}/`),
    );
    const componentName = name.split("/")[1];
    try {
      const module = /** @type {any} */ (definition);
      const getComponent =
        typeof module?.getComponent === "function"
          ? module.getComponent
          : typeof definition === "function"
            ? (...args) => new (/** @type {any} */ (definition))(...args)
            : null;
      if (!getComponent) {
        // Graph models and other definitions stay native
        skips.push({
          name,
          reason: "definition is not a code component",
        });
        continue;
      }
      const inner = getComponent();
      const graph = asAssembly(inner, {
        target: name,
        mapping: library.mapping?.[componentName],
      });
      wrapped[name] = graph;
    } catch (err) {
      skips.push({
        name,
        reason: /** @type {Error} */ (err).message,
      });
    }
  }

  if (typeof config.onSkip === "function") {
    for (const skip of skips) {
      config.onSkip(skip);
    }
  }

  return {
    skips,
    list() {
      const catalog = { ...registry.list() };
      for (const [name, definition] of Object.entries(wrapped)) {
        catalog[name] = definition;
      }
      return catalog;
    },
    async get(name) {
      if (wrapped[name]) {
        return wrapped[name];
      }
      if (registry.get) {
        return registry.get(name);
      }
      return registry.list()[name];
    },
  };
}
