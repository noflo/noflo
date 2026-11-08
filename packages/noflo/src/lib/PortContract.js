//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT
/* @ts-self-types="./PortContract.d.ts" */

/**
 * @file PortContract module
 * @description Port-contract enforcement (work document #50): policy
 *   resolution and admission checks over the projected guard vocabulary.
 *
 *   Ports declare contracts (datatype floors, schema refs, projected
 *   guards); this module is what enforces them in-process, at admission —
 *   build-time edge subsumption, outport send, and initial-IIP injection.
 *   The middle of the graph is never re-checked: with wiring subsumption
 *   verified at build, each packet is checked at most once, where it
 *   enters the system.
 *
 *   The guard vocabulary here mirrors `checkGuard` in `@noflo/fbp-protocol`
 *   (type, enum, min/max, required) — the same comparison-only projection
 *   the publish pipeline derives. Full JSON Schema validation stays at the
 *   boundaries; no validator dependency enters the core.
 *
 *   Enforcement is policy, not declaration: `off` (default, today's
 *   behavior), `diagnostic` (check and record, never drop), and `strict`
 *   (violations are loud — build rejections at graph-construction time,
 *   process-error escalation at send time). Resolution is hierarchical,
 *   the same shape as edge `highWaterMark`: edge metadata, then the
 *   receiving port's declaration, then the sending port's, then the
 *   network runtime default.
 */

/**
 * The enforcement policies, in increasing strictness.
 *
 * @typedef {"off"|"diagnostic"|"strict"} ContractPolicy
 */

/** @type {ContractPolicy[]} */
export const CONTRACT_POLICIES = ["off", "diagnostic", "strict"];

/** @type {ContractPolicy} */
export const DEFAULT_CONTRACT_POLICY = "off";

/**
 * Resolve a policy from a candidate chain: the first defined value wins.
 *
 * @param {...(ContractPolicy|undefined|null)} candidates - Most specific first (edge metadata, receiving port, sending port, network default)
 * @returns {ContractPolicy}
 */
export function resolveContractPolicy(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    if (CONTRACT_POLICIES.includes(candidate)) {
      return candidate;
    }
    throw new Error(
      `Invalid port-contract policy '${candidate}': valid are ${CONTRACT_POLICIES.join(", ")}`,
    );
  }
  return DEFAULT_CONTRACT_POLICY;
}


/**
 * The strictest of the candidate policies: the elevation rule for
 * surfaces where two sides' declarations both apply (an edge's build-time
 * subsumption is demanded by either endpoint's declaration).
 *
 * @param {...(ContractPolicy|undefined|null)} candidates
 * @returns {ContractPolicy}
 */
export function strictestContractPolicy(...candidates) {
  /** @type {ContractPolicy} */
  let strictest = DEFAULT_CONTRACT_POLICY;
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    if (!CONTRACT_POLICIES.includes(candidate)) {
      throw new Error(
        `Invalid port-contract policy '${candidate}': valid are ${CONTRACT_POLICIES.join(", ")}`,
      );
    }
    if (
      CONTRACT_POLICIES.indexOf(candidate) >
      CONTRACT_POLICIES.indexOf(strictest)
    ) {
      strictest = candidate;
    }
  }
  return strictest;
}

/**
 * An in-band validation guard: the comparison-only projection of a port
 * schema. All fields optional; absent fields check nothing.
 *
 * @typedef {Object} Guard
 * @property {string} [type] One of string, number, integer, boolean, array, object.
 * @property {Array<string|number|boolean>} [enum] Bounded scalar membership list.
 * @property {number} [min] Inclusive numeric lower bound.
 * @property {number} [max] Inclusive numeric upper bound.
 * @property {string[]} [required] Property names that must be present on object payloads.
 */

/**
 * Whether a value matches a guard type in the comparison vocabulary.
 *
 * @param {string} type
 * @param {any} value
 * @returns {boolean}
 */
function guardTypeMatches(type, value) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Whether a value satisfies a guard: the same comparison-only vocabulary
 * the wire's diagnostic tier applies (`checkGuard` in
 * `@noflo/fbp-protocol`).
 *
 * @param {Guard|null|undefined} guard
 * @param {any} value
 * @returns {boolean}
 */
