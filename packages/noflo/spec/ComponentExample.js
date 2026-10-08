import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import * as noflo from "../src/lib/NoFlo.js";
import { listenOnce } from "./utils/events.js";

describe("MergeObjects component", () => {
  let c = null;
  let sin1 = null;
  let sin2 = null;
  let sin3 = null;
  let sout1 = null;
  let sout2 = null;
  const obj1 = {
    name: "Patrick",
    age: 21,
  };
  const obj2 = {
    title: "Attorney",
    age: 33,
  };
  before((t) => {
    if (noflo.isBrowser()) {
      t.skip();
      return;
    }
    return import("./components/MergeObjects.js").then((MergeObjects) => {
      console.log(MergeObjects);
      c = MergeObjects.getComponent();
      sin1 = new noflo.internalSocket.InternalSocket();
      sin2 = new noflo.internalSocket.InternalSocket();
      sin3 = new noflo.internalSocket.InternalSocket();
      sout1 = new noflo.internalSocket.InternalSocket();
      sout2 = new noflo.internalSocket.InternalSocket();
      c.inPorts.obj1.attach(sin1);
      c.inPorts.obj2.attach(sin2);
      c.inPorts.overwrite.attach(sin3);
      c.outPorts.result.attach(sout1);
      c.outPorts.error.attach(sout2);
    });
  });
  beforeEach(() => {
    sout1.removeAllListeners();
    sout2.removeAllListeners();
  });

  it("should not trigger if input is not complete", (_t, done) => {
    listenOnce(sout1, "ip", () => {
      done(new Error("Premature result"));
    });
    listenOnce(sout2, "ip", () => {
      done(new Error("Premature error"));
    });

    sin1.post(new noflo.IP("data", obj1));
    sin2.post(new noflo.IP("data", obj2));

    setTimeout(done, 10);
  });

  it("should merge objects when input is complete", (_t, done) => {
    listenOnce(sout1, "ip", (ip) => {
      assert.strictEqual(typeof ip, "object");
      assert.strictEqual(ip.type, "data");
      assert.strictEqual(typeof ip.data, "object");
      assert.strictEqual(ip.data.name, obj1.name);
      assert.strictEqual(ip.data.title, obj2.title);
      assert.strictEqual(ip.data.age, obj1.age);
      done();
    });
    listenOnce(sout2, "ip", (ip) => {
      done(ip);
    });

    // The obj1/obj2 packets buffered by the previous test are still in
    // place; posting them again keeps this test self-sufficient under
    // runtimes with different socket flush timing
    sin1.post(new noflo.IP("data", obj1));
    sin2.post(new noflo.IP("data", obj2));
    sin3.post(new noflo.IP("data", false));
  });

  it("should obey the overwrite control", (_t, done) => {
    listenOnce(sout1, "ip", (ip) => {
      assert.strictEqual(typeof ip, "object");
      assert.strictEqual(ip.type, "data");
      assert.strictEqual(typeof ip.data, "object");
      assert.strictEqual(ip.data.name, obj1.name);
      assert.strictEqual(ip.data.title, obj2.title);
      assert.strictEqual(ip.data.age, obj2.age);
      done();
    });
    listenOnce(sout2, "ip", (ip) => {
      done(ip);
    });

    sin3.post(new noflo.IP("data", true));
    sin1.post(new noflo.IP("data", obj1));
    sin2.post(new noflo.IP("data", obj2));
  });
});
