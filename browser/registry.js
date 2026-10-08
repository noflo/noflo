/**
 * (c) 2021-2026 Henri Bergius
 * @file browser/registry.js
 * @description Static browser component registry per the #6/#16
 *   `ComponentRegistry` contract, the pattern noflo-ui's next branch uses:
 *   a name → ESM URL catalog with lazy `import()` resolution. The registry
 *   is an `EventTarget` so the loader can subscribe to `change` events for
 *   live component registration (user-created components, #593-style dummy
 *   registries for top-down design).
 *
 *   `list()` returns the catalog synchronously. Entries are `null` markers:
 *   the implementations are not imported until `get()` resolves them, so
 *   the loader falls back to `get()` for every load. `register()` adds an
 *   entry and dispatches `change` (`detail: { name }`), driving the
 *   loader's cache refresh.
 */

/**
 * @returns {import("@noflo/noflo").ComponentRegistry & {
 *   register: (name: string, url: string) => void,
 * }}
 */
export function createBrowserRegistry() {
  /** @type {Map<string, string>} */
  const urls = new Map();
  /** @type {EventTarget & Record<string, any>} */
  const registry = /** @type {any} */ (new EventTarget());

  registry.list = () =>
    Object.fromEntries([...urls.keys()].map((name) => [name, null]));

  registry.get = async (/** @type {string} */ name) => {
    const url = urls.get(name);
    if (!url) {
      return undefined;
    }
    const mod = await import(/* @vite-ignore */ url);
    return mod.getComponent ?? mod.default ?? mod;
  };

  /**
   * Register a component URL and signal the change to subscribers.
   *
   * @param {string} name
   * @param {string} url
   * @returns {void}
   */
  registry.register = (name, url) => {
    urls.set(name, url);
    registry.dispatchEvent(
      new CustomEvent("change", { detail: { name } }),
    );
  };

  return /** @type {any} */ (registry);
}
