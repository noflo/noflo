import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as noflo from "@noflo/noflo";
import { asComponent } from "../src/index.js";
import { listen, listenOnce } from "./utils/events.js";

let isBrowser;
if (
  typeof process !== "undefined" &&
  process.versions &&
  (process.versions.node || process.versions.deno || process.versions.bun)
) {
  isBrowser = false;
} else {
  isBrowser = true;
}

/**
 * Test-only replacement for the removed `noflo.asCallback` helper: load a
 * component by name, attach sockets to every port, and return a JS function
 * that sends the given input (a scalar goes to the sole inport, an object is
 * keyed by port name) and delivers the first output — or error — to the
 * callback.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader
 * @param {string} name
 * @returns {(input: any, callback: (err: Error|null, res: any) => void) => void}
 */
function wrapForTest(loader, name) {
  return (input, callback) => {
    loader.load(name).then((instance) => {
      const inSockets = {};
      Object.keys(instance.inPorts.ports).forEach((port) => {
        const socket = noflo.internalSocket.createSocket();
        instance.inPorts.ports[port].attach(socket);
        inSockets[port] = socket;
      });
      const outSocket = noflo.internalSocket.createSocket();
      const errSocket = noflo.internalSocket.createSocket();
      instance.outPorts.out.attach(outSocket);
      instance.outPorts.error.attach(errSocket);
      let settled = false;
      const settle = (err, res) => {
        if (settled) {
          return;
        }
        settled = true;
        callback(err, res);
      };
      listenOnce(errSocket, "ip", (ip) => settle(ip.data, null));
      listenOnce(outSocket, "ip", (ip) => settle(null, ip.data));
      // A component that sends nothing (e.g. a null return, which
      // sendDone(null) marks done without a packet) resolves with null:
      // after the activation deactivates and the delivery microtasks
      // have drained, no output means no output
      instance.addEventListener("deactivate", () => {
        setImmediate(() => {
          settle(null, null);
        });
      });
      if (typeof input === "object" && input !== null) {
        Object.keys(input).forEach((port) => {
          inSockets[port].send(input[port]);
        });
        return;
      }
      const [sole] = Object.keys(inSockets);
      inSockets[sole].send(input);
    });
  };
}

