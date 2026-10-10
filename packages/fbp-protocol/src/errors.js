/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module errors
 * @description Error type for wire-format violations. Codecs throw this for
 *   truncated frames, unknown opcodes, and malformed payloads — a caller
 *   distinguishing protocol errors from bugs in its own code can rely on the
 *   class rather than message parsing.
 */
/* @ts-self-types="./errors.d.ts" */

/**
 * Error thrown when a buffer or payload violates the FBP Protocol 2.0 wire
 * format (work document #4).
 */
export class ProtocolError extends Error {
  /**
   * Create a protocol error, annotating it with the offending command code
   * when known.
   *
   * @param {string} message
   * @param {number} [opcode] Command code the frame claimed, when known.
   */
  constructor(message, opcode) {
    super(
      opcode === undefined
        ? message
        : `${message} (opcode 0x${opcode.toString(16)})`,
    );
    /** @type {string} */
    this.name = "ProtocolError";
    /** @type {number|undefined} Command code the frame claimed, when known */
    this.opcode = opcode;
  }
}
