//     @noflo/loader-node - Node.js component discovery for NoFlo
//     (c) 2014-2026 Flowhub UG
//     SPDX-License-Identifier: EUPL-1.2

// Guess language from filename
/**
 * @param {string} filename
 * @returns {string}
 */
export function guessLanguageFromFilename(filename) {
  if (/.*\.ts$/.test(filename)) {
    return "typescript";
  }
  return "javascript";
}

// Local deprecation helper matching the NoFlo Platform semantics: loud
// console warning, or fatal under NOFLO_FATAL_DEPRECATED.
/**
 * @param {string} message
 * @returns {void}
 */
export function deprecated(message) {
  if (
    typeof process !== "undefined" &&
    process.env &&
    process.env.NOFLO_FATAL_DEPRECATED
  ) {
    throw new Error(message);
  }
  console.warn(message);
}
