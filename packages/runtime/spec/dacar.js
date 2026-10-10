/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/dacar.js
 * @description The native DACAR capability policy: a real Dacar engine
 *   granting one capability relation on the runtime object resolves to the
 *   right capability-mask bits; the coarse allRelation grant short-circuits
 *   to the full mask; unknown peers get nothing.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { CAPABILITY, ProtocolError } from "@noflo/fbp-protocol";
import { Identity, toHex } from "@reticulum/core";
import {
  Action,
  Clock,
  Config,
  DEFAULT_SALT,
  Engine,
  NamespaceHasher,
  Operation,
  StateVector,
  Tuple,
} from "@reticulum/dacar";
import { CAPABILITY_RELATIONS, DacarCapabilityPolicy } from "../src/dacar.js";
import { RuntimeServer } from "../src/index.js";
import { staticPolicy } from "./policy.js";

/** Build an engine with one granted relation for the grantee. */
async function engineWith(grants) {
  const issuer = await Identity.generate();
  const grantee = await Identity.generate();
  const hasher = new NamespaceHasher(DEFAULT_SALT);
  const clock = new Clock();
  const config = new Config({ rootTrustAnchors: [issuer.identityHash] });
  const state = new StateVector();
  for (const relation of grants) {
    const tuple = await Tuple.fromPlaintext({
      objectId: "fbp.runtime",
      relation,
      grantee: grantee.identityHash,
      issuer: issuer.identityHash,
      hasher,
    });
    const operation = new Operation({
      tuple,
      action: Action.GRANT,
      hlc: clock.now(),
    });
    const signed = await operation.sign(issuer);
    state.apply(signed);
  }
  return { engine: new Engine(config, state), grantee };
}

describe("DacarCapabilityPolicy", () => {
  it("maps granted relations to capability-mask bits", async () => {
    const { engine, grantee } = await engineWith([
      CAPABILITY_RELATIONS.GRAPH_EDIT,
      CAPABILITY_RELATIONS.TELEMETRY_READ,
    ]);
    const policy = new DacarCapabilityPolicy({
      engine,
      objectId: "fbp.runtime",
    });
    const mask = await policy.resolve(toHex(grantee.identityHash), null);
    assert.equal(mask & CAPABILITY.GRAPH_EDIT, CAPABILITY.GRAPH_EDIT);
    assert.equal(mask & CAPABILITY.TELEMETRY_READ, CAPABILITY.TELEMETRY_READ);
    // Not granted: run control, source writes.
    assert.equal(mask & CAPABILITY.LIFECYCLE_CTRL, 0);
    assert.equal(mask & CAPABILITY.COMPONENT_WRITE, 0);
  });

  it("grants nothing to identities without tuples", async () => {
    const { engine } = await engineWith([CAPABILITY_RELATIONS.GRAPH_READ]);
    const stranger = await Identity.generate();
    const policy = new DacarCapabilityPolicy({
      engine,
      objectId: "fbp.runtime",
    });
    const mask = await policy.resolve(toHex(stranger.identityHash), null);
    assert.equal(mask, 0);
  });

  it("rejects malformed identity hashes instead of resolving to zeros", async () => {
    const { engine } = await engineWith(["access"]);
    const policy = new DacarCapabilityPolicy({
      engine,
      objectId: "fbp.runtime",
    });
    for (const malformed of ["zzz", "abc", "", "0x1234"]) {
      await assert.rejects(
        () => policy.resolve(malformed, null),
        ProtocolError,
      );
    }
  });

  it("short-circuits the coarse allRelation grant to the full mask", async () => {
    const { engine, grantee } = await engineWith(["access"]);
    const policy = new DacarCapabilityPolicy({
      engine,
      objectId: "fbp.runtime",
      allRelation: "access",
    });
    const mask = await policy.resolve(toHex(grantee.identityHash), null);
    assert.equal(mask & CAPABILITY.GRAPH_EDIT, CAPABILITY.GRAPH_EDIT);
    assert.equal(mask & CAPABILITY.LIFECYCLE_CTRL, CAPABILITY.LIFECYCLE_CTRL);
    assert.equal(mask & CAPABILITY.ADMIN, CAPABILITY.ADMIN);
  });

  it("serves the runtime server's capabilityPolicy seam end to end", async () => {
    const { engine, grantee } = await engineWith(["access"]);
    const policy = new DacarCapabilityPolicy({
      engine,
      objectId: "fbp.runtime",
      allRelation: "access",
    });
    /** @type {{sent: {bytes: Uint8Array, context: any}[]}} */
    const log = { sent: [] };
    const serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: serverPolicy,
      send: (bytes, context) => log.sent.push({ bytes, context }),
      capabilityPolicy: (identityHash, context) =>
        policy.resolve(identityHash, context),
    });
    await server.authorize("link-1", toHex(grantee.identityHash));
    assert.ok(log.sent.length > 0);
  });
});