describe("asComponent interface", () => {
  let loader = null;
  before(() => {
    loader = new noflo.ComponentLoader({});
    return loader.listComponents();
  });
  describe("with a synchronous function taking a single parameter", () => {
    describe("with returned value", () => {
      const func = (hello) => `Hello ${hello}`;
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "sync-one", component);
      });
      it("should be loadable", () => {
        return loader.load("ascomponent/sync-one");
      });
      it("should contain correct ports", () => {
        return loader.load("ascomponent/sync-one").then((instance) => {
          assert.deepEqual(Object.keys(instance.inPorts.ports), ["hello"]);
          assert.deepEqual(Object.keys(instance.outPorts.ports), [
            "out",
            "error",
          ]);
        });
      });
      it("should send to OUT port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/sync-one");
        wrapped("World", (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, "Hello World");
          done();
        });
      });
      it("should forward brackets to OUT port", (_t, done) => {
        loader.load("ascomponent/sync-one").then((instance) => {
          const ins = noflo.internalSocket.createSocket();
          const out = noflo.internalSocket.createSocket();
          const error = noflo.internalSocket.createSocket();
          instance.inPorts.hello.attach(ins);
          instance.outPorts.out.attach(out);
          instance.outPorts.error.attach(error);
          const received = [];
          const expected = [
            "openBracket a",
            "data Hello Foo",
            "data Hello Bar",
            "data Hello Baz",
            "closeBracket a",
          ];
          listenOnce(error, "ip", (ip) => done(ip.data));
          listen(out, "ip", (ip) => {
            received.push(`${ip.type} ${ip.data}`);
            if (received.length !== expected.length) {
              return;
            }
            assert.deepStrictEqual(received, expected);
            done();
          });
          ins.post(new noflo.IP("openBracket", "a"));
          ins.post(new noflo.IP("data", "Foo"));
          ins.post(new noflo.IP("data", "Bar"));
          ins.post(new noflo.IP("data", "Baz"));
          ins.post(new noflo.IP("closeBracket", "a"));
        });
      });
    });
    describe("with returned NULL", () => {
      const func = () => null;
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "sync-null", component);
      });
      it("should send to OUT port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/sync-null");
        wrapped("World", (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, null);
          done();
        });
      });
    });
    describe("with a thrown exception", () => {
      const func = (hello) => {
        throw new Error(`Hello ${hello}`);
      };
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "sync-throw", component);
      });
      it("should send to ERROR port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/sync-throw");
        wrapped("Error", (err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.strictEqual(err.message, "Hello Error");
          done();
        });
      });
    });
  });
  describe("with a synchronous function taking a multiple parameters", () => {
    describe("with returned value", () => {
      const func = (greeting, name) => `${greeting} ${name}`;
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "sync-two", component);
      });
      it("should be loadable", () => loader.load("ascomponent/sync-two"));
      it("should contain correct ports", (_t, done) => {
        loader.load("ascomponent/sync-two").then((instance) => {
          assert.deepEqual(Object.keys(instance.inPorts.ports), [
            "greeting",
            "name",
          ]);
          assert.deepEqual(Object.keys(instance.outPorts.ports), [
            "out",
            "error",
          ]);
          done();
        });
      });
      it("should send to OUT port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/sync-two");
        wrapped(
          {
            greeting: "Hei",
            name: "Maailma",
          },
          (err, res) => {
            if (err) {
              done(err);
              return;
            }
            assert.strictEqual(res, "Hei Maailma");
            done();
          },
        );
      });
    });
    describe("with a default value", () => {
      before(function () {
        if (isBrowser) {
          return this.skip();
        }
      }); // Browser runs with ES5 which didn't have defaults
      it("should be possible to componentize", async () => {
        const component = () =>
          asComponent((name, greeting = "Hello") => `${greeting} ${name}`);
        await loader.registerComponent(
          "ascomponent",
          "sync-default",
          component,
        );
      });
      it("should be loadable", () => loader.load("ascomponent/sync-default"));
      it("should contain correct ports", (_t, done) => {
        loader.load("ascomponent/sync-default").then((instance) => {
          assert.deepEqual(Object.keys(instance.inPorts.ports), [
            "name",
            "greeting",
          ]);
          assert.deepEqual(Object.keys(instance.outPorts.ports), [
            "out",
            "error",
          ]);
          assert.equal(instance.inPorts.name.isRequired(), true);
          assert.equal(instance.inPorts.greeting.isRequired(), false);
          done();
        });
      });
      it("should send to OUT port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/sync-default");
        wrapped({ name: "Maailma" }, (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, "Hello Maailma");
          done();
        });
      });
    });
  });
  describe("with a function returning a Promise", () => {
    describe("with a resolved promise", () => {
      before(function () {
        if (isBrowser && typeof globalThis.Promise === "undefined") {
          return this.skip();
        }
      });
      const func = (hello) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(`Hello ${hello}`);
          }, 5);
        });
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "promise-one", component);
      });
      it("should send to OUT port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/promise-one");
        wrapped("World", (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, "Hello World");
          done();
        });
      });
    });
    describe("with a rejected promise", () => {
      before(function () {
        if (isBrowser && typeof globalThis.Promise === "undefined") {
          this.skip();
        }
      });
      const func = (hello) =>
        new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error(`Hello ${hello}`));
          }, 5);
        });
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "sync-throw", component);
      });
      it("should send to ERROR port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/sync-throw");
        wrapped("Error", (err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.strictEqual(err.message, "Hello Error");
          done();
        });
      });
    });
  });
  describe("with a synchronous function taking zero parameters", () => {
    describe("with returned value", () => {
      const func = () => "Hello there";
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "sync-zero", component);
      });
      it("should contain correct ports", (_t, done) => {
        loader.load("ascomponent/sync-zero").then((instance) => {
          assert.deepEqual(Object.keys(instance.inPorts.ports), ["in"]);
          assert.deepEqual(Object.keys(instance.outPorts.ports), [
            "out",
            "error",
          ]);
          done();
        });
      });
      it("should send to OUT port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/sync-zero");
        wrapped("bang", (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, "Hello there");
          done();
        });
      });
    });
    describe("with a built-in function", () => {
      it("should be possible to componentize", async () => {
        const component = () => asComponent(Math.random);
        await loader.registerComponent("ascomponent", "sync-zero", component);
      });
      it("should contain correct ports", (_t, done) => {
        loader.load("ascomponent/sync-zero").then((instance) => {
          assert.deepEqual(Object.keys(instance.inPorts.ports), ["in"]);
          assert.deepEqual(Object.keys(instance.outPorts.ports), [
            "out",
            "error",
          ]);
          done();
        });
      });
      it("should send to OUT port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/sync-zero");
        wrapped("bang", (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(typeof res, "number");
          done();
        });
      });
    });
  });
  describe("with an asynchronous function taking a single parameter and callback", () => {
    describe("with successful callback", () => {
      const func = (hello, callback) => {
        setTimeout(() => callback(null, `Hello ${hello}`), 5);
      };
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "async-one", component);
      });
      it("should be loadable", () => loader.load("ascomponent/async-one"));
      it("should contain correct ports", (_t, done) => {
        loader.load("ascomponent/async-one").then((instance) => {
          assert.deepEqual(Object.keys(instance.inPorts.ports), ["hello"]);
          assert.deepEqual(Object.keys(instance.outPorts.ports), [
            "out",
            "error",
          ]);
          done();
        });
      });
      it("should send to OUT port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/async-one");
        wrapped("World", (err, res) => {
          if (err) {
            done(err);
            return;
          }
          assert.strictEqual(res, "Hello World");
          done();
        });
      });
    });
    describe("with failed callback", () => {
      const func = (hello, callback) => {
        setTimeout(() => callback(new Error(`Hello ${hello}`)), 5);
      };
      it("should be possible to componentize", async () => {
        const component = () => asComponent(func);
        await loader.registerComponent("ascomponent", "async-throw", component);
      });
      it("should send to ERROR port", (_t, done) => {
        const wrapped = wrapForTest(loader, "ascomponent/async-throw");
        wrapped("Error", (err) => {
          assert.strictEqual(Error.isError(err), true);
          assert.strictEqual(err.message, "Hello Error");
          done();
        });
      });
    });
  });
});
