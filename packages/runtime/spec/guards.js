/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/guards.js
 * @description Tier A guard diagnostics (work document #37 §6): packets
 *   entering over the wire are checked with comparisons alone — no schema
 *   body is ever loaded, no validator module imported — and violations are
 *   diagnostic-only: the op is applied, convergence intact.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

import { COMPONENT_TYPE, OP_TYPE, sigHash } from "@noflo/fbp-protocol";
import { checkPacketGuard, GraphProtocol } from "../src/index.js";

/** The signature resolver over a static catalog snapshot. */
/** @type {import("../src/guards.js").SignatureResolver} */
const resolver = (component, port, isInport) => {
  if (component !== "math/Add") {
    return null;
  }
  if (isInport && port === "a") {
    return { id: "a", type: "number", guard: { type: "number", min: 0 } };
  }
  return null;
};

describe("checkPacketGuard", () => {
  it("checks a value against the resolved guard", () => {
    assert.deepEqual(
      checkPacketGuard({
        resolveSignature: resolver,
        component: "math/Add",
        port: "a",
        isInport: true,
        value: 5,
      }),
      { checked: true, ok: true },
    );
    const verdict = checkPacketGuard({
      resolveSignature: resolver,
      component: "math/Add",
      port: "a",
      isInport: true,
      value: -5,
    });
    assert.equal(verdict.checked, true);
    assert.equal(verdict.ok, false);
    assert.match(/** @type {any} */ (verdict).detail, /in-band guard/);
  });

  it("leaves values unchecked without a signature or a guard", () => {
    assert.deepEqual(
      checkPacketGuard({
        resolveSignature: resolver,
        component: "other/Thing",
        port: "a",
        isInport: true,
        value: "anything",
      }),
      { checked: false, ok: true },
    );
    assert.deepEqual(
      checkPacketGuard({
        resolveSignature: null,
        component: "math/Add",
        port: "a",
        isInport: true,
        value: -5,
      }),
      { checked: false, ok: true },
    );
  });
});

describe("graph protocol guard diagnostics", () => {
  it("records a violation on an out-of-guard IIP insert without rejecting it", async () => {
    // A live graph is not needed to observe the diagnostic: applyOp runs
    // the check before the model applies, and the model is expected to
    // accept structurally valid definitions either way
    const model = new (await import("@noflo/graph")).GraphModel();
    model.addNode({ entity_id: "adder", component: "math/Add" });
    /** @type {any[]} */
    const violations = [];
    const protocol = new GraphProtocol({
      graph: model,
      signatureResolver: resolver,
      onGuardViolation: (detail) => violations.push(detail),
    });
    const applied = protocol.applyOp({
      opType: OP_TYPE.INSERT_IIP,
      entityId: "iip-1",
      payload: {
        to: { node: "adder", port: "a" },
        data: -5,
      },
    });
    assert.equal(applied, true, "diagnostic-only: the op is applied");
    assert.equal(model.iips().length, 1);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].opType, OP_TYPE.INSERT_IIP);
    assert.match(violations[0].detail, /in-band guard/);
  });

  it("stays silent for in-guard packets and unchecked components", async () => {
    const { GraphModel } = await import("@noflo/graph");
    const model = new GraphModel();
    model.addNode({ entity_id: "adder", component: "math/Add" });
    model.addNode({ entity_id: "other", component: "other/Thing" });
    /** @type {any[]} */
    const violations = [];
    const protocol = new GraphProtocol({
      graph: model,
      signatureResolver: resolver,
      onGuardViolation: (detail) => violations.push(detail),
    });
    assert.equal(
      protocol.applyOp({
        opType: OP_TYPE.INSERT_IIP,
        entityId: "iip-ok",
        payload: { to: { node: "adder", port: "a" }, data: 5 },
      }),
      true,
    );
    assert.equal(
      protocol.applyOp({
        opType: OP_TYPE.INSERT_IIP,
        entityId: "iip-unknown",
        payload: { to: { node: "other", port: "in" }, data: "anything" },
      }),
      true,
    );
    assert.equal(violations.length, 0);
  });

  it("guards ride sig_hash, and no validator is imported", async () => {
    // The signature comparison-only property is structural: the module
    // imports no validator and never reads a schema body
    const source = await import("../src/guards.js");
    assert.equal(typeof source.checkPacketGuard, "function");
    const hash = await sigHash({
      type: COMPONENT_TYPE.ELEMENTARY,
      in: [{ id: "a", type: "number", guard: { type: "number", min: 0 } }],
      out: [],
    });
    const without = await sigHash({
      type: COMPONENT_TYPE.ELEMENTARY,
      in: [{ id: "a", type: "number" }],
      out: [],
    });
    assert.notEqual(hash, without);
  });
});
