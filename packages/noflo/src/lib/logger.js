//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./logger.d.ts" */

import { isBrowser } from "./Platform.js";

/**
 * @file logger module
 * @description Native-API debug logger replacing the `debug` npm module
 *   (work document #17). Namespaced logging with wildcard toggling via
 *   `localStorage` (browsers) or the `DEBUG` environment variable (Node),
 *   negation, and consistent per-namespace coloring. No dependencies.
 */

/**
 * Read the active debug pattern: `localStorage.debug` on the web, the
 * `DEBUG` environment variable on server-side runtimes.
 *
 * Server runtimes are checked first and the `localStorage` probe only runs
 * when `isBrowser()` says so: merely touching the `localStorage` global in
 * Node.js 22+ triggers an ExperimentalWarning, which would spam every
 * library consumer that enables a debug namespace.
 *
 * @returns {string|null}
 */
function getPattern() {
  if (!isBrowser()) {
    if (typeof process === "undefined" || !process.env) return null;
    return process.env.DEBUG || null;
  }
  const stored = globalThis.localStorage?.getItem("debug");
  return stored || null;
}

/**
 * @typedef {Object} PatternMatcher
 * @property {RegExp} regex
 * @property {boolean} negate
 */

/** @type {string|null|undefined} */
let cachedPattern;
/** @type {PatternMatcher[]|null} */
let cachedMatchers = null;

/**
 * Parse a comma-separated debug pattern string into matchers. Results
 * are memoized per pattern string, so repeated calls skip re-parsing
 * unless the pattern changes.
 *
 * @param {string|null} patternString
 * @returns {PatternMatcher[]}
 */
function parsePatterns(patternString) {
  if (patternString === cachedPattern) {
    return /** @type {PatternMatcher[]} */ (cachedMatchers);
  }
  const matchers = (patternString || "")
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => {
      const negate = pattern.startsWith("-");
      const clean = negate ? pattern.slice(1) : pattern;
      // Wildcards are `*`; everything else is literal
      const regexSource = clean
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return {
        regex: new RegExp(`^${regexSource}$`),
        negate,
      };
    });
  cachedPattern = patternString;
  cachedMatchers = matchers;
  return matchers;
}

/**
 * Check whether a namespace is enabled under the current pattern.
 * Patterns are evaluated in order and the last match wins, so `-`
 * negations can override earlier wildcards.
 *
 * @param {string} namespace
 * @returns {boolean}
 */
function isEnabled(namespace) {
  const pattern = getPattern();
  if (!pattern) {
    return false;
  }
  let enabled = false;
  for (const { regex, negate } of parsePatterns(pattern)) {
    if (regex.test(namespace)) {
      enabled = !negate;
    }
  }
  return enabled;
}

/**
 * Generate a stable hue for a namespace so colors stay consistent
 * across sessions.
 *
 * @param {string} namespace
 * @returns {number}
 */
function namespaceHue(namespace) {
  const hash = namespace
    .split("")
    .reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0);
  return Math.abs(hash) % 360;
}

/**
 * Create a namespaced debug logger. When the namespace is not enabled,
 * the returned function is a no-op costing one pattern check per call.
 *
 * Enabled namespaces log to `console.debug` (browsers, with CSS
 * styling) or `console.error` (Node.js, with ANSI colors — matching
 * the `debug` module's stderr stream so standard output stays clean).
 *
 * @example
 * const log = createDebug("noflo:graph");
 * log("CRDT sync completed", { nodes: 12, edges: 15 });
 *
 * @param {string} namespace - Dot-separated logger namespace, e.g. `noflo:component:send`
 * @returns {((...args: any[]) => void) & { enabled: boolean }}
 */
export function createDebug(namespace) {
  /**
   * @param {...any} args
   * @returns {void}
   */
  const log = (...args) => {
    if (!log.enabled) {
      return;
    }
    if (typeof window !== "undefined") {
      const color = `hsl(${namespaceHue(namespace)}, 80%, 40%)`;
      console.debug(
        `%c${namespace}`,
        `color: ${color}; font-weight: bold;`,
        ...args,
      );
      return;
    }
    // ANSI colors 31-36
    const colorCode = (namespaceHue(namespace) % 6) + 31;
    console.error(`\x1b[${colorCode};1m${namespace}\x1b[0m`, ...args);
  };
  Object.defineProperty(log, "enabled", {
    get: () => isEnabled(namespace),
  });
  return log;
}
