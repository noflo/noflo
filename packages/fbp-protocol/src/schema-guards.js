//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @module schema-guards
 * @description The in-band validation guard vocabulary (work document #37
 *   §3.1): a bounded, closed-vocabulary projection of a port schema's
 *   cheaply-checkable assertions. Guards ride the signature itself, so a
 *   Tier A runtime checks packets with comparisons alone and never loads a
 *   schema body — a full JSON Schema validator is never a core or runtime
 *   dependency, and never on the runtime path.
 *
 *   Guards under-approximate, never over-restrict: anything not projectable
 *   is simply absent. An omitted check beats a wrong one.
 */

/* @ts-self-types="./schema-guards.d.ts" */

/**
 * Maximum number of entries a guard `enum` may carry. The bound is spec
 * policy (work document #37 §3.1): over-bound enums are omitted rather than
 * truncated, because truncation would reject valid packets.
 *
 * @type {number}
 */
export const GUARD_ENUM_LIMIT = 64;

/**
 * The guard type vocabulary: JSON primitives a `typeof`/`Array.isArray`
 * check can decide. `integer` is the one refinement over `typeof` — a
 * number that is also integral.
 *
 * @type {ReadonlySet<string>}
 */
export const GUARD_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
]);

/**
 * An in-band validation guard. All fields optional; absent fields check
 * nothing.
 *
 * @typedef {object} Guard
 * @property {string} [type] One of {@link GUARD_TYPES}.
 * @property {Array<string|number|boolean>} [enum] Bounded scalar membership list.
 * @property {number} [min] Inclusive numeric lower bound.
 * @property {number} [max] Inclusive numeric upper bound.
 * @property {string[]} [required] Property names that must be present on object payloads.
 */

/**
 * Validate a guard against the closed vocabulary: unknown keys, unknown
 * types, non-scalar enums, over-bound enums, and non-string required lists
 * are construction errors. Guards may be published only in canonical shape.
 *
 * @param {Guard} guard
 * @returns {void}
 * @throws {TypeError} When the guard leaves the vocabulary.
 */
export function validateGuard(guard) {
  if (guard === null || typeof guard !== "object" || Array.isArray(guard)) {
    throw new TypeError("guard must be an object");
  }
  for (const key of Object.keys(guard)) {
    if (!["type", "enum", "min", "max", "required"].includes(key)) {
      throw new TypeError(
        `guard key '${key}' is outside the closed vocabulary`,
      );
    }
  }
  if (guard.type !== undefined) {
    if (typeof guard.type !== "string" || !GUARD_TYPES.has(guard.type)) {
      throw new TypeError("guard type must be one of the vocabulary types");
    }
  }
  if (guard.enum !== undefined) {
    if (!Array.isArray(guard.enum)) {
      throw new TypeError("guard enum must be an array");
    }
    if (guard.enum.length > GUARD_ENUM_LIMIT) {
      throw new TypeError(
        `guard enum exceeds the ${GUARD_ENUM_LIMIT}-entry bound`,
      );
    }
    for (const entry of guard.enum) {
      if (
        (typeof entry !== "string" &&
          typeof entry !== "number" &&
          typeof entry !== "boolean") ||
        !Number.isFinite(entry)
      ) {
        throw new TypeError("guard enum entries must be scalars");
      }
    }
  }
  for (const key of ["min", "max"]) {
    const bound = guard[key];
    if (
      bound !== undefined &&
      (typeof bound !== "number" || !Number.isFinite(bound))
    ) {
      throw new TypeError(`guard ${key} must be a finite number`);
    }
  }
  if (guard.required !== undefined) {
    if (
      !Array.isArray(guard.required) ||
      guard.required.some((key) => typeof key !== "string")
    ) {
      throw new TypeError("guard required must be an array of property names");
    }
  }
}

