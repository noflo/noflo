import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import * as noflo from "../src/lib/NoFlo.js";
import { listen, listenOnce } from "./utils/events.js";
import { loadJsonGraphFixture } from "./utils/loadJsonGraph.js";
import { nativeGraph } from "./utils/nativeGraph.js";

const legacyBasic = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "string" });
  c.outPorts.add("out", { datatype: "string" });
  listen(c.inPorts.in, "connect", () => {
    c.outPorts.out.connect();
  });
  listen(c.inPorts.in, "begingroup", (group) => {
    c.outPorts.out.beginGroup(group);
  });
  listen(c.inPorts.in, "data", (data) => {
    c.outPorts.out.data(data + c.nodeId);
  });
  listen(c.inPorts.in, "endgroup", () => {
    c.outPorts.out.endGroup();
  });
  listen(c.inPorts.in, "disconnect", () => {
    c.outPorts.out.disconnect();
  });
  return c;
};

const processAsync = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "string" });
  c.outPorts.add("out", { datatype: "string" });

  c.process((input, output) => {
    const data = input.getData("in");
    setTimeout(() => {
      output.sendDone(data + c.nodeId);
    }, 1);
  });
  return c;
};

const processPromise = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "string" });
  c.outPorts.add("out", { datatype: "string" });

  c.process(
    (input) =>
      new Promise((resolve) => {
        const data = input.getData("in");
        setTimeout(() => {
          resolve(data + c.nodeId);
        }, 1);
      }),
  );
  return c;
};

const processMerge = () => {
  const c = new noflo.Component();
  c.inPorts.add("in1", { datatype: "string" });
  c.inPorts.add("in2", { datatype: "string" });
  c.outPorts.add("out", { datatype: "string" });

  c.forwardBrackets = { in1: ["out"] };

  c.process((input, output) => {
    if (!input.has("in1", "in2", (ip) => ip.type === "data")) {
      return;
    }
    const first = input.getData("in1");
    const second = input.getData("in2");

    output.sendDone({ out: `1${first}:2${second}:${c.nodeId}` });
  });
  return c;
};

const processSync = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "string" });
  c.outPorts.add("out", { datatype: "string" });
  c.process((input, output) => {
    const data = input.getData("in");
    output.send({ out: data + c.nodeId });
    output.done();
  });
  return c;
};

const processBracketize = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "string" });
  c.outPorts.add("out", { datatype: "string" });
  c.counter = 0;
  c.tearDown = () => {
    c.counter = 0;
    return Promise.resolve();
  };
  c.process((input, output) => {
    const data = input.getData("in");
    output.send({ out: new noflo.IP("openBracket", c.counter) });
    output.send({ out: data });
    output.send({ out: new noflo.IP("closeBracket", c.counter) });
    c.counter++;
    output.done();
  });
  return c;
};

const processNonSending = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "string" });
  c.inPorts.add("in2", { datatype: "string" });
  c.outPorts.add("out", { datatype: "string" });
  c.forwardBrackets = {};
  c.process((input, output) => {
    if (input.hasData("in2")) {
      input.getData("in2");
      output.done();
      return;
    }
    if (!input.hasData("in")) {
      return;
    }
    const data = input.getData("in");
    output.send(data + c.nodeId);
    output.done();
  });
  return c;
};

const processGenerator = () => {
  const c = new noflo.Component();
  c.inPorts.add("start", { datatype: "bang" });
  c.inPorts.add("stop", { datatype: "bang" });
  c.outPorts.add("out", { datatype: "bang" });
  c.autoOrdering = false;

  const cleanUp = () => {
    if (!c.timer) {
      return;
    }
    clearInterval(c.timer.interval);
    c.timer.deactivate();
    c.timer = null;
  };
  c.tearDown = () => {
    cleanUp();
    return Promise.resolve();
  };

  c.process((input, output, context) => {
    if (input.hasData("start")) {
      if (c.timer) {
        cleanUp();
      }
      input.getData("start");
      c.timer = context;
      c.timer.interval = setInterval(() => {
        output.send({ out: true });
      }, 100);
    }
    if (input.hasData("stop")) {
      input.getData("stop");
      if (!c.timer) {
        output.done();
        return;
      }
      cleanUp();
      output.done();
    }
  });
  return c;
};

