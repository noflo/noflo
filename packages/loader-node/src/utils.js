/* @ts-self-types="./utils.d.ts" */

//     @noflo/loader-node - Node.js component discovery for NoFlo
//     (c) 2021-2026 Henri Bergius
//     (c) 2014-2020 Flowhub UG
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
