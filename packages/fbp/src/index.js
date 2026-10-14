/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * Parser for the .fbp flow-based programming language.
 *
 * Produces FBP graph JSON from `.fbp` DSL source. Zero dependencies, standard
 * JavaScript only: runs on Node.js, Deno, Bun, and browsers.
 *
 * Semantically compatible with the reference `fbp` parser: for every input the
 * reference accepts, the same graph JSON is produced, and reference-rejected
 * inputs are rejected. One deliberate 2.x extension goes beyond the reference:
 * metadata values may carry `.` and `-` (float and negative coordinates, e.g.
 * `Node(Comp:x=10.5,y=-22.5)`), which the reference grammar rejects.
 * Unlike the reference parser this package defaults to `caseSensitive: true`
 * and tolerates being called without an options argument.
 *
 * @module @noflo/fbp
 * @example
 * import { parse } from '@noflo/fbp';
 * const graph = parse("'hello' -> IN Display(Output)");
 */

/* @ts-self-types="./index.d.ts" */

export { parse, SyntaxError } from "./parse.js";
export { toFBP } from "./toFbp.js";
