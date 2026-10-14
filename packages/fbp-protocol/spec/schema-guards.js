//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2
//     @file spec/schema-guards.js
//     @description The in-band guard vocabulary (work document #37 §3.1):
//       closed-vocabulary validation, the projection algorithm with its
//       under-approximation rules, and the comparison-only packet check.

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  checkGuard,
  GUARD_ENUM_LIMIT,
  projectGuard,
  validateGuard,
} from "../src/schema-guards.js";

describe("validateGuard", () => {
  it("accepts guards within the closed vocabulary", () => {
    validateGuard({
      type: "integer",
      enum: [1, 2],
      min: 0,
      max: 10,
      required: ["x"],
    });
    validateGuard({});
  });

  it("rejects unknown keys and malformed fields", () => {
    assert.throws(() => validateGuard(/** @type {any} */ ({ pattern: "^a" })));
    assert.throws(() => validateGuard(/** @type {any} */ ({ type: "null" })));
    assert.throws(() =>
      validateGuard(/** @type {any} */ ({ enum: [{ nested: true }] })),
    );
    assert.throws(() =>
      validateGuard(
        /** @type {any} */ ({ enum: new Array(GUARD_ENUM_LIMIT + 1).fill(1) }),
      ),
    );
    assert.throws(() =>
      validateGuard(/** @type {any} */ ({ min: Number.NaN })),
    );
    assert.throws(() => validateGuard(/** @type {any} */ ({ required: [1] })));
    assert.throws(() => validateGuard(/** @type {any} */ ([])));
  });
});

describe("projectGuard", () => {
  it("projects a single-string type", () => {
    assert.deepEqual(projectGuard({ type: "integer" }), { type: "integer" });
  });

  it("omits array-form and non-vocabulary types", () => {
    assert.deepEqual(projectGuard({ type: ["string", "null"] }), {});
    assert.deepEqual(projectGuard({ type: "null" }), {});
  });

  it("projects bounded scalar enums", () => {
    assert.deepEqual(projectGuard({ enum: ["a", 2, false] }), {
      enum: ["a", 2, false],
    });
  });

  it("omits over-bound enums instead of truncating", () => {
    const overBound = Array.from({ length: GUARD_ENUM_LIMIT + 1 }, (_, i) => i);
    assert.deepEqual(projectGuard({ enum: overBound }), {});
    const atBound = Array.from({ length: GUARD_ENUM_LIMIT }, (_, i) => i);
    assert.deepEqual(projectGuard({ enum: atBound }), { enum: atBound });
  });

  it("omits enums carrying non-scalars", () => {
    assert.deepEqual(projectGuard({ enum: ["a", { b: 1 }] }), {});
    assert.deepEqual(projectGuard({ enum: ["a", null] }), {});
  });

  it("projects inclusive bounds and skips exclusive ones", () => {
    assert.deepEqual(projectGuard({ minimum: 0, maximum: 100 }), {
      min: 0,
      max: 100,
    });
    assert.deepEqual(projectGuard({ minimum: 0, exclusiveMaximum: 100 }), {
      min: 0,
    });
    assert.deepEqual(projectGuard({ exclusiveMinimum: 0, maximum: 10 }), {
      max: 10,
    });
  });

  it("unions required across root-level allOf members", () => {
    const schema = {
      type: "object",
      required: ["a"],
      allOf: [{ required: ["b"] }, { $ref: "shapes/base" }],
    };
    assert.deepEqual(
      projectGuard(schema, () => ({ required: ["c"] })),
      {
        type: "object",
        required: ["a", "b", "c"],
      },
    );
  });

  it("omits required when an allOf ref is unresolvable", () => {
    const schema = {
      type: "object",
      required: ["a"],
      allOf: [{ $ref: "ghost/base" }],
    };
    assert.deepEqual(
      projectGuard(schema, () => null),
      { type: "object" },
    );
  });

  it("omits required when an allOf ref cycle cannot resolve", () => {
    const schema = { allOf: [{ $ref: "shapes/self" }] };
    const body = { allOf: [{ $ref: "shapes/self" }] };
    assert.deepEqual(
      projectGuard(schema, () => body),
      {},
    );
  });

  it("never over-restricts: the unprojectable stays absent", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string", pattern: "^x" } },
      additionalProperties: false,
      oneOf: [{ required: ["x"] }, { required: ["y"] }],
    };
    assert.deepEqual(projectGuard(schema), { type: "object" });
  });
});

describe("checkGuard", () => {
  it("checks types, including the integer refinement", () => {
    assert.equal(checkGuard({ type: "integer" }, 3), true);
    assert.equal(checkGuard({ type: "integer" }, 3.5), false);
    assert.equal(checkGuard({ type: "integer" }, "3"), false);
    assert.equal(checkGuard({ type: "object" }, []), false);
    assert.equal(checkGuard({ type: "object" }, {}), true);
    assert.equal(checkGuard({ type: "object" }, null), false);
  });

  it("checks enum membership without type coercion", () => {
    const guard = { enum: [1, "one", true] };
    assert.equal(checkGuard(guard, 1), true);
    assert.equal(checkGuard(guard, true), true);
    assert.equal(checkGuard(guard, "1"), false);
    assert.equal(checkGuard(guard, null), false);
  });

  it("checks inclusive bounds on numbers only", () => {
    const guard = { min: 0, max: 10 };
    assert.equal(checkGuard(guard, 0), true);
    assert.equal(checkGuard(guard, 10), true);
    assert.equal(checkGuard(guard, 10.5), false);
    assert.equal(checkGuard(guard, "5"), true);
  });

  it("checks required keys on object payloads", () => {
    const guard = { required: ["a", "b"] };
    assert.equal(checkGuard(guard, { a: 1, b: 2 }), true);
    assert.equal(checkGuard(guard, { a: 1 }), false);
    assert.equal(checkGuard(guard, [1, 2]), false);
    assert.equal(checkGuard(guard, null), false);
  });

  it("passes everything when the guard is empty", () => {
    assert.equal(checkGuard({}, /** @type {any} */ (undefined)), true);
  });
});