/**
 * Project a JSON Schema body onto the guard vocabulary. The projection
 * algorithm (work document #37 §3.1) is the consistency-lint reference:
 *
 * - `type` projects only when the schema's `type` is a single vocabulary
 *   string; array-form types such as `["string", "null"]` project nothing
 * - `enum` projects only when every entry is a scalar within the bound;
 *   over-bound enums omit rather than truncate
 * - `min`/`max` project from `minimum`/`maximum` only when the exclusive
 *   forms are absent — guard bounds are inclusive
 * - `required` is the union across root-level `allOf` members, with `$ref`
 *   members resolved through the closure resolver before projecting;
 *   anything unresolvable omits the whole key
 *
 * @param {Record<string, any>} schema A JSON Schema 2020-12 document (or entry).
 * @param {((ref: string) => Record<string, any>|null|undefined)} [resolveRef]
 *   Optional closure resolver for `$ref` members of root-level `allOf`.
 * @returns {Guard} The projected guard; fields absent when not projectable.
 */
export function projectGuard(schema, resolveRef = null) {
  /** @type {Guard} */
  const guard = {};
  if (typeof schema?.type === "string" && GUARD_TYPES.has(schema.type)) {
    guard.type = schema.type;
  }
  if (
    Array.isArray(schema?.enum) &&
    schema.enum.length <= GUARD_ENUM_LIMIT &&
    schema.enum.every(
      (entry) =>
        typeof entry === "string" ||
        (typeof entry === "number" && Number.isFinite(entry)) ||
        typeof entry === "boolean",
    )
  ) {
    guard.enum = [...schema.enum];
  }
  if (
    typeof schema?.minimum === "number" &&
    Number.isFinite(schema.minimum) &&
    schema.exclusiveMinimum === undefined
  ) {
    guard.min = schema.minimum;
  }
  if (
    typeof schema?.maximum === "number" &&
    Number.isFinite(schema.maximum) &&
    schema.exclusiveMaximum === undefined
  ) {
    guard.max = schema.maximum;
  }
  const required = projectRequired(schema, resolveRef, new Set());
  if (required) guard.required = required;
  return guard;
}

/**
 * Project the `required` key: the union of the schema's own `required` and
 * the `required` of root-level `allOf` members, with `$ref` members
 * resolved through the closure. Any unresolvable member omits the whole
 * key — under-approximation, never over-restriction.
 *
 * @param {Record<string, any>} schema
 * @param {((ref: string) => Record<string, any>|null|undefined)|null} resolveRef
 * @param {Set<string>} seen Refs already on the resolution path (cycle guard).
 * @returns {string[]|undefined}
 */
function projectRequired(schema, resolveRef, seen) {
  /** @type {Set<string>} */
  const union = new Set();
  if (isRequiredList(schema.required)) {
    for (const key of schema.required) union.add(key);
  }
  if (Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      if (
        member === null ||
        typeof member !== "object" ||
        Array.isArray(member)
      ) {
        return undefined;
      }
      if (typeof member.$ref === "string") {
        if (member.$ref.startsWith("#") || seen.has(member.$ref)) continue;
        const resolved = resolveRef?.(member.$ref);
        if (!resolved || typeof resolved !== "object") return undefined;
        const nested = projectRequired(
          resolved,
          resolveRef,
          new Set([...seen, member.$ref]),
        );
        if (!nested) return undefined;
        for (const key of nested) union.add(key);
        continue;
      }
      if (isRequiredList(member.required)) {
        for (const key of member.required) union.add(key);
      }
    }
  }
  if (union.size === 0) return undefined;
  return [...union].sort();
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isRequiredList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((key) => typeof key === "string")
  );
}

/**
 * Check a decoded packet value against a guard. Comparison-only: no schema
 * body is ever loaded, no validator logic runs. This is the Tier A runtime
 * diagnostic — a false return means the packet is *suspect*, never
 * structurally rejected (convergence integrity outranks schema enforcement,
 * work document #37 §6).
 *
 * @param {Guard} guard
 * @param {any} value
 * @returns {boolean} True when the value satisfies every guard field.
 */
export function checkGuard(guard, value) {
  if (guard === null || typeof guard !== "object") return true;
  if (guard.type !== undefined && !guardTypeMatches(guard.type, value)) {
    return false;
  }
  if (
    guard.enum !== undefined &&
    !guard.enum.some((entry) => entry === value)
  ) {
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
      return (
        value !== null && typeof value === "object" && !Array.isArray(value)
      );
    default:
      return true;
  }
}
