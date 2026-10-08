/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * Structural validation for parsed FBP graphs.
 *
 * Mirrors the reference `fbp` parser's `validateContents` checks, including
 * error messages, and provides a zero-dependency structural validator used for
 * the optional `validateSchema` option.
 *
 * @module
 */

/**
 * @typedef {import('./parse.js').GraphJson} GraphJson
 */

/**
 * Checks that all processes have components and that all exported ports and
 * connections reference known processes.
 *
 * @param {GraphJson} graph
 * @returns {void}
 * @throws {Error} On the first reference to a missing component or process.
 */
export function validateContents(graph) {
  for (const node of Object.keys(graph.processes)) {
    if (!graph.processes[node].component) {
      throw new Error(`Node "${node}" does not have a component defined`);
    }
  }
  for (const port of Object.keys(graph.inports)) {
    const portDefinition = graph.inports[port];
    if (!graph.processes[portDefinition.process]) {
      throw new Error(
        `Inport "${port}" is connected to an undefined target node "${portDefinition.process}"`,
      );
    }
  }
  for (const port of Object.keys(graph.outports)) {
    const portDefinition = graph.outports[port];
    if (!graph.processes[portDefinition.process]) {
      throw new Error(
        `Outport "${port}" is connected to an undefined source node "${portDefinition.process}"`,
      );
    }
  }
  for (const edge of graph.connections) {
    if (edge.tgt && !graph.processes[edge.tgt.process]) {
      if (edge.data || !edge.src) {
        throw new Error(
          `IIP containing "${edge.data}" is connected to an undefined target node "${edge.tgt.process}"`,
        );
      }
      throw new Error(
        `Edge from "${edge.src.process}" port "${edge.src.port}" is connected to an undefined target node "${edge.tgt.process}"`,
      );
    }
    if (edge.src && !graph.processes[edge.src.process]) {
      throw new Error(
        `Edge to "${edge.tgt.process}" port "${edge.tgt.port}" is connected to an undefined source node "${edge.src.process}"`,
      );
    }
  }
}

/**
 * Structural validation of a graph against the FBP graph format invariants.
 *
 * The reference parser validates against a JSON Schema when the
 * `validateSchema` option is enabled. This package performs the equivalent
 * structural checks without a schema dependency: the parser can only produce
 * well-formed shapes, so this is a final safety net rather than a full
 * schema evaluation.
 *
 * @param {GraphJson} graph
 * @returns {void}
 * @throws {Error} When the graph does not match the FBP graph format.
 */
export function validateSchema(graph) {
  /** @type {string[]} */
  const errors = [];
  if (typeof graph !== "object" || graph === null || Array.isArray(graph)) {
    throw new Error(
      "fbp: Did not validate against graph schema:\ngraph must be an object",
    );
  }
  if (typeof graph.caseSensitive !== "boolean") {
    errors.push("caseSensitive must be a boolean");
  }
  if (typeof graph.processes !== "object" || graph.processes === null) {
    errors.push("processes must be an object");
  } else {
    for (const name of Object.keys(graph.processes)) {
      const process = graph.processes[name];
      if (typeof process !== "object" || process === null) {
        errors.push(`process "${name}" must be an object`);
        continue;
      }
      if (
        process.component !== undefined &&
        typeof process.component !== "string"
      ) {
        errors.push(`process "${name}" component must be a string`);
      }
      if (
        process.metadata !== undefined &&
        (typeof process.metadata !== "object" || process.metadata === null)
      ) {
        errors.push(`process "${name}" metadata must be an object`);
      }
    }
  }
  if (!Array.isArray(graph.connections)) {
    errors.push("connections must be an array");
  } else {
    for (const connection of graph.connections) {
      if (typeof connection !== "object" || connection === null) {
        errors.push("connection must be an object");
        continue;
      }
      const hasSource = connection.src !== undefined;
      const hasData = connection.data !== undefined;
      if (!hasSource && !hasData) {
        errors.push("connection must have either a src or a data property");
      }
      if (hasData && hasSource) {
        errors.push("connection must not have both src and data properties");
      }
      if (connection.tgt === undefined) {
        errors.push("connection must have a tgt property");
      } else if (!isValidPort(connection.tgt)) {
        errors.push("connection tgt must have string process and port");
      }
      if (hasSource && !isValidPort(connection.src)) {
        errors.push("connection src must have string process and port");
      }
    }
  }
  const directions = /** @type {const} */ (["inports", "outports"]);
  for (const direction of directions) {
    const ports = graph[direction];
    if (typeof ports !== "object" || ports === null) {
      errors.push(`${direction} must be an object`);
      continue;
    }
    for (const name of Object.keys(ports)) {
      if (!isValidPort(ports[name])) {
        errors.push(`${direction} "${name}" must have string process and port`);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `fbp: Did not validate against graph schema:\n${errors.join("\n")}`,
    );
  }
}

/**
 * @param {any} port
 * @returns {boolean}
 */
function isValidPort(port) {
  return (
    typeof port === "object" &&
    port !== null &&
    typeof port.process === "string" &&
    typeof port.port === "string"
  );
}
