/**
 * Parser for the .fbp flow-based programming language.
 *
 * Produces FBP graph JSON from `.fbp` DSL source. Zero dependencies, standard
 * JavaScript only: runs on Node.js, Deno, Bun, and browsers.
 *
 * Semantically compatible with the reference `fbp` parser: the same inputs are
 * accepted and rejected, and accepted inputs produce the same graph JSON.
 * Unlike the reference parser this package defaults to `caseSensitive: true`
 * and tolerates being called without an options argument.
 *
 * @module @noflo/fbp
 * @example
 * import { parse } from '@noflo/fbp';
 * const graph = parse("'hello' -> IN Display(Output)");
 */

export { parse, SyntaxError } from "./parse.js";
