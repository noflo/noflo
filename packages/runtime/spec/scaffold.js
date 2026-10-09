/* @ts-self-types="./index.d.ts" */
/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/scaffold.js
 * @description Smoke test for the package scaffold: the entrypoint and its
 *   full dependency graph import cleanly on every supported platform.
 */

import assert from "node:assert";
import { describe, it } from "node:test";

describe("scaffold", () => {
  it("imports the entrypoint and its dependency graph", async () => {
    const runtime = await import("../src/index.js");
    assert.ok(runtime);
    const protocol = await import("@noflo/fbp-protocol");
    assert.equal(protocol.PROTOCOL_VERSION, 2);
    const noflo = await import("@noflo/noflo");
    assert.equal(typeof noflo.createNetwork, "function");
    const { GraphModel } = await import("@noflo/graph");
    assert.equal(typeof GraphModel, "function");
    const { Reticulum } = await import("@reticulum/core");
    assert.equal(typeof Reticulum, "function");
  });
});
