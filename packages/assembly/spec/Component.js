import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as noflo from "@noflo/noflo";

import { getComponent as getBuildFrame } from "../example/components/BuildFrame.js";
import { getComponent as getMountEngine } from "../example/components/MountEngine.js";
import { getComponent as getOrder } from "../example/components/Order.js";

/**
 * Minimal stand-in for the noflo-wrapper test harness: drives a
 * component directly through internal sockets.
 * @param {import("@noflo/noflo").Component} component
 */
const wrap = (component) => {
  /** @type {Record<string, unknown[]>} */
  const received = {};
  return {
    inPorts: component.inPorts,
    /** @param {Record<string, unknown>} values */
    send(values) {
      for (const [port, value] of Object.entries(values)) {
        const socket = noflo.internalSocket.createSocket();
        component.inPorts[port].attach(socket);
        socket.post(new noflo.IP("data", value));
      }
    },
    /**
     * @param {string} port
     * @param {(msg: unknown) => void} callback
     */
    receive(port, callback) {
      const socket = noflo.internalSocket.createSocket();
      component.outPorts[port].attach(socket);
      received[port] = received[port] ?? [];
      socket.addEventListener(
        "ip",
        /** @param {CustomEvent} event */ (event) => {
          const ip = /** @type {import("@noflo/noflo").IP} */ (event.detail);
          if (ip.type !== "data") {
            return;
          }
          /** @type {unknown[]} */ (received[port]).push(ip.data);
          callback(ip.data);
        },
      );
    },
  };
};

describe("Assembly Component", () => {
  describe("of simple relay kind", () => {
    it("should modify the message", async () => {
      const c = wrap(getBuildFrame());
      const received = new Promise((resolve) => {
        c.receive("out", (msg) => {
          resolve(msg);
        });
      });
      c.send({ in: { errors: [], id: 123 } });
      const msg = /** @type {Record<string, any>} */ (await received);
      assert.equal(msg.errors.length, 0);
      assert.equal(msg.id, 123);
      assert.ok(msg.chassis);
      assert.equal(msg.chassis.id, msg.id);
    });

    it("should validate the message automatically", async () => {
      const c = wrap(getBuildFrame());
      const received = new Promise((resolve) => {
        c.receive("out", (msg) => {
          resolve(msg);
        });
      });
      c.send({ in: { errors: [], oops: "id is not here" } });
      const msg = /** @type {Record<string, any>} */ (await received);
      assert.ok(msg.errors.length > 0);
      assert.ok(msg.errors[0] instanceof Error);
      assert.ok(msg.errors[0].message.includes("not a number"));
    });
  });

  describe("with multiple inports", () => {
    it("should handle the input", async () => {
      const c = wrap(getMountEngine());
      const received = new Promise((resolve) => {
        c.receive("out", (msg) => {
          resolve(msg);
        });
      });
      c.send({
        in: {
          errors: [],
          id: 123,
          chassis: { id: 123, frame: "Wooden Frame" },
        },
        engine: "Steam Engine",
      });
      const msg = /** @type {Record<string, any>} */ (await received);
      assert.equal(msg.errors.length, 0);
      assert.equal(msg.id, 123);
      assert.equal(msg.chassis.frame, "Wooden Frame");
      assert.equal(msg.chassis.engine, "Steam Engine");
    });

    it("should perform manual validation", async () => {
      const c = wrap(getMountEngine());
      const received = new Promise((resolve) => {
        c.receive("out", (msg) => {
          resolve(msg);
        });
      });
      c.send({
        in: { errors: [], oops: "chassis is not here" },
        engine: "FooBar",
      });
      const msg = /** @type {Record<string, any>} */ (await received);
      assert.ok(msg.errors.length > 0);
      assert.ok(msg.errors[0].message.includes("not an object"));
    });
  });

  describe("of processMessage kind", () => {
    it("should receive the component as this", async () => {
      const c = wrap(getOrder());
      /** @type {unknown[]} */
      const ids = [];
      const done = new Promise((resolve) => {
        c.receive("out", (msg) => {
          ids.push(/** @type {Record<string, any>} */ (msg).id);
          if (ids.length === 2) {
            resolve(ids);
          }
        });
      });
      c.send({ in: { errors: [] } });
      c.send({ in: { errors: [] } });
      // Core invokes the handler as `this.handle(...)` (Component.js), so
      // `this` inside a subclass's `processMessage` is the component
      // instance — Order counts activations on its instance `counter`
      assert.deepEqual(await done, [1, 2]);
    });
  });
});