export function guardAccepts(guard, value) {
  if (guard === null || typeof guard !== "object") return true;
  if (guard.type !== undefined && !guardTypeMatches(guard.type, value)) {
    return false;
  }
  if (guard.enum !== undefined && !guard.enum.some((entry) => entry === value)) {
    return false;
  }
  if (typeof value === "number") {
    if (guard.min !== undefined && value < guard.min) return false;
    if (guard.max !== undefined && value > guard.max) return false;
  }
  if (
    guard.required !== undefined &&
    (value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      guard.required.some((key) => !(key in value)))
  ) {
    return false;
  }
  return true;
}

/**
 * Whether a guard type satisfies another guard's type demand: a demand
 * on `number` is satisfied by values `integer` guarantees, not the other
 * way around.
 *
 * @param {string|undefined} sourceType
 * @param {string|undefined} targetType
 * @returns {boolean}
 */
function typeSubsumes(sourceType, targetType) {
  if (targetType === undefined) {
    return true;
  }
  if (sourceType === undefined) {
    // An absent source type makes no structural promise
    return false;
  }
  if (sourceType === targetType) {
    return true;
  }
  return sourceType === "integer" && targetType === "number";
}

/**
 * Whether a numeric bound is demanded by the target.
 *
 * @param {number|undefined} bound
 * @returns {boolean}
 */
function hasBound(bound) {
  return bound !== undefined;
}

/**
 * Whether everything the source guard guarantees satisfies everything
 * the target guard demands — the build-time subsumption check for an
 * edge. An absent source guard makes no structural promise and cannot
 * satisfy a guarded target; an absent or empty target guard accepts
 * anything.
 *
 * @param {Guard|null|undefined} source
 * @param {Guard|null|undefined} target
 * @returns {boolean}
 */
export function guardSubsumes(source, target) {
  const targetHasDemands =
    target !== null &&
    typeof target === "object" &&
    (target.type !== undefined ||
      target.enum !== undefined ||
      target.min !== undefined ||
      target.max !== undefined ||
      target.required !== undefined);
  if (!targetHasDemands) {
    return true;
  }
  if (source === null || typeof source !== "object") {
    // The source makes no structural promise; a guarded target cannot
    // be guaranteed from it
    return false;
  }
  if (target.type !== undefined && !typeSubsumes(source.type, target.type)) {
    return false;
  }
  if (target.enum !== undefined) {
    if (source.enum === undefined) {
      return false;
    }
    for (const entry of source.enum) {
      if (!target.enum.some((candidate) => candidate === entry)) {
        return false;
      }
    }
  }
  if (target.min !== undefined) {
    if (!hasBound(source.min) || source.min < target.min) {
      return false;
    }
  }
  if (target.max !== undefined) {
    if (!hasBound(source.max) || source.max > target.max) {
      return false;
    }
  }
  if (target.required !== undefined) {
    if (source.required === undefined) {
      return false;
    }
    for (const key of target.required) {
      if (!source.required.some((candidate) => candidate === key)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Describe the first structural reason a guard fails a value, for
 * diagnostic messages. Empty string when the value passes.
 *
 * @param {Guard|null|undefined} guard
 * @param {any} value
 * @returns {string}
 */
export function describeGuardViolation(guard, value) {
  if (guardAccepts(guard, value)) {
    return "";
  }
  if (guard.type !== undefined && !guardTypeMatches(guard.type, value)) {
    const actual =
      value === null
        ? "null"
        : Array.isArray(value)
          ? "array"
          : typeof value;
    return `expected ${guard.type}, got ${actual}`;
  }
  if (guard.enum !== undefined && !guard.enum.some((entry) => entry === value)) {
    return `value is outside the declared enum`;
  }
  if (typeof value === "number") {
    if (guard.min !== undefined && value < guard.min) {
      return `value is below the declared minimum ${guard.min}`;
    }
    if (guard.max !== undefined && value > guard.max) {
      return `value is above the declared maximum ${guard.max}`;
    }
  }
  if (
    guard.required !== undefined &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const missing = guard.required.filter((key) => !(key in value));
    if (missing.length > 0) {
      return `missing required field(s): ${missing.join(", ")}`;
    }
  }
  return "value does not satisfy the guard";
}

/**
 * A port-contract violation. Raised in strict mode: build rejections at
 * graph-construction time, send-time escalation at delivery.
 */
export class PortContractError extends Error {
  /**
   * @param {string} message
   * @param {{ policy: ContractPolicy, surface: string, port: string }} detail
   */
  constructor(message, detail) {
    super(message);
    this.name = "PortContractError";
    this.policy = detail.policy;
    this.surface = detail.surface;
    this.port = detail.port;
  }
}