describe("Network Lifecycle", () => {
  const loader = new noflo.ComponentLoader({});

  before(() =>
    loader.listComponents().then(() => {
      loader.registerComponent("process", "Async", processAsync);
      loader.registerComponent("process", "Promise", processPromise);
      loader.registerComponent("process", "Sync", processSync);
      loader.registerComponent("process", "Merge", processMerge);
      loader.registerComponent("process", "Bracketize", processBracketize);
      loader.registerComponent("process", "NonSending", processNonSending);
      loader.registerComponent("process", "Generator", processGenerator);
      loader.registerComponent("legacy", "Sync", legacyBasic);
    }),
  );
  describe("recognizing API level", () => {
    it("should recognize legacy component as such", () =>
      loader.load("legacy/Sync").then((inst) => {
        assert.equal(inst.isLegacy(), true);
      }));
    it("should recognize Process API component as non-legacy", () =>
      loader.load("process/Async").then((inst) => {
        assert.equal(inst.isLegacy(), false);
      }));
    it("should recognize Graph component as non-legacy", () =>
      loader
        .registerGraph("scope", "Graph", nativeGraph("legacy-check"))
        .then(() => loader.load("scope/Graph"))
        .then((inst) => {
          assert.equal(inst.isLegacy(), false);
        }));
  });
  describe("with single Process API component receiving IIP", () => {
    let c = null;
    let out = null;
    beforeEach(() => {
      return Promise.resolve(loadJsonGraphFixture("iip-single"))
        .then((graph) => {
          loader.registerComponent("scope", "Connected", graph);
          return loader.load("scope/Connected");
        })
        .then((instance) => {
          c = instance;
          out = noflo.internalSocket.createSocket();
          c.outPorts.out.attach(out);
        });
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it("should execute and finish", (_t, done) => {
      const expected = ["DATA helloPc"];
      const received = [];
      listen(out, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`< ${ip.data}`);
            break;
          case "data":
            received.push(`DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(">");
            break;
        }
      });
      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.deepStrictEqual(received, expected);
        assert.strictEqual(wasStarted, true);
        done();
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);
      c.start().catch(done);
    });
    it("should execute twice if IIP changes", (_t, done) => {
      const expected = ["DATA helloPc", "DATA worldPc"];
      const received = [];
      listen(out, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`< ${ip.data}`);
            break;
          case "data":
            received.push(`DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(">");
            break;
        }
      });
      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.strictEqual(wasStarted, true);
        if (received.length < expected.length) {
          wasStarted = false;
          listenOnce(c.network, "start", checkStart);
          listenOnce(c.network, "end", checkEnd);
          c.network
            .addInitial({
              from: {
                data: "world",
              },
              to: {
                node: "Pc",
                port: "in",
              },
            })
            .catch(done);
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);
      c.start().catch(done);
    });
    it("should not send new IIP if network was stopped", (_t, done) => {
      const expected = ["DATA helloPc"];
      const received = [];
      listen(out, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`< ${ip.data}`);
            break;
          case "data":
            received.push(`DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(">");
            break;
        }
      });
      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.strictEqual(wasStarted, true);
        c.network.stop().then(() => {
          assert.equal(c.network.isStopped(), true);
          listenOnce(c.network, "start", () => {
            throw new Error("Unexpected network start");
          });
          listenOnce(c.network, "end", () => {
            throw new Error("Unexpected network end");
          });
          c.network.addInitial(
            {
              from: {
                data: "world",
              },
              to: {
                node: "Pc",
                port: "in",
              },
            },
            (err) => {
              if (err) {
                done(err);
              }
            },
          );
          setTimeout(() => {
            assert.deepStrictEqual(received, expected);
            done();
          }, 1000);
        }, done);
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);
      c.start().catch(done);
    });
  });
  describe("with promise-based Process API component receiving IIP", () => {
    let c = null;
    let out = null;
    beforeEach(() => {
      return Promise.resolve(loadJsonGraphFixture("iip-promise"))
        .then((graph) => {
          loader.registerComponent("scope", "Promise", graph);
          return loader.load("scope/Promise");
        })
        .then((instance) => {
          c = instance;
          out = noflo.internalSocket.createSocket();
          c.outPorts.out.attach(out);
        });
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it("should execute and finish", (_t, done) => {
      const expected = ["DATA helloPc"];
      const received = [];
      listen(out, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`< ${ip.data}`);
            break;
          case "data":
            received.push(`DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(">");
            break;
        }
      });
      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.deepStrictEqual(received, expected);
        assert.strictEqual(wasStarted, true);
        done();
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);
      c.start().catch(done);
    });
  });
  describe("with synchronous Process API", () => {
    let c = null;
    let out = null;
    beforeEach(() => {
      return Promise.resolve(loadJsonGraphFixture("bracket-sync"))
        .then((graph) => {
          loader.registerComponent("scope", "Connected", graph);
          return loader.load("scope/Connected");
        })
        .then((instance) => {
          c = instance;
          out = noflo.internalSocket.createSocket();
          c.outPorts.out.attach(out);
        });
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it("should execute and finish", (_t, done) => {
      const expected = ["DATA helloNonSendingSync"];
      const received = [];
      listen(out, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`< ${ip.data}`);
            break;
          case "data":
            received.push(`DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(">");
            break;
        }
      });
      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        setTimeout(() => {
          assert.deepStrictEqual(received, expected);
          assert.strictEqual(wasStarted, true);
          done();
        }, 100);
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);
      c.start().catch(done);
    });
  });
  describe("pure Process API merging two inputs", () => {
    let c = null;
    let in1 = null;
    let in2 = null;
    let out = null;
    before(() => {
      return Promise.resolve(loadJsonGraphFixture("double-merge"))
        .then((g) => {
          loader.registerComponent("scope", "Merge", g);
          return loader.load("scope/Merge");
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          in2 = noflo.internalSocket.createSocket();
          c.inPorts.in2.attach(in2);
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it("should forward new-style brackets as expected", (_t, done) => {
      const expected = [
        "CONN",
        "< 1",
        "< a",
        "DATA 1bazPc1:2fooPc2:PcMerge",
        ">",
        ">",
        "DISC",
      ];
      const received = [];

      listen(out, "connect", () => {
        received.push("CONN");
      });
      listen(out, "begingroup", (group) => {
        received.push(`< ${group}`);
      });
      listen(out, "data", (data) => {
        received.push(`DATA ${data}`);
      });
      listen(out, "endgroup", () => {
        received.push(">");
      });
      listen(out, "disconnect", () => {
        received.push("DISC");
      });

      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.deepStrictEqual(received, expected);
        assert.strictEqual(wasStarted, true);
        done();
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);

      c.start().then(() => {
        in2.connect();
        in2.send("foo");
        in2.disconnect();
        in1.connect();
        in1.beginGroup(1);
        in1.beginGroup("a");
        in1.send("baz");
        in1.endGroup();
        in1.endGroup();
        in1.disconnect();
      }, done);
    });
    it("should forward new-style brackets as expected regardless of sending order", (_t, done) => {
      const expected = [
        "CONN",
        "< 1",
        "< a",
        "DATA 1bazPc1:2fooPc2:PcMerge",
        ">",
        ">",
        "DISC",
      ];
      const received = [];

      listen(out, "connect", () => {
        received.push("CONN");
      });
      listen(out, "begingroup", (group) => {
        received.push(`< ${group}`);
      });
      listen(out, "data", (data) => {
        received.push(`DATA ${data}`);
      });
      listen(out, "endgroup", () => {
        received.push(">");
      });
      listen(out, "disconnect", () => {
        received.push("DISC");
      });

      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.deepStrictEqual(received, expected);
        assert.strictEqual(wasStarted, true);
        done();
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);

      c.start().then(() => {
        in1.connect();
        in1.beginGroup(1);
        in1.beginGroup("a");
        in1.send("baz");
        in1.endGroup();
        in1.endGroup();
        in1.disconnect();
        in2.connect();
        in2.send("foo");
        in2.disconnect();
      }, done);
    });
    it("should forward scopes as expected", (_t, done) => {
      const expected = ["x < 1", "x DATA 1onePc1:2twoPc2:PcMerge", "x >"];
      const received = [];
      const brackets = [];

      listen(out, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`${ip.scope} < ${ip.data}`);
            brackets.push(ip.data);
            break;
          case "data":
            received.push(`${ip.scope} DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`${ip.scope} >`);
            brackets.pop();
            break;
        }
      });
      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.deepStrictEqual(received, expected);
        assert.strictEqual(wasStarted, true);
        done();
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);

      c.start().then(() => {
        in2.post(new noflo.IP("data", "two", { scope: "x" }));
        in1.post(new noflo.IP("openBracket", 1, { scope: "x" }));
        in1.post(new noflo.IP("data", "one", { scope: "x" }));
        in1.post(new noflo.IP("closeBracket", 1, { scope: "x" }));
      }, done);
    });
  });
  describe("Process API mixed with legacy merging two inputs", () => {
    let c = null;
    let in1 = null;
    let in2 = null;
    let out = null;
    before(() => {
      return Promise.resolve(loadJsonGraphFixture("legacy-merge"))
        .then((g) => {
          loader.registerComponent("scope", "Merge", g);
          return loader.load("scope/Merge");
        })
        .then((instance) => {
          c = instance;
          in1 = noflo.internalSocket.createSocket();
          c.inPorts.in1.attach(in1);
          in2 = noflo.internalSocket.createSocket();
          c.inPorts.in2.attach(in2);
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it("should forward new-style brackets as expected", (_t, done) => {
      const expected = [
        "CONN",
        "< 1",
        "< a",
        "DATA 1bazLeg1:2fooLeg2:PcMergeLeg3",
        ">",
        ">",
        "DISC",
      ];
      const received = [];

      listen(out, "connect", () => {
        received.push("CONN");
      });
      listen(out, "begingroup", (group) => {
        received.push(`< ${group}`);
      });
      listen(out, "data", (data) => {
        received.push(`DATA ${data}`);
      });
      listen(out, "endgroup", () => {
        received.push(">");
      });
      listen(out, "disconnect", () => {
        received.push("DISC");
      });

      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.deepStrictEqual(received, expected);
        assert.strictEqual(wasStarted, true);
        done();
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);

      c.start().then(() => {
        in2.connect();
        in2.send("foo");
        in2.disconnect();
        in1.connect();
        in1.beginGroup(1);
        in1.beginGroup("a");
        in1.send("baz");
        in1.endGroup();
        in1.endGroup();
        in1.disconnect();
      }, done);
    });
    it("should forward new-style brackets as expected regardless of sending order", (_t, done) => {
      const expected = [
        "CONN",
        "< 1",
        "< a",
        "DATA 1bazLeg1:2fooLeg2:PcMergeLeg3",
        ">",
        ">",
        "DISC",
      ];
      const received = [];

      listen(out, "connect", () => {
        received.push("CONN");
      });
      listen(out, "begingroup", (group) => {
        received.push(`< ${group}`);
      });
      listen(out, "data", (data) => {
        received.push(`DATA ${data}`);
      });
      listen(out, "endgroup", () => {
        received.push(">");
      });
      listen(out, "disconnect", () => {
        received.push("DISC");
      });

      let wasStarted = false;
      const checkStart = () => {
        assert.strictEqual(wasStarted, false);
        wasStarted = true;
      };
      const checkEnd = () => {
        assert.deepStrictEqual(received, expected);
        assert.strictEqual(wasStarted, true);
        done();
      };
      listenOnce(c.network, "start", checkStart);
      listenOnce(c.network, "end", checkEnd);

      c.start().then(() => {
        in1.connect();
        in1.beginGroup(1);
        in1.beginGroup("a");
        in1.send("baz");
        in1.endGroup();
        in1.endGroup();
        in1.disconnect();
        in2.connect();
        in2.send("foo");
        in2.disconnect();
      }, done);
    });
  });
  describe("with a Process API Generator component", () => {
    let c = null;
    let start = null;
    let stop = null;
    let out = null;
    before(() => {
      return Promise.resolve(loadJsonGraphFixture("generator"))
        .then((g) => {
          loader.registerComponent("scope", "Connected", g);
          return loader.load("scope/Connected");
        })
        .then((instance) => {
          return new Promise((resolve) => {
            listenOnce(instance, "ready", () => {
              c = instance;
              start = noflo.internalSocket.createSocket();
              c.inPorts.start.attach(start);
              stop = noflo.internalSocket.createSocket();
              c.inPorts.stop.attach(stop);
              resolve();
            });
          });
        });
    });
    beforeEach(() => {
      out = noflo.internalSocket.createSocket();
      c.outPorts.out.attach(out);
    });
    afterEach(() => {
      c.outPorts.out.detach(out);
      out = null;
      return c.shutdown();
    });
    it("should not be running initially", () => {
      assert.equal(c.network.isRunning(), false);
    });
    it("should not be running even when network starts", () =>
      c.start().then(() => {
        assert.equal(c.network.isRunning(), false);
      }));
    it("should start generating when receiving a start packet", (_t, done) => {
      c.start().then(() => {
        listenOnce(out, "data", () => {
          assert.equal(c.network.isRunning(), true);
          done();
        });
        start.send(true);
      }, done);
    });
    it("should stop generating when receiving a stop packet", (_t, done) => {
      c.start().then(() => {
        listenOnce(out, "data", () => {
          assert.equal(c.network.isRunning(), true);
          stop.send(true);
          setTimeout(() => {
            assert.equal(c.network.isRunning(), false);
            done();
          }, 10);
        });
        start.send(true);
      }, done);
    });
  });
});
