import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import * as noflo from "../src/lib/NoFlo.js";
import {
  closeBracket,
  fixtureSocket,
  listen,
  listenOnce,
  openBracket,
  sendData,
  settle,
} from "./utils/events.js";

describe("Component", () => {
  describe("with required ports", () => {
    it("should throw an error upon sending packet to an unattached required port", () => {
      const s2 = fixtureSocket();
      const c = new noflo.Component({
        outPorts: {
          required_port: {
            required: true,
          },
          optional_port: {},
        },
      });
      c.outPorts.optional_port.attach(s2);
      assert.throws(() => c.outPorts.required_port.send("foo"));
    });
    it("should be cool with an attached port", () => {
      const s1 = fixtureSocket();
      const s2 = fixtureSocket();
      const c = new noflo.Component({
        inPorts: {
          required_port: {
            required: true,
          },
          optional_port: {},
        },
      });
      c.inPorts.required_port.attach(s1);
      c.inPorts.optional_port.attach(s2);
      const f = () => {
        s1.send("some-more-data");
        s2.send("some-data");
      };
      assert.doesNotThrow(f);
    });
  });
  describe("with component creation shorthand", () => {
    it("should make component creation easy", (_t, done) => {
      const c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
          just_processor: {},
        },
        process(input, output) {
          let packet;
          if (input.hasData("in")) {
            packet = input.getData("in");
            assert.strictEqual(packet, "some-data");
            output.done();
            return;
          }
          if (input.hasData("just_processor")) {
            packet = input.getData("just_processor");
            assert.strictEqual(packet, "some-data");
            output.done();
            done();
          }
        },
      });

      const s1 = fixtureSocket();
      c.inPorts.in.attach(s1);
      c.inPorts.in.nodeInstance = c;
      const s2 = fixtureSocket();
      c.inPorts.just_processor.attach(s1);
      c.inPorts.just_processor.nodeInstance = c;
      s1.send("some-data");
      s2.send("some-data");
    });
    it("should throw errors if there is no error port", (_t, done) => {
      const c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        process(input, output) {
          const packet = input.getData("in");
          assert.strictEqual(packet, "some-data");
          assert.throws(() => output.error(new Error()));
          done();
        },
      });

      const s1 = fixtureSocket();
      c.inPorts.in.attach(s1);
      c.inPorts.in.nodeInstance = c;
      s1.send("some-data");
    });
    it("should throw errors if there is a non-attached error port", (_t, done) => {
      const c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        outPorts: {
          error: {
            datatype: "object",
            required: true,
          },
        },
        process(input, output) {
          const packet = input.getData("in");
          assert.strictEqual(packet, "some-data");
          assert.throws(() => output.error(new Error()));
          done();
        },
      });

      const s1 = fixtureSocket();
      c.inPorts.in.attach(s1);
      c.inPorts.in.nodeInstance = c;
      s1.send("some-data");
    });
    it("should not throw errors if there is a non-required error port", (_t, done) => {
      const c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        outPorts: {
          error: {
            required: false,
          },
        },
        process(input) {
          const packet = input.getData("in");
          assert.strictEqual(packet, "some-data");
          c.error(new Error());
          done();
        },
      });

      const s1 = fixtureSocket();
      c.inPorts.in.attach(s1);
      c.inPorts.in.nodeInstance = c;
      s1.send("some-data");
    });
    it("should send errors if there is a connected error port", (_t, done) => {
      const c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        outPorts: {
          error: {
            datatype: "object",
          },
        },
        process(input, output) {
          if (!input.hasData("in")) {
            return;
          }
          const packet = input.getData("in");
          assert.strictEqual(packet, "some-data");
          output.done(new Error());
        },
      });

      const s1 = fixtureSocket();
      const s2 = fixtureSocket();
      const groups = ["foo", "bar"];
      listen(s2, "ip", (ip) => {
        if (ip.type === "openBracket") {
          assert.strictEqual(ip.data, groups.shift());
        }
        if (ip.type === "data" && Error.isError(ip.data)) {
          assert.strictEqual(groups.length, 0);
          done();
        }
      });

      c.inPorts.in.attach(s1);
      c.outPorts.error.attach(s2);
      c.inPorts.in.nodeInstance = c;
      openBracket(s1, "foo");
      openBracket(s1, "bar");
      sendData(s1, "some-data");
    });
  });
  describe("defining ports with invalid names", () => {
    it("should throw an error with uppercase letters in inport", () => {
      const shorthand = () =>
        new noflo.Component({
          inPorts: {
            fooPort: {},
          },
        });
      assert.throws(shorthand);
    });
    it("should throw an error with uppercase letters in outport", () => {
      const shorthand = () =>
        new noflo.Component({
          outPorts: {
            BarPort: {},
          },
        });
      assert.throws(shorthand);
    });
    it("should throw an error with special characters in inport", () => {
      const shorthand = () =>
        new noflo.Component({
          inPorts: {
            "$%^&*a": {},
          },
        });
      assert.throws(shorthand);
    });
  });
  describe("bracket forwarding rule validation (#540)", () => {
    it("throws when an explicit rule references a non-existing inport", () => {
      const shorthand = () =>
        new noflo.Component({
          inPorts: { in: {} },
          outPorts: { out: {} },
          forwardBrackets: { typo: ["out"] },
          process(input, output) {
            output.sendDone(input.getData("in"));
          },
        });
      assert.throws(
        shorthand,
        /forwardBrackets references inport 'typo' which the component does not have/,
      );
    });
    it("throws when an explicit rule references a non-existing outport", () => {
      const shorthand = () =>
        new noflo.Component({
          inPorts: { in: {} },
          outPorts: { out: {} },
          forwardBrackets: { in: ["out", "misspelled"] },
          process(input, output) {
            output.sendDone(input.getData("in"));
          },
        });
      assert.throws(
        shorthand,
        /references outport 'misspelled' which the component does not have/,
      );
    });
    it("throws when a rule assigned before process() names a non-existing port", () => {
      const c = new noflo.Component();
      c.inPorts.add("in");
      c.outPorts.add("out");
      c.forwardBrackets = { in: ["out", "typo"] };
      assert.throws(
        () => c.process(() => {}),
        /references outport 'typo' which the component does not have/,
      );
    });
    it("keeps the built-in default adaptive to the ports the component has", () => {
      // A component without `out`/`error` ports is correct usage: the
      // default rule silently adapts instead of erroring
      const c = new noflo.Component({
        inPorts: { in: { datatype: "all" } },
        outPorts: { error: { datatype: "object" } },
        process(input, output) {
          output.done();
        },
      });
      assert.deepEqual(c.forwardBrackets, { in: ["error"] });
    });
    it("accepts an empty explicit rule map", () => {
      const c = new noflo.Component({
        inPorts: { in: {} },
        outPorts: { out: {} },
        forwardBrackets: {},
        process(input, output) {
          output.sendDone(input.getData("in"));
        },
      });
      assert.deepEqual(c.forwardBrackets, {});
    });
  });
  describe("with non-existing ports", () => {
    const getComponent = () =>
      new noflo.Component({
        inPorts: {
          in: {},
        },
        outPorts: {
          out: {},
        },
      });
    it("should throw an error when checking attached for non-existing port", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.attached("foo");
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.ok(e.message.includes("foo"));
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
    it("should throw an error when checking IP for non-existing port", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.has("foo");
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.ok(e.message.includes("foo"));
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
    it("should throw an error when checking IP for non-existing addressable port", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.has(["foo", 0]);
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.ok(e.message.includes("foo"));
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
    it("should throw an error when checking data for non-existing port", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.hasData("foo");
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.ok(e.message.includes("foo"));
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
    it("should throw an error when checking stream for non-existing port", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.hasStream("foo");
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.ok(e.message.includes("foo"));
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
    it("should throw an error when getting a non-existing port (#1041)", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.get("foo");
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.match(e.message, /has no port 'foo'/);
          assert.match(e.message, /available ports: 'in'/);
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
    it("should throw an error when getting data from a non-existing port (#1041)", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.getData("foo");
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.match(e.message, /has no port 'foo'/);
          assert.match(e.message, /available ports: 'in'/);
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
    it("should throw an error when getting a stream from a non-existing port (#1041)", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.getStream("foo");
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.match(e.message, /has no port 'foo'/);
          assert.match(e.message, /available ports: 'in'/);
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
    it("should throw an error when getting a non-existing addressable port (#1041)", (_t, done) => {
      const c = getComponent();
      c.process((input) => {
        try {
          input.get(["foo", 0]);
        } catch (e) {
          assert.strictEqual(Error.isError(e), true);
          assert.match(e.message, /has no port 'foo'/);
          done();
          return;
        }
        done(new Error("Expected a throw"));
      });
      const sin1 = noflo.internalSocket.createSocket();
      c.inPorts.in.attach(sin1);
      sin1.send("hello");
    });
  });
  describe("starting a component", () => {
    it("should flag the component as started", () => {
      const c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
      });
      const i = fixtureSocket();
      c.inPorts.in.attach(i);
      return c.start().then(() => {
        assert.strictEqual(c.started, true);
        assert.strictEqual(c.isStarted(), true);
      });
    });
  });
  describe("shutting down a component", () => {
    it("should flag the component as not started", async () => {
      const c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
      });
      const i = fixtureSocket();
      c.inPorts.in.attach(i);
      await c.start();
      assert.equal(c.isStarted(), true);
      await c.shutdown();
      assert.strictEqual(c.started, false);
      assert.equal(c.isStarted(), false);
    });
  });
  describe("with object-based IPs", () => {
    it("should speak IP objects", (_t, done) => {
      const c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
          },
        },
        process(input, output) {
          output.sendDone(input.get("in"));
        },
      });

      const s1 = fixtureSocket();
      const s2 = fixtureSocket();

      listen(s2, "ip", (ip) => {
        console.log(ip);
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(Array.isArray(ip.groups), true);
        assert.deepStrictEqual(ip.groups, ["foo"]);
        assert.strictEqual(typeof ip.data, "string");
        assert.strictEqual(ip.data, "some-data");
        done();
      });

      c.inPorts.in.attach(s1);
      c.outPorts.out.attach(s2);

      s1.post(
        new noflo.IP("data", "some-data", {
          groups: ["foo"],
        }),
      );
    });
    it("should support substreams", (_t, done) => {
      const c = new noflo.Component({
        forwardBrackets: {},
        inPorts: {
          tags: {
            datatype: "string",
          },
        },
        outPorts: {
          html: {
            datatype: "string",
          },
        },
        process(input, output) {
          const ip = input.get("tags");
          switch (ip.type) {
            case "openBracket":
              c.str += `<${ip.data}>`;
              c.level++;
              break;
            case "data":
              c.str += ip.data;
              break;
            case "closeBracket":
              c.str += `</${ip.data}>`;
              c.level--;
              if (c.level === 0) {
                output.send({ html: c.str });
                c.str = "";
              }
              break;
          }
          output.done();
        },
      });
      c.str = "";
      c.level = 0;

      const d = new noflo.Component({
        inPorts: {
          bang: {
            datatype: "bang",
          },
        },
        outPorts: {
          tags: {
            datatype: "string",
          },
        },
        process(input, output) {
          input.getData("bang");
          output.send({ tags: new noflo.IP("openBracket", "p") });
          output.send({ tags: new noflo.IP("openBracket", "em") });
          output.send({ tags: new noflo.IP("data", "Hello") });
          output.send({ tags: new noflo.IP("closeBracket", "em") });
          output.send({ tags: new noflo.IP("data", ", ") });
          output.send({ tags: new noflo.IP("openBracket", "strong") });
          output.send({ tags: new noflo.IP("data", "World!") });
          output.send({ tags: new noflo.IP("closeBracket", "strong") });
          output.send({ tags: new noflo.IP("closeBracket", "p") });
          output.done();
        },
      });

      const s1 = fixtureSocket();
      const s2 = fixtureSocket();
      const s3 = fixtureSocket();

      listen(s3, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(
          ip.data,
          "<p><em>Hello</em>, <strong>World!</strong></p>",
        );
        done();
      });

      d.inPorts.bang.attach(s1);
      d.outPorts.tags.attach(s2);
      c.inPorts.tags.attach(s2);
      c.outPorts.html.attach(s3);

      s1.post(new noflo.IP("data", "start"));
    });
  });
  describe("with process function", () => {
    let c = null;
    let sin1 = null;
    let sin2 = null;
    let sin3 = null;
    let sout1 = null;
    let sout2 = null;

    beforeEach(() => {
      sin1 = fixtureSocket();
      sin2 = fixtureSocket();
      sin3 = fixtureSocket();
      sout1 = fixtureSocket();
      sout2 = fixtureSocket();
    });

    it("should trigger on IPs", async (_t) => {
      let hadIPs = [];
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
          bar: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "boolean" },
        },
        process(input, output) {
          hadIPs = [];
          if (input.has("foo")) {
            hadIPs.push("foo");
          }
          if (input.has("bar")) {
            hadIPs.push("bar");
          }
          output.sendDone({ baz: true });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      const firedWith = [];
      listen(sout1, "ip", () => {
        firedWith.push([...hadIPs]);
      });

      sin1.post(new noflo.IP("data", "first"));
      await settle();
      sin2.post(new noflo.IP("data", "second"));
      await settle();
      // Each activation saw exactly the packets delivered so far
      assert.deepStrictEqual(firedWith, [["foo"], ["foo", "bar"]]);
    });
    it("should trigger on IPs to addressable ports", async (_t) => {
      const receivedIndexes = [];
      c = new noflo.Component({
        inPorts: {
          foo: {
            datatype: "string",
            addressable: true,
          },
        },
        outPorts: {
          baz: {
            datatype: "boolean",
          },
        },
        process(input, output) {
          // See what inbound connection indexes have data
          const indexesWithData = input
            .attached("foo")
            .filter((idx) => input.hasData(["foo", idx]));
          if (!indexesWithData.length) {
            return;
          }
          // Read from the first of them
          const indexToUse = indexesWithData[0];
          const packet = input.get(["foo", indexToUse]);
          receivedIndexes.push({
            idx: indexToUse,
            payload: packet.data,
          });
          output.sendDone({ baz: true });
        },
      });

      c.inPorts.foo.attach(sin1, 1);
      c.inPorts.foo.attach(sin2, 0);
      c.outPorts.baz.attach(sout1);

      const firedWith = [];
      listen(sout1, "ip", () => {
        firedWith.push(receivedIndexes.map((entry) => ({ ...entry })));
      });
      sin1.post(new noflo.IP("data", "first"));
      await settle();
      sin2.post(new noflo.IP("data", "second"));
      await settle();
      // Each activation saw exactly the packets delivered so far
      assert.deepStrictEqual(firedWith, [
        [
          {
            idx: 1,
            payload: "first",
          },
        ],
        [
          {
            idx: 1,
            payload: "first",
          },
          {
            idx: 0,
            payload: "second",
          },
        ],
      ]);
    });
    it("should be able to send IPs to addressable connections", (_t, done) => {
      const expected = [
        {
          data: "first",
          index: 1,
        },
        {
          data: "second",
          index: 0,
        },
      ];
      c = new noflo.Component({
        inPorts: {
          foo: {
            datatype: "string",
          },
        },
        outPorts: {
          baz: {
            datatype: "boolean",
            addressable: true,
          },
        },
        process(input, output) {
          if (!input.has("foo")) {
            return;
          }
          const packet = input.get("foo");
          output.sendDone(
            new noflo.IP("data", packet.data, { index: expected.length - 1 }),
          );
        },
      });

      c.inPorts.foo.attach(sin1);
      c.outPorts.baz.attach(sout1, 1);
      c.outPorts.baz.attach(sout2, 0);

      listen(sout1, "ip", (ip) => {
        const exp = expected.shift();
        const received = {
          data: ip.data,
          index: 1,
        };
        assert.deepStrictEqual(received, exp);
        if (!expected.length) {
          done();
        }
      });
      listen(sout2, "ip", (ip) => {
        const exp = expected.shift();
        const received = {
          data: ip.data,
          index: 0,
        };
        assert.deepStrictEqual(received, exp);
        if (!expected.length) {
          done();
        }
      });
      sin1.post(new noflo.IP("data", "first"));
      sin1.post(new noflo.IP("data", "second"));
    });
    it("trying to send to addressable port without providing index should fail", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: {
            datatype: "string",
          },
        },
        outPorts: {
          baz: {
            datatype: "boolean",
            addressable: true,
          },
        },
        process(input, output) {
          if (!input.hasData("foo")) {
            return;
          }
          const packet = input.get("foo");
          const noIndex = new noflo.IP("data", packet.data);
          assert.throws(() => output.sendDone(noIndex));
          done();
        },
      });

      c.inPorts.foo.attach(sin1);
      c.outPorts.baz.attach(sout1, 1);
      c.outPorts.baz.attach(sout2, 0);

      listen(sout1, "ip", () => {});
      listen(sout2, "ip", () => {});

      sin1.post(new noflo.IP("data", "first"));
    });
    it("should be able to send falsy IPs", (_t, done) => {
      const expected = [
        {
          port: "out1",
          data: 1,
        },
        {
          port: "out2",
          data: 0,
        },
      ];
      c = new noflo.Component({
        inPorts: {
          foo: {
            datatype: "string",
          },
        },
        outPorts: {
          out1: {
            datatype: "int",
          },
          out2: {
            datatype: "int",
          },
        },
        process(input, output) {
          if (!input.has("foo")) {
            return;
          }
          input.get("foo");
          output.sendDone({
            out1: 1,
            out2: 0,
          });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.outPorts.out1.attach(sout1, 1);
      c.outPorts.out2.attach(sout2, 0);

      listen(sout1, "ip", (ip) => {
        const exp = expected.shift();
        const received = {
          port: "out1",
          data: ip.data,
        };
        assert.deepStrictEqual(received, exp);
        if (!expected.length) {
          done();
        }
      });
      listen(sout2, "ip", (ip) => {
        const exp = expected.shift();
        const received = {
          port: "out2",
          data: ip.data,
        };
        assert.deepStrictEqual(received, exp);
        if (!expected.length) {
          done();
        }
      });
      sin1.post(new noflo.IP("data", "first"));
    });
    it("should trigger from non-triggering ports when other ports hold buffered data (#607)", async (_t) => {
      const triggered = [];
      c = new noflo.Component({
        inPorts: {
          foo: {
            datatype: "string",
            triggering: false,
          },
          bar: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "boolean" },
        },
        process(input, output) {
          triggered.push(input.port.name);
          output.sendDone({ baz: true });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      sin1.post(new noflo.IP("data", "first"));
      await settle();
      assert.deepStrictEqual(
        triggered,
        [],
        "non-triggering port does not fire alone",
      );
      sin2.post(new noflo.IP("data", "second"));
      await settle();
      assert.deepStrictEqual(triggered, ["bar"], "first firing");
      sin1.post(new noflo.IP("data", "first"));
      await settle();
      assert.deepStrictEqual(triggered, ["bar", "foo"], "second firing");
      sin2.post(new noflo.IP("data", "second"));
      await settle();
      assert.deepStrictEqual(triggered, ["bar", "foo", "bar"], "third firing");
    });
    it("should fetch undefined for premature data", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: {
            datatype: "string",
          },
          bar: {
            datatype: "boolean",
            triggering: false,
            control: true,
          },
          baz: {
            datatype: "string",
            triggering: false,
            control: true,
          },
        },
        process(input) {
          if (!input.has("foo")) {
            return;
          }
          const [foo, bar, baz] = input.getData("foo", "bar", "baz");
          assert.strictEqual(typeof foo, "string");
          assert.strictEqual(bar, undefined);
          assert.strictEqual(baz, undefined);
          done();
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.inPorts.baz.attach(sin3);

      sin1.post(new noflo.IP("data", "AZ"));
      sin2.post(new noflo.IP("data", true));
      sin3.post(new noflo.IP("data", "first"));
    });
    it("should receive and send complete noflo.IP objects", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
          bar: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "object" },
        },
        process(input, output) {
          if (!input.has("foo", "bar")) {
            return;
          }
          const [foo, bar] = input.get("foo", "bar");
          const baz = {
            foo: foo.data,
            bar: bar.data,
            groups: foo.groups,
            type: bar.type,
          };
          output.sendDone({
            baz: new noflo.IP("data", baz, { groups: ["baz"] }),
          });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data.foo, "foo");
        assert.strictEqual(ip.data.bar, "bar");
        assert.deepStrictEqual(ip.data.groups, ["foo"]);
        assert.strictEqual(ip.data.type, "data");
        assert.deepStrictEqual(ip.groups, ["baz"]);
        done();
      });

      sin1.post(new noflo.IP("data", "foo", { groups: ["foo"] }));
      sin2.post(new noflo.IP("data", "bar", { groups: ["bar"] }));
    });
    it("should stamp IP objects with the datatype of the outport when sending", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "all" },
        },
        outPorts: {
          baz: { datatype: "string" },
        },
        process(input, output) {
          if (!input.has("foo")) {
            return;
          }
          const foo = input.get("foo");
          output.sendDone({ baz: foo });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, "foo");
        assert.strictEqual(ip.datatype, "string");
        done();
      });

      sin1.post(new noflo.IP("data", "foo"));
    });
    it("should stamp IP objects with the datatype of the inport when receiving", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "all" },
        },
        process(input, output) {
          if (!input.has("foo")) {
            return;
          }
          const foo = input.get("foo");
          output.sendDone({ baz: foo });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, "foo");
        assert.strictEqual(ip.datatype, "string");
        done();
      });

      sin1.post(new noflo.IP("data", "foo"));
    });
    it("should stamp IP objects with the schema of the outport when sending", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "all" },
        },
        outPorts: {
          baz: {
            datatype: "string",
            schema: "text/markdown",
          },
        },
        process(input, output) {
          if (!input.has("foo")) {
            return;
          }
          const foo = input.get("foo");
          output.sendDone({ baz: foo });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, "foo");
        assert.strictEqual(ip.datatype, "string");
        assert.strictEqual(ip.schema, "text/markdown");
        done();
      });

      sin1.post(new noflo.IP("data", "foo"));
    });
    it("should stamp IP objects with the schema of the inport when receiving", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: {
            datatype: "string",
            schema: "text/markdown",
          },
        },
        outPorts: {
          baz: { datatype: "all" },
        },
        process(input, output) {
          if (!input.has("foo")) {
            return;
          }
          const foo = input.get("foo");
          output.sendDone({ baz: foo });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, "foo");
        assert.strictEqual(ip.datatype, "string");
        assert.strictEqual(ip.schema, "text/markdown");
        done();
      });

      sin1.post(new noflo.IP("data", "foo"));
    });
    it("should receive and send just IP data if wanted", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
          bar: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "object" },
        },
        process(input, output) {
          if (!input.has("foo", "bar")) {
            return;
          }
          const [foo, bar] = input.getData("foo", "bar");
          const baz = {
            foo,
            bar,
          };
          output.sendDone({ baz });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data.foo, "foo");
        assert.strictEqual(ip.data.bar, "bar");
        done();
      });

      sin1.post(new noflo.IP("data", "foo", { groups: ["foo"] }));
      sin2.post(new noflo.IP("data", "bar", { groups: ["bar"] }));
    });
    it("should receive IPs and be able to selectively find them", (_t, done) => {
      let called = 0;
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
          bar: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "object" },
        },
        process(input, output) {
          const validate = (ip) => {
            called++;
            return ip.type === "data" && ip.data === "hello";
          };
          if (!input.has("foo", "bar", validate)) {
            return;
          }
          let foo = input.get("foo");
          while ((foo != null ? foo.type : undefined) !== "data") {
            foo = input.get("foo");
          }
          const bar = input.getData("bar");
          output.sendDone({ baz: `${foo.data}:${bar}` });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      let shouldHaveSent = false;

      listen(sout1, "ip", (ip) => {
        assert.strictEqual(
          shouldHaveSent,
          true,
          "Should not sent before its time",
        );
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, "hello:hello");
        assert.strictEqual(called, 10);
        done();
      });

      sin1.post(new noflo.IP("openBracket", "a"));
      sin1.post(
        new noflo.IP(
          "data",
          "hello",
          sin1.post(new noflo.IP("closeBracket", "a")),
        ),
      );
      shouldHaveSent = true;
      sin2.post(new noflo.IP("data", "hello"));
    });
    it("should keep last value for controls", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
          bar: {
            datatype: "string",
            control: true,
          },
        },
        outPorts: {
          baz: { datatype: "object" },
        },
        process(input, output) {
          if (!input.has("foo", "bar")) {
            return;
          }
          const [foo, bar] = input.getData("foo", "bar");
          const baz = {
            foo,
            bar,
          };
          output.sendDone({ baz });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data.foo, "foo");
        assert.strictEqual(ip.data.bar, "bar");
        listenOnce(sout1, "ip", (ip) => {
          assert.strictEqual(typeof ip, "object");
          assert.strictEqual(ip.type, "data");
          assert.strictEqual(ip.data.foo, "boo");
          assert.strictEqual(ip.data.bar, "bar");
          done();
        });
      });

      sin1.post(new noflo.IP("data", "foo"));
      sin2.post(new noflo.IP("data", "bar"));
      sin1.post(new noflo.IP("data", "boo"));
    });
    it("should keep last data-typed IP packet for controls", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
          bar: {
            datatype: "string",
            control: true,
          },
        },
        outPorts: {
          baz: { datatype: "object" },
        },
        process(input, output) {
          if (!input.has("foo", "bar")) {
            return;
          }
          const [foo, bar] = input.getData("foo", "bar");
          const baz = {
            foo,
            bar,
          };
          output.sendDone({ baz });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data.foo, "foo");
        assert.strictEqual(ip.data.bar, "bar");
        listenOnce(sout1, "ip", (ip) => {
          assert.strictEqual(typeof ip, "object");
          assert.strictEqual(ip.type, "data");
          assert.strictEqual(ip.data.foo, "boo");
          assert.strictEqual(ip.data.bar, "bar");
          done();
        });
      });

      sin1.post(new noflo.IP("data", "foo"));
      sin2.post(new noflo.IP("openBracket"));
      sin2.post(new noflo.IP("data", "bar"));
      sin2.post(new noflo.IP("closeBracket"));
      sin1.post(new noflo.IP("data", "boo"));
    });
    it("should isolate packets with different scopes", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
          bar: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "string" },
        },
        process(input, output) {
          if (!input.has("foo", "bar")) {
            return;
          }
          const [foo, bar] = input.getData("foo", "bar");
          output.sendDone({ baz: `${foo} and ${bar}` });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.scope, "1");
        assert.strictEqual(ip.data, "Josh and Laura");
        listenOnce(sout1, "ip", (ip) => {
          assert.strictEqual(typeof ip, "object");
          assert.strictEqual(ip.type, "data");
          assert.strictEqual(ip.scope, "2");
          assert.strictEqual(ip.data, "Jane and Luke");
          done();
        });
      });

      sin1.post(new noflo.IP("data", "Josh", { scope: "1" }));
      sin2.post(new noflo.IP("data", "Luke", { scope: "2" }));
      sin2.post(new noflo.IP("data", "Laura", { scope: "1" }));
      sin1.post(new noflo.IP("data", "Jane", { scope: "2" }));
    });
    it("should be able to change scope", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "string" },
        },
        process(input, output) {
          const foo = input.getData("foo");
          output.sendDone({ baz: new noflo.IP("data", foo, { scope: "baz" }) });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.scope, "baz");
        assert.strictEqual(ip.data, "foo");
        done();
      });

      sin1.post(new noflo.IP("data", "foo", { scope: "foo" }));
    });
    it("should support integer scopes", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          foo: { datatype: "string" },
          bar: { datatype: "string" },
        },
        outPorts: {
          baz: { datatype: "string" },
        },
        process(input, output) {
          if (!input.has("foo", "bar")) {
            return;
          }
          const [foo, bar] = input.getData("foo", "bar");
          output.sendDone({ baz: `${foo} and ${bar}` });
        },
      });

      c.inPorts.foo.attach(sin1);
      c.inPorts.bar.attach(sin2);
      c.outPorts.baz.attach(sout1);

      listenOnce(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.scope, 1);
        assert.strictEqual(ip.data, "Josh and Laura");
        listenOnce(sout1, "ip", (ip) => {
          assert.strictEqual(typeof ip, "object");
          assert.strictEqual(ip.type, "data");
          assert.strictEqual(ip.scope, 0);
          assert.strictEqual(ip.data, "Jane and Luke");
          listenOnce(sout1, "ip", (ip) => {
            assert.strictEqual(typeof ip, "object");
            assert.strictEqual(ip.type, "data");
            assert.strictEqual(ip.scope, null);
            assert.strictEqual(ip.data, "Tom and Anna");
            done();
          });
        });
      });

      sin1.post(new noflo.IP("data", "Tom"));
      sin1.post(new noflo.IP("data", "Josh", { scope: 1 }));
      sin2.post(new noflo.IP("data", "Luke", { scope: 0 }));
      sin2.post(new noflo.IP("data", "Laura", { scope: 1 }));
      sin1.post(new noflo.IP("data", "Jane", { scope: 0 }));
      sin2.post(new noflo.IP("data", "Anna"));
    });
    it("should preserve order between input and output", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          msg: { datatype: "string" },
          delay: { datatype: "int" },
        },
        outPorts: {
          out: { datatype: "object" },
        },
        ordered: true,
        process(input, output) {
          if (!input.has("msg", "delay")) {
            return;
          }
          const [msg, delay] = input.getData("msg", "delay");
          setTimeout(() => output.sendDone({ out: { msg, delay } }), delay);
        },
      });

      c.inPorts.msg.attach(sin1);
      c.inPorts.delay.attach(sin2);
      c.outPorts.out.attach(sout1);

      const sample = [
        { delay: 30, msg: "one" },
        { delay: 0, msg: "two" },
        { delay: 20, msg: "three" },
        { delay: 10, msg: "four" },
      ];

      listen(sout1, "ip", (ip) => {
        assert.deepStrictEqual(ip.data, sample.shift());
        if (sample.length === 0) {
          done();
        }
      });

      for (const ip of sample) {
        sin1.post(new noflo.IP("data", ip.msg));
        sin2.post(new noflo.IP("data", ip.delay));
      }
    });
    it("should ignore order between input and output", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          msg: { datatype: "string" },
          delay: { datatype: "int" },
        },
        outPorts: {
          out: { datatype: "object" },
        },
        ordered: false,
        process(input, output) {
          if (!input.has("msg", "delay")) {
            return;
          }
          const [msg, delay] = input.getData("msg", "delay");
          setTimeout(() => output.sendDone({ out: { msg, delay } }), delay);
        },
      });

      c.inPorts.msg.attach(sin1);
      c.inPorts.delay.attach(sin2);
      c.outPorts.out.attach(sout1);

      const sample = [
        { delay: 30, msg: "one" },
        { delay: 0, msg: "two" },
        { delay: 20, msg: "three" },
        { delay: 10, msg: "four" },
      ];

      let count = 0;
      listen(sout1, "ip", (ip) => {
        let src;
        count++;
        switch (count) {
          case 1:
            src = sample[1];
            break;
          case 2:
            src = sample[3];
            break;
          case 3:
            src = sample[2];
            break;
          case 4:
            src = sample[0];
            break;
        }
        assert.deepStrictEqual(ip.data, src);
        if (count === 4) {
          done();
        }
      });

      for (const ip of sample) {
        sin1.post(new noflo.IP("data", ip.msg));
        sin2.post(new noflo.IP("data", ip.delay));
      }
    });
    it("should throw errors if there is no error port", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        process(input, output) {
          const packet = input.get("in");
          assert.strictEqual(packet.data, "some-data");
          assert.throws(() => output.done(new Error("Should fail")));
          done();
        },
      });

      c.inPorts.in.attach(sin1);
      sin1.post(new noflo.IP("data", "some-data"));
    });
    it("should throw errors if there is a non-attached error port", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        outPorts: {
          error: {
            datatype: "object",
            required: true,
          },
        },
        process(input, output) {
          const packet = input.get("in");
          assert.strictEqual(packet.data, "some-data");
          assert.throws(() => output.sendDone(new Error("Should fail")));
          done();
        },
      });

      c.inPorts.in.attach(sin1);
      sin1.post(new noflo.IP("data", "some-data"));
    });
    it("should not throw errors if there is a non-required error port", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        outPorts: {
          error: {
            required: false,
          },
        },
        process(input, output) {
          const packet = input.get("in");
          assert.strictEqual(packet.data, "some-data");
          output.sendDone(new Error("Should not fail"));
          done();
        },
      });

      c.inPorts.in.attach(sin1);
      sin1.post(new noflo.IP("data", "some-data"));
    });
    it("should send out string other port if there is only one port aside from error", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "all",
            required: true,
          },
        },
        outPorts: {
          out: {
            required: true,
          },
          error: {
            required: false,
          },
        },
        process(input, output) {
          input.get("in");
          output.sendDone("some data");
        },
      });

      listen(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.data, "some data");
        done();
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1);

      sin1.post(new noflo.IP("data", "first"));
    });
    it("should send object out other port if there is only one port aside from error", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "all",
            required: true,
          },
        },
        outPorts: {
          out: {
            required: true,
          },
          error: {
            required: false,
          },
        },
        process(input, output) {
          input.get("in");
          output.sendDone({ some: "data" });
        },
      });

      listen(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.deepStrictEqual(ip.data, { some: "data" });
        done();
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1);

      sin1.post(new noflo.IP("data", "first"));
    });
    it("should throw an error if sending without specifying a port and there are multiple ports", (_t, done) => {
      const f = () => {
        c = new noflo.Component({
          inPorts: {
            in: {
              datatype: "string",
              required: true,
            },
          },
          outPorts: {
            out: {
              datatype: "all",
            },
            eh: {
              required: false,
            },
          },
          process(_input, output) {
            output.sendDone("test");
          },
        });

        c.inPorts.in.attach(sin1);
        sin1.post(new noflo.IP("data", "some-data"));
      };
      assert.throws(f);
      done();
    });
    it("should send errors if there is a connected error port", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        outPorts: {
          error: {
            datatype: "object",
          },
        },
        process(input, output) {
          const packet = input.get("in");
          assert.strictEqual(packet.data, "some-data");
          assert.strictEqual(packet.scope, "some-scope");
          output.sendDone(new Error("Should fail"));
        },
      });

      listen(sout1, "ip", (ip) => {
        assert.strictEqual(typeof ip, "object");
        assert.ok(Error.isError(ip.data));
        assert.strictEqual(ip.scope, "some-scope");
        done();
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.error.attach(sout1);
      sin1.post(new noflo.IP("data", "some-data", { scope: "some-scope" }));
    });
    it("should send substreams with multiple errors per activation", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            required: true,
          },
        },
        outPorts: {
          error: {
            datatype: "object",
          },
        },
        process(input, output) {
          const packet = input.get("in");
          assert.strictEqual(packet.data, "some-data");
          assert.strictEqual(packet.scope, "some-scope");
          const errors = [];
          errors.push(new Error("One thing is invalid"));
          errors.push(new Error("Another thing is invalid"));
          output.sendDone(errors);
        },
      });

      const expected = [
        "<",
        "One thing is invalid",
        "Another thing is invalid",
        ">",
      ];
      const actual = [];
      let count = 0;

      listen(sout1, "ip", (ip) => {
        count++;
        assert.strictEqual(typeof ip, "object");
        assert.strictEqual(ip.scope, "some-scope");
        if (ip.type === "openBracket") {
          actual.push("<");
        }
        if (ip.type === "closeBracket") {
          actual.push(">");
        }
        if (ip.type === "data") {
          assert.ok(Error.isError(ip.data));
          actual.push(ip.data.message);
        }
        if (count === 4) {
          assert.deepStrictEqual(actual, expected);
          done();
        }
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.error.attach(sout1);
      sin1.post(new noflo.IP("data", "some-data", { scope: "some-scope" }));
    });
    it("should forward brackets for map-style components", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
          },
          error: {
            datatype: "object",
          },
        },
        process(input, output) {
          const str = input.getData();
          if (typeof str !== "string") {
            output.sendDone(new Error("Input is not string"));
            return;
          }
          output.sendDone({ out: str.toUpperCase() });
        },
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1);
      c.outPorts.error.attach(sout2);

      const source = ["<", "foo", "bar", ">"];
      let count = 0;

      listen(sout1, "ip", (ip) => {
        const data = (() => {
          switch (ip.type) {
            case "openBracket":
              return "<";
            case "closeBracket":
              return ">";
            default:
              return ip.data;
          }
        })();
        assert.strictEqual(data, source[count].toUpperCase());
        count++;
        if (count === 4) {
          done();
        }
      });

      listen(sout2, "ip", (ip) => {
        if (ip.type !== "data") {
          return;
        }
        console.log("Unexpected error", ip);
        done(ip.data);
      });

      for (const data of source) {
        switch (data) {
          case "<":
            sin1.post(new noflo.IP("openBracket"));
            break;
          case ">":
            sin1.post(new noflo.IP("closeBracket"));
            break;
          default:
            sin1.post(new noflo.IP("data", data));
        }
      }
    });
    it("should forward brackets for map-style components with addressable outport", (_t, done) => {
      let sent = false;
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
            addressable: true,
          },
        },
        process(input, output) {
          if (!input.hasData()) {
            return;
          }
          const string = input.getData();
          const idx = sent ? 0 : 1;
          sent = true;
          output.sendDone(new noflo.IP("data", string, { index: idx }));
        },
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1, 1);
      c.outPorts.out.attach(sout2, 0);

      const expected = [
        "1 < a",
        "1 < foo",
        "1 DATA first",
        "1 > foo",
        "0 < a",
        "0 < bar",
        "0 DATA second",
        "0 > bar",
        "0 > a",
        "1 > a",
      ];
      const received = [];
      listen(sout1, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`1 < ${ip.data}`);
            break;
          case "data":
            received.push(`1 DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`1 > ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });
      listen(sout2, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`0 < ${ip.data}`);
            break;
          case "data":
            received.push(`0 DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`0 > ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });

      sin1.post(new noflo.IP("openBracket", "a"));
      sin1.post(new noflo.IP("openBracket", "foo"));
      sin1.post(new noflo.IP("data", "first"));
      sin1.post(new noflo.IP("closeBracket", "foo"));
      sin1.post(new noflo.IP("openBracket", "bar"));
      sin1.post(new noflo.IP("data", "second"));
      sin1.post(new noflo.IP("closeBracket", "bar"));
      sin1.post(new noflo.IP("closeBracket", "a"));
    });
    it("should forward brackets for async map-style components with addressable outport", (_t, done) => {
      let sent = false;
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
            addressable: true,
          },
        },
        process(input, output) {
          if (!input.hasData()) {
            return;
          }
          const string = input.getData();
          const idx = sent ? 0 : 1;
          sent = true;
          setTimeout(
            () => output.sendDone(new noflo.IP("data", string, { index: idx })),
            1,
          );
        },
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1, 1);
      c.outPorts.out.attach(sout2, 0);

      const expected = [
        "1 < a",
        "1 < foo",
        "1 DATA first",
        "1 > foo",
        "0 < a",
        "0 < bar",
        "0 DATA second",
        "0 > bar",
        "0 > a",
        "1 > a",
      ];
      const received = [];
      listen(sout1, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`1 < ${ip.data}`);
            break;
          case "data":
            received.push(`1 DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`1 > ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });
      listen(sout2, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`0 < ${ip.data}`);
            break;
          case "data":
            received.push(`0 DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`0 > ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });

      sin1.post(new noflo.IP("openBracket", "a"));
      sin1.post(new noflo.IP("openBracket", "foo"));
      sin1.post(new noflo.IP("data", "first"));
      sin1.post(new noflo.IP("closeBracket", "foo"));
      sin1.post(new noflo.IP("openBracket", "bar"));
      sin1.post(new noflo.IP("data", "second"));
      sin1.post(new noflo.IP("closeBracket", "bar"));
      sin1.post(new noflo.IP("closeBracket", "a"));
    });
    it("should forward brackets for map-style components with addressable in/outports", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            addressable: true,
          },
        },
        outPorts: {
          out: {
            datatype: "string",
            addressable: true,
          },
        },
        process(input, output) {
          const indexesWithData = [];
          for (const idx of input.attached()) {
            if (input.hasData(["in", idx])) {
              indexesWithData.push(idx);
            }
          }
          if (!indexesWithData.length) {
            return;
          }
          const indexToUse = indexesWithData[0];
          const data = input.get(["in", indexToUse]);
          const ip = new noflo.IP("data", data.data);
          ip.index = indexToUse;
          output.sendDone(ip);
        },
      });

      c.inPorts.in.attach(sin1, 1);
      c.inPorts.in.attach(sin2, 0);
      c.outPorts.out.attach(sout1, 1);
      c.outPorts.out.attach(sout2, 0);

      const expected = [
        "1 < a",
        "1 < foo",
        "1 DATA first",
        "1 > foo",
        "0 < bar",
        "0 DATA second",
        "0 > bar",
        "1 > a",
      ];
      const received = [];
      listen(sout1, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`1 < ${ip.data}`);
            break;
          case "data":
            received.push(`1 DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`1 > ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });
      listen(sout2, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`0 < ${ip.data}`);
            break;
          case "data":
            received.push(`0 DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`0 > ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });

      sin1.post(new noflo.IP("openBracket", "a"));
      sin1.post(new noflo.IP("openBracket", "foo"));
      sin1.post(new noflo.IP("data", "first"));
      sin1.post(new noflo.IP("closeBracket", "foo"));
      sin2.post(new noflo.IP("openBracket", "bar"));
      sin2.post(new noflo.IP("data", "second"));
      sin2.post(new noflo.IP("closeBracket", "bar"));
      sin1.post(new noflo.IP("closeBracket", "a"));
    });
    it("should forward brackets for async map-style components with addressable in/outports", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
            addressable: true,
          },
        },
        outPorts: {
          out: {
            datatype: "string",
            addressable: true,
          },
        },
        process(input, output) {
          const indexesWithData = [];
          for (const idx of input.attached()) {
            if (input.hasData(["in", idx])) {
              indexesWithData.push(idx);
            }
          }
          if (!indexesWithData.length) {
            return;
          }
          const data = input.get(["in", indexesWithData[0]]);
          setTimeout(() => {
            const ip = new noflo.IP("data", data.data);
            ip.index = data.index;
            output.sendDone(ip);
          }, 1);
        },
      });

      c.inPorts.in.attach(sin1, 1);
      c.inPorts.in.attach(sin2, 0);
      c.outPorts.out.attach(sout1, 1);
      c.outPorts.out.attach(sout2, 0);

      const expected = [
        "1 < a",
        "1 < foo",
        "1 DATA first",
        "1 > foo",
        "0 < bar",
        "0 DATA second",
        "0 > bar",
        "1 > a",
      ];
      const received = [];
      listen(sout1, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`1 < ${ip.data}`);
            break;
          case "data":
            received.push(`1 DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`1 > ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });
      listen(sout2, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`0 < ${ip.data}`);
            break;
          case "data":
            received.push(`0 DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`0 > ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });

      sin1.post(new noflo.IP("openBracket", "a"));
      sin1.post(new noflo.IP("openBracket", "foo"));
      sin1.post(new noflo.IP("data", "first"));
      sin1.post(new noflo.IP("closeBracket", "foo"));
      sin2.post(new noflo.IP("openBracket", "bar"));
      sin2.post(new noflo.IP("data", "second"));
      sin2.post(new noflo.IP("closeBracket", "bar"));
      sin1.post(new noflo.IP("closeBracket", "a"));
    });
    it("should forward brackets to error port in async components", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
          },
          error: {
            datatype: "object",
          },
        },
        process(input, output) {
          const str = input.getData();
          setTimeout(() => {
            if (typeof str !== "string") {
              output.sendDone(new Error("Input is not string"));
              return;
            }
            output.sendDone({ out: str.toUpperCase() });
          }, 10);
        },
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1);
      c.outPorts.error.attach(sout2);

      listen(sout1, "ip", () => {});
      // done new Error "Unexpected IP: #{ip.type} #{ip.data}"

      let count = 0;
      listen(sout2, "ip", (ip) => {
        count++;
        switch (count) {
          case 1:
            assert.strictEqual(ip.type, "openBracket");
            break;
          case 2:
            assert.strictEqual(ip.type, "data");
            assert.strictEqual(Error.isError(ip.data), true);
            break;
          case 3:
            assert.strictEqual(ip.type, "closeBracket");
            break;
        }
        if (count === 3) {
          done();
        }
      });

      sin1.post(new noflo.IP("openBracket", "foo"));
      sin1.post(new noflo.IP("data", { bar: "baz" }));
      sin1.post(new noflo.IP("closeBracket", "foo"));
    });
    it("should not forward brackets if error port is not connected", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
            required: true,
          },
          error: {
            datatype: "object",
            required: true,
          },
        },
        process(input, output) {
          const str = input.getData();
          setTimeout(() => {
            if (typeof str !== "string") {
              output.sendDone(new Error("Input is not string"));
              return;
            }
            output.sendDone({ out: str.toUpperCase() });
          }, 10);
        },
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1);
      // c.outPorts.error.attach sout2

      listen(sout1, "ip", (ip) => {
        if (ip.type === "closeBracket") {
          done();
        }
      });

      listen(sout2, "ip", (ip) => {
        done(new Error(`Unexpected error IP: ${ip.type} ${ip.data}`));
      });

      assert.doesNotThrow(() => {
        sin1.post(new noflo.IP("openBracket", "foo"));
        sin1.post(new noflo.IP("data", "bar"));
        sin1.post(new noflo.IP("closeBracket", "foo"));
      });
    });
    it("should support custom bracket forwarding mappings with auto-ordering", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          msg: {
            datatype: "string",
          },
          delay: {
            datatype: "int",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
          },
          error: {
            datatype: "object",
          },
        },
        forwardBrackets: {
          msg: ["out", "error"],
          delay: ["error"],
        },
        process(input, output) {
          if (!input.hasData("msg", "delay")) {
            return;
          }
          const [msg, delay] = input.getData("msg", "delay");
          if (delay < 0) {
            output.sendDone(new Error("Delay is negative"));
            return;
          }
          setTimeout(() => {
            output.sendDone({ out: { msg, delay } });
          }, delay);
        },
      });

      c.inPorts.msg.attach(sin1);
      c.inPorts.delay.attach(sin2);
      c.outPorts.out.attach(sout1);
      c.outPorts.error.attach(sout2);

      const sample = [
        { delay: 30, msg: "one" },
        { delay: 0, msg: "two" },
        { delay: 20, msg: "three" },
        { delay: 10, msg: "four" },
        { delay: -40, msg: "five" },
      ];

      let count = 0;
      let errCount = 0;
      listen(sout1, "ip", (ip) => {
        let src = null;
        switch (count) {
          case 0:
            assert.strictEqual(ip.type, "openBracket");
            assert.strictEqual(ip.data, "msg");
            break;
          case 5:
            assert.strictEqual(ip.type, "closeBracket");
            assert.strictEqual(ip.data, "msg");
            break;
          default:
            src = sample[count - 1];
        }
        if (src) {
          assert.deepStrictEqual(ip.data, src);
        }
        count++;
        // done() if count is 6
      });

      listen(sout2, "ip", (ip) => {
        switch (errCount) {
          case 0:
            assert.strictEqual(ip.type, "openBracket");
            assert.strictEqual(ip.data, "msg");
            break;
          case 1:
            assert.strictEqual(ip.type, "openBracket");
            assert.strictEqual(ip.data, "delay");
            break;
          case 2:
            assert.strictEqual(ip.type, "data");
            assert.strictEqual(Error.isError(ip.data), true);
            break;
          case 3:
            assert.strictEqual(ip.type, "closeBracket");
            assert.strictEqual(ip.data, "delay");
            break;
          case 4:
            assert.strictEqual(ip.type, "closeBracket");
            assert.strictEqual(ip.data, "msg");
            break;
        }
        errCount++;
        if (errCount === 5) {
          done();
        }
      });

      sin1.post(new noflo.IP("openBracket", "msg"));
      sin2.post(new noflo.IP("openBracket", "delay"));

      for (const ip of sample) {
        sin1.post(new noflo.IP("data", ip.msg));
        sin2.post(new noflo.IP("data", ip.delay));
      }

      sin2.post(new noflo.IP("closeBracket", "delay"));
      sin1.post(new noflo.IP("closeBracket", "msg"));
    });
    it("should de-duplicate brackets when asynchronously forwarding from multiple inports", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in1: {
            datatype: "string",
          },
          in2: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
          },
          error: {
            datatype: "object",
          },
        },
        forwardBrackets: {
          in1: ["out", "error"],
          in2: ["out", "error"],
        },
        process(input, output) {
          if (!input.hasData("in1", "in2")) {
            return;
          }
          const [one, two] = input.getData("in1", "in2");
          setTimeout(() => output.sendDone({ out: `${one}:${two}` }), 1);
        },
      });

      c.inPorts.in1.attach(sin1);
      c.inPorts.in2.attach(sin2);
      c.outPorts.out.attach(sout1);
      c.outPorts.error.attach(sout2);

      // Fail early on errors
      listen(sout2, "ip", (ip) => {
        if (ip.type !== "data") {
          return;
        }
        done(ip.data);
      });

      const expected = [
        "< a",
        "< b",
        "DATA one:yksi",
        "< c",
        "DATA two:kaksi",
        "> c",
        "DATA three:kolme",
        "> b",
        "> a",
      ];
      const received = [];

      listen(sout1, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`< ${ip.data}`);
            break;
          case "data":
            received.push(`DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`> ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });

      sin1.post(new noflo.IP("openBracket", "a"));
      sin1.post(new noflo.IP("openBracket", "b"));
      sin1.post(new noflo.IP("data", "one"));
      sin1.post(new noflo.IP("openBracket", "c"));
      sin1.post(new noflo.IP("data", "two"));
      sin1.post(new noflo.IP("closeBracket", "c"));
      sin2.post(new noflo.IP("openBracket", "a"));
      sin2.post(new noflo.IP("openBracket", "b"));
      sin2.post(new noflo.IP("data", "yksi"));
      sin2.post(new noflo.IP("data", "kaksi"));
      sin1.post(new noflo.IP("data", "three"));
      sin1.post(new noflo.IP("closeBracket", "b"));
      sin1.post(new noflo.IP("closeBracket", "a"));
      sin2.post(new noflo.IP("data", "kolme"));
      sin2.post(new noflo.IP("closeBracket", "b"));
      sin2.post(new noflo.IP("closeBracket", "a"));
    });
    it("should de-duplicate brackets when synchronously forwarding from multiple inports", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in1: {
            datatype: "string",
          },
          in2: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
          },
          error: {
            datatype: "object",
          },
        },
        forwardBrackets: {
          in1: ["out", "error"],
          in2: ["out", "error"],
        },
        process(input, output) {
          if (!input.hasData("in1", "in2")) {
            return;
          }
          const [one, two] = input.getData("in1", "in2");
          output.sendDone({ out: `${one}:${two}` });
        },
      });

      c.inPorts.in1.attach(sin1);
      c.inPorts.in2.attach(sin2);
      c.outPorts.out.attach(sout1);
      c.outPorts.error.attach(sout2);

      // Fail early on errors
      listen(sout2, "ip", (ip) => {
        if (ip.type !== "data") {
          return;
        }
        done(ip.data);
      });

      const expected = [
        "< a",
        "< b",
        "DATA one:yksi",
        "< c",
        "DATA two:kaksi",
        "> c",
        "DATA three:kolme",
        "> b",
        "> a",
      ];
      const received = [];

      listen(sout1, "ip", (ip) => {
        switch (ip.type) {
          case "openBracket":
            received.push(`< ${ip.data}`);
            break;
          case "data":
            received.push(`DATA ${ip.data}`);
            break;
          case "closeBracket":
            received.push(`> ${ip.data}`);
            break;
        }
        if (received.length !== expected.length) {
          return;
        }
        assert.deepStrictEqual(received, expected);
        done();
      });

      sin1.post(new noflo.IP("openBracket", "a"));
      sin1.post(new noflo.IP("openBracket", "b"));
      sin1.post(new noflo.IP("data", "one"));
      sin1.post(new noflo.IP("openBracket", "c"));
      sin1.post(new noflo.IP("data", "two"));
      sin1.post(new noflo.IP("closeBracket", "c"));
      sin2.post(new noflo.IP("openBracket", "a"));
      sin2.post(new noflo.IP("openBracket", "b"));
      sin2.post(new noflo.IP("data", "yksi"));
      sin2.post(new noflo.IP("data", "kaksi"));
      sin1.post(new noflo.IP("data", "three"));
      sin1.post(new noflo.IP("closeBracket", "b"));
      sin1.post(new noflo.IP("closeBracket", "a"));
      sin2.post(new noflo.IP("data", "kolme"));
      sin2.post(new noflo.IP("closeBracket", "b"));
      sin2.post(new noflo.IP("closeBracket", "a"));
    });
    it("should not apply auto-ordering if that option is false", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          msg: { datatype: "string" },
          delay: { datatype: "int" },
        },
        outPorts: {
          out: { datatype: "object" },
        },
        ordered: false,
        autoOrdering: false,
        process(input, output) {
          // Skip brackets
          if (input.ip.type !== "data") {
            return input.get(input.port.name);
          }
          if (!input.has("msg", "delay")) {
            return;
          }
          const [msg, delay] = input.getData("msg", "delay");
          setTimeout(() => output.sendDone({ out: { msg, delay } }), delay);
        },
      });

      c.inPorts.msg.attach(sin1);
      c.inPorts.delay.attach(sin2);
      c.outPorts.out.attach(sout1);

      const sample = [
        { delay: 30, msg: "one" },
        { delay: 0, msg: "two" },
        { delay: 20, msg: "three" },
        { delay: 10, msg: "four" },
      ];

      let count = 0;
      listen(sout1, "ip", (ip) => {
        let src;
        count++;
        switch (count) {
          case 1:
            src = sample[1];
            break;
          case 2:
            src = sample[3];
            break;
          case 3:
            src = sample[2];
            break;
          case 4:
            src = sample[0];
            break;
        }
        assert.deepStrictEqual(ip.data, src);
        if (count === 4) {
          done();
        }
      });

      sin1.post(new noflo.IP("openBracket", "msg"));
      sin2.post(new noflo.IP("openBracket", "delay"));

      for (const ip of sample) {
        sin1.post(new noflo.IP("data", ip.msg));
        sin2.post(new noflo.IP("data", ip.delay));
      }

      sin1.post(new noflo.IP("closeBracket", "msg"));
      sin2.post(new noflo.IP("closeBracket", "delay"));
    });
    it("should forward noflo.IP metadata for map-style components", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
          },
          error: {
            datatype: "object",
          },
        },
        process(input, output) {
          const ip = input.get();
          if (typeof ip.data !== "string") {
            output.sendDone(new Error("Input is not string"));
            return;
          }
          ip.data = ip.data.toUpperCase();
          output.sendDone({ out: ip });
        },
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1);
      c.outPorts.error.attach(sout2);

      const source = ["foo", "bar", "baz"];
      let count = 0;
      listen(sout1, "ip", (ip) => {
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(typeof ip.count, "number");
        assert.strictEqual(typeof ip.length, "number");
        assert.strictEqual(ip.data, source[ip.count].toUpperCase());
        assert.strictEqual(ip.length, source.length);
        count++;
        if (count === source.length) {
          done();
        }
      });

      let n = 0;
      for (const str of source) {
        sin1.post(
          new noflo.IP("data", str, {
            count: n++,
            length: source.length,
          }),
        );
      }
    });
    it("should be safe dropping IPs", (_t, done) => {
      c = new noflo.Component({
        inPorts: {
          in: {
            datatype: "string",
          },
        },
        outPorts: {
          out: {
            datatype: "string",
          },
          error: {
            datatype: "object",
          },
        },
        process(input, output) {
          const data = input.get("in");
          data.drop();
          output.done();
          done();
        },
      });

      c.inPorts.in.attach(sin1);
      c.outPorts.out.attach(sout1);
      c.outPorts.error.attach(sout2);

      listen(sout1, "ip", (ip) => {
        done(ip);
      });

      sin1.post(new noflo.IP("data", "foo", { meta: "bar" }));
    });
    describe("with custom callbacks", () => {
      beforeEach(() => {
        c = new noflo.Component({
          inPorts: {
            foo: { datatype: "string" },
            bar: {
              datatype: "int",
              control: true,
            },
          },
          outPorts: {
            baz: { datatype: "object" },
            err: { datatype: "object" },
          },
          ordered: true,
          process(input, output) {
            if (!input.has("foo", "bar")) {
              return;
            }
            const [foo, bar] = input.getData("foo", "bar");
            if (bar < 0 || bar > 1000) {
              output.sendDone({ err: new Error(`Bar is not correct: ${bar}`) });
              return;
            }
            // Start capturing output
            input.activate();
            output.send({ baz: new noflo.IP("openBracket") });
            const baz = {
              foo,
              bar,
            };
            output.send({ baz });
            setTimeout(() => {
              output.send({ baz: new noflo.IP("closeBracket") });
              output.done();
            }, bar);
          },
        });
        c.inPorts.foo.attach(sin1);
        c.inPorts.bar.attach(sin2);
        c.outPorts.baz.attach(sout1);
        c.outPorts.err.attach(sout2);
      });
      it("should fail on wrong input", (_t, done) => {
        listenOnce(sout1, "ip", () => {
          done(new Error("Unexpected baz"));
        });
        listenOnce(sout2, "ip", (ip) => {
          assert.strictEqual(typeof ip, "object");
          assert.strictEqual(Error.isError(ip.data), true);
          assert.ok(ip.data.message.includes("Bar"));
          done();
        });

        sin1.post(new noflo.IP("data", "fff"));
        sin2.post(new noflo.IP("data", -120));
      });
      it("should send substreams", (_t, done) => {
        const sample = [
          { bar: 30, foo: "one" },
          { bar: 0, foo: "two" },
        ];
        const expected = ["<", "one", ">", "<", "two", ">"];
        const actual = [];
        let count = 0;
        listen(sout1, "ip", (ip) => {
          count++;
          switch (ip.type) {
            case "openBracket":
              actual.push("<");
              break;
            case "closeBracket":
              actual.push(">");
              break;
            default:
              actual.push(ip.data.foo);
          }
          if (count === 6) {
            assert.deepStrictEqual(actual, expected);
            done();
          }
        });
        listenOnce(sout2, "ip", (ip) => {
          done(ip.data);
        });

        for (const item of sample) {
          sin2.post(new noflo.IP("data", item.bar));
          sin1.post(new noflo.IP("data", item.foo));
        }
      });
    });
    describe("using streams", () => {
      it("should not trigger without a full stream without getting the whole stream", (_t, done) => {
        c = new noflo.Component({
          inPorts: {
            in: {
              datatype: "string",
            },
          },
          outPorts: {
            out: {
              datatype: "string",
            },
          },
          process(input) {
            if (input.hasStream("in")) {
              done(new Error("should never trigger this"));
            }

            if (input.has("in", (ip) => ip.type === "closeBracket")) {
              done();
            }
          },
        });

        c.forwardBrackets = {};
        c.inPorts.in.attach(sin1);

        sin1.post(new noflo.IP("openBracket"));
        sin1.post(new noflo.IP("openBracket"));
        sin1.post(new noflo.IP("openBracket"));
        sin1.post(new noflo.IP("data", "eh"));
        sin1.post(new noflo.IP("closeBracket"));
      });
      it("should trigger when forwardingBrackets because then it is only data with no brackets and is a full stream", (_t, done) => {
        c = new noflo.Component({
          inPorts: {
            in: {
              datatype: "string",
            },
          },
          outPorts: {
            out: {
              datatype: "string",
            },
          },
          process(input) {
            if (!input.hasStream("in")) {
              return;
            }
            done();
          },
        });
        c.forwardBrackets = { in: ["out"] };

        c.inPorts.in.attach(sin1);
        sin1.post(new noflo.IP("data", "eh"));
      });
      it("should get full stream when it has a single packet stream and it should clear it", (_t, done) => {
        c = new noflo.Component({
          inPorts: {
            eh: {
              datatype: "string",
            },
          },
          outPorts: {
            canada: {
              datatype: "string",
            },
          },
          process(input) {
            if (!input.hasStream("eh")) {
              return;
            }
            const stream = input.getStream("eh");
            const packetTypes = stream.map((ip) => [ip.type, ip.data]);
            assert.deepStrictEqual(packetTypes, [["data", "moose"]]);
            assert.equal(input.has("eh"), false);
            done();
          },
        });

        c.inPorts.eh.attach(sin1);
        sin1.post(new noflo.IP("data", "moose"));
      });
      it("should get full stream when it has a full stream, and it should clear it", (_t, done) => {
        c = new noflo.Component({
          inPorts: {
            eh: {
              datatype: "string",
            },
          },
          outPorts: {
            canada: {
              datatype: "string",
            },
          },
          process(input) {
            if (!input.hasStream("eh")) {
              return;
            }
            const stream = input.getStream("eh");
            const packetTypes = stream.map((ip) => [ip.type, ip.data]);
            assert.deepStrictEqual(packetTypes, [
              ["openBracket", null],
              ["openBracket", "foo"],
              ["data", "moose"],
              ["closeBracket", "foo"],
              ["closeBracket", null],
            ]);
            assert.equal(input.has("eh"), false);
            done();
          },
        });

        c.inPorts.eh.attach(sin1);
        sin1.post(new noflo.IP("openBracket"));
        sin1.post(new noflo.IP("openBracket", "foo"));
        sin1.post(new noflo.IP("data", "moose"));
        sin1.post(new noflo.IP("closeBracket", "foo"));
        sin1.post(new noflo.IP("closeBracket"));
      });
      it("should get full stream from a forwarding inport when it has a bracketed stream (#545)", (_t, done) => {
        c = new noflo.Component({
          inPorts: {
            in: {
              datatype: "string",
            },
          },
          outPorts: {
            out: {
              datatype: "string",
            },
          },
          process(input, output) {
            if (!input.hasStream("in")) {
              return;
            }
            const stream = input.getStream("in");
            const packetTypes = stream.map((ip) => [ip.type, ip.data]);
            assert.deepStrictEqual(packetTypes, [
              ["openBracket", "foo"],
              ["data", "one"],
              ["data", "two"],
              ["closeBracket", "foo"],
            ]);
            assert.equal(input.has("in"), false);
            output.sendDone({ out: "ok" });
            done();
          },
        });
        c.forwardBrackets = { in: ["out"] };

        c.inPorts.in.attach(sin1);
        c.outPorts.out.attach(sout1);
        sin1.post(new noflo.IP("openBracket", "foo"));
        sin1.post(new noflo.IP("data", "one"));
        sin1.post(new noflo.IP("data", "two"));
        sin1.post(new noflo.IP("closeBracket", "foo"));
      });
      it("should get data when it has a full stream", (_t, done) => {
        c = new noflo.Component({
          inPorts: {
            eh: {
              datatype: "string",
            },
          },
          outPorts: {
            canada: {
              datatype: "string",
            },
          },
          forwardBrackets: {
            eh: ["canada"],
          },
          process(input, output) {
            if (!input.hasStream("eh")) {
              return;
            }
            const data = input.get("eh");
            assert.strictEqual(data.type, "data");
            assert.strictEqual(data.data, "moose");
            output.sendDone(data);
          },
        });

        const expected = [
          ["openBracket", null],
          ["openBracket", "foo"],
          ["data", "moose"],
          ["closeBracket", "foo"],
          ["closeBracket", null],
        ];
        const received = [];
        listen(sout1, "ip", (ip) => {
          received.push([ip.type, ip.data]);
          if (received.length !== expected.length) {
            return;
          }
          assert.deepStrictEqual(received, expected);
          done();
        });
        c.inPorts.eh.attach(sin1);
        c.outPorts.canada.attach(sout1);
        sin1.post(new noflo.IP("openBracket"));
        sin1.post(new noflo.IP("openBracket", "foo"));
        sin1.post(new noflo.IP("data", "moose"));
        sin1.post(new noflo.IP("closeBracket", "foo"));
        sin1.post(new noflo.IP("closeBracket"));
      });
    });
    describe("with a simple ordered stream", () => {
      it("should send packets with brackets in expected order when synchronous", (_t, done) => {
        const received = [];
        c = new noflo.Component({
          inPorts: {
            in: {
              datatype: "string",
            },
          },
          outPorts: {
            out: {
              datatype: "string",
            },
          },
          process(input, output) {
            if (!input.has("in")) {
              return;
            }
            const data = input.getData("in");
            output.sendDone({ out: data });
          },
        });
        c.nodeId = "Issue465";
        c.inPorts.in.attach(sin1);
        c.outPorts.out.attach(sout1);

        listen(sout1, "ip", (ip) => {
          if (ip.type === "openBracket") {
            if (!ip.data) {
              return;
            }
            received.push(`< ${ip.data}`);
            return;
          }
          if (ip.type === "closeBracket") {
            if (!ip.data) {
              return;
            }
            received.push(`> ${ip.data}`);
            return;
          }
          received.push(ip.data);
        });
        listen(sout1, "disconnect", () => {
          assert.deepStrictEqual(received, [
            "< 1",
            "< 2",
            "A",
            "> 2",
            "B",
            "> 1",
          ]);
          done();
        });
        sin1.connect();
        openBracket(sin1, 1);
        openBracket(sin1, 2);
        sin1.send("A");
        closeBracket(sin1);
        sin1.send("B");
        closeBracket(sin1);
        sin1.disconnect();
      });
      it("should send packets with brackets in expected order when asynchronous", (_t, done) => {
        const received = [];
        c = new noflo.Component({
          inPorts: {
            in: {
              datatype: "string",
            },
          },
          outPorts: {
            out: {
              datatype: "string",
            },
          },
          process(input, output) {
            if (!input.has("in")) {
              return;
            }
            const data = input.getData("in");
            setTimeout(() => output.sendDone({ out: data }), 1);
          },
        });
        c.nodeId = "Issue465";
        c.inPorts.in.attach(sin1);
        c.outPorts.out.attach(sout1);

        listen(sout1, "ip", (ip) => {
          if (ip.type === "openBracket") {
            if (!ip.data) {
              return;
            }
            received.push(`< ${ip.data}`);
            return;
          }
          if (ip.type === "closeBracket") {
            if (!ip.data) {
              return;
            }
            received.push(`> ${ip.data}`);
            return;
          }
          received.push(ip.data);
        });
        listen(sout1, "disconnect", () => {
          assert.deepStrictEqual(received, [
            "< 1",
            "< 2",
            "A",
            "> 2",
            "B",
            "> 1",
          ]);
          done();
        });

        sin1.connect();
        openBracket(sin1, 1);
        openBracket(sin1, 2);
        sin1.send("A");
        closeBracket(sin1);
        sin1.send("B");
        closeBracket(sin1);
        sin1.disconnect();
      });
    });
  });
  describe("with generator components", () => {
    let c = null;
    let sin1 = null;
    let sin2 = null;
    let sin3 = null;
    let sout1 = null;
    let sout2 = null;
    before(() => {
      c = new noflo.Component({
        inPorts: {
          interval: {
            datatype: "number",
            control: true,
          },
          start: { datatype: "bang" },
          stop: { datatype: "bang" },
        },
        outPorts: {
          out: { datatype: "bang" },
          err: { datatype: "object" },
        },
        timer: null,
        ordered: false,
        autoOrdering: false,
        process(input, output, context) {
          if (!input.has("interval")) {
            return;
          }
          if (input.has("start")) {
            input.get("start");
            const interval = parseInt(input.getData("interval"), 10);
            if (this.timer) {
              clearInterval(this.timer.interval);
              this.timer.deactivate();
            }
            // The hold-the-context generator idiom: the start activation
            // stays open, and every tick sends within it. The context
            // completes on the stop packet or at teardown
            this.timer = {
              interval: setInterval(() => {
                output.ports.out.sendIP(new noflo.IP("data", true));
              }, interval),
              deactivate: () => output.done(),
            };
            // Hold the activation: the context completes on the stop
            // packet or at teardown
            return;
          }
          if (input.has("stop")) {
            input.get("stop");
            if (this.timer) {
              clearInterval(this.timer.interval);
              this.timer.deactivate();
              this.timer = null;
            }
          }
          output.done();
        },
      });

      sin1 = fixtureSocket();
      sin2 = fixtureSocket();
      sin3 = fixtureSocket();
      sout1 = fixtureSocket();
      sout2 = fixtureSocket();
      c.inPorts.interval.attach(sin1);
      c.inPorts.start.attach(sin2);
      c.inPorts.stop.attach(sin3);
      c.outPorts.out.attach(sout1);
      c.outPorts.err.attach(sout2);
    });

    it("should emit start event when started", (_t, done) => {
      listen(c, "start", () => {
        assert.strictEqual(c.started, true);
        done();
      });
      c.start().catch(done);
    });
    it("should hold one activation across ticks and close it on stop", async () => {
      // The interval port is triggering by default: its arrival fires a
      // no-op context (no start yet), so the assertions track the BALANCE
      // of open activations rather than raw event counts
      let count = 0;
      let dcount = 0;
      let ticks = 0;
      listen(c, "activate", () => {
        count++;
      });
      listen(sout1, "ip", (ip) => {
        if (ip.type === "data") {
          ticks += 1;
        }
      });
      listen(c, "deactivate", () => {
        dcount++;
      });
      const waitFor = async (check) => {
        for (let i = 0; i < 100; i += 1) {
          if (check()) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new Error("condition not reached");
      };
      sin1.post(new noflo.IP("data", 2));
      sin2.post(new noflo.IP("data", true));
      await waitFor(() => ticks >= 3);
      assert.strictEqual(count - dcount, 1, "one activation held across ticks");
      sin3.post(new noflo.IP("data", true));
      await waitFor(() => count === dcount);
      assert.ok(ticks >= 3, "the ticks emitted");
      assert.strictEqual(
        count - dcount,
        0,
        "the held activation closed on stop",
      );
    });
    it("should emit end event when stopped and no activate after it", (_t, done) => {
      listen(c, "end", () => {
        assert.strictEqual(c.started, false);
        done();
      });
      listen(c, "activate", () => {
        if (!c.started) {
          done(new Error("Unexpected activate after end"));
        }
      });
      c.shutdown().catch(done);
    });
  });
});

describe("Process API backpressure via awaitable output.send()", () => {
  it("returns an admission promise and delivers the packet", async () => {
    const c = new noflo.Component({
      inPorts: { in: { datatype: "int", required: true } },
      outPorts: { out: { datatype: "int" } },
    });
    let sendPromise = null;
    c.process((input, output) => {
      sendPromise = output.send({ out: input.getData("in") });
      if (sendPromise && typeof sendPromise.then === "function") {
        return sendPromise.then(() => output.done());
      }
      output.done();
    });
    const sin = noflo.internalSocket.createSocket({ highWaterMark: 1 });
    const sout = noflo.internalSocket.createSocket({ highWaterMark: 1 });
    c.inPorts.in.attach(sin);
    c.outPorts.out.attach(sout);
    const received = [];
    // The legacy on() API delivers the payload directly (unwrapped)
    listen(sout, "ip", (ip) => {
      if (ip.type === "data") {
        received.push(ip.data);
      }
    });
    sin.post(new noflo.IP("data", 42));
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    assert.equal(typeof sendPromise, "object");
    assert.equal(typeof sendPromise.then, "function");
    assert.deepEqual(received, [42]);
    await sendPromise;
  });
});

describe("sendDone always sends its argument", () => {
  it("sends a null payload as a data IP", async () => {
    const c = new noflo.Component({
      inPorts: { in: { datatype: "all" } },
      outPorts: { out: { datatype: "all" } },
      process(input, output) {
        input.getData("in");
        output.sendDone(null);
      },
    });
    const sin = noflo.internalSocket.createSocket();
    const sout = noflo.internalSocket.createSocket();
    c.inPorts.in.attach(sin);
    c.outPorts.out.attach(sout);
    const received = [];
    listen(sout, "ip", (ip) => received.push(ip));
    sin.post(new noflo.IP("data", "go"));
    await settle();
    assert.equal(received.length, 1);
    assert.equal(received[0].type, "data");
    assert.strictEqual(received[0].data, null);
  });

  it("rejects a bare value on a multi-outport component", async () => {
    const c = new noflo.Component({
      inPorts: { in: { datatype: "all" } },
      outPorts: { a: { datatype: "all" }, b: { datatype: "all" } },
      process(input, output) {
        input.getData("in");
        assert.throws(
          () => output.sendDone(null),
          /Port must be specified for sending output/,
        );
        output.done();
      },
    });
    const sin = noflo.internalSocket.createSocket();
    c.inPorts.in.attach(sin);
    sin.post(new noflo.IP("data", "go"));
    await settle();
  });

  it("rejects a bare value with no sendable outport, with guidance", async () => {
    const c = new noflo.Component({
      inPorts: { in: { datatype: "all" } },
      outPorts: { error: { datatype: "object" } },
      process(input, output) {
        input.getData("in");
        assert.throws(
          () => output.sendDone(null),
          /call done\(\) to finish without sending/,
        );
        output.done();
      },
    });
    const sin = noflo.internalSocket.createSocket();
    c.inPorts.in.attach(sin);
    sin.post(new noflo.IP("data", "go"));
    await settle();
  });

  it("async process: null resolution sends a packet, void resolution sends none", async () => {
    const c = new noflo.Component({
      inPorts: { in: { datatype: "all" } },
      outPorts: { out: { datatype: "all" } },
      process(input) {
        const value = input.getData("in");
        if (value === "null-case") {
          return Promise.resolve(null);
        }
        return Promise.resolve(undefined);
      },
    });
    const sin = noflo.internalSocket.createSocket();
    const sout = noflo.internalSocket.createSocket();
    c.inPorts.in.attach(sin);
    c.outPorts.out.attach(sout);
    const received = [];
    listen(sout, "ip", (ip) => received.push(ip));
    sin.post(new noflo.IP("data", "null-case"));
    await settle();
    assert.equal(received.length, 1);
    assert.strictEqual(received[0].data, null);
    sin.post(new noflo.IP("data", "void-case"));
    await settle();
    assert.equal(received.length, 1, "void resolution sends nothing");
  });
});

describe("control port firing (#607)", () => {
  let c = null;
  let sin = null;
  let scontrol = null;
  let sout = null;
  let received;
  let firings;

  const build = () => {
    received = [];
    firings = 0;
    c = new noflo.Component({
      inPorts: {
        in: { datatype: "int" },
        control: { datatype: "string", triggering: false },
      },
      outPorts: { out: { datatype: "int" } },
    });
    c.process((input, output) => {
      firings += 1;
      if (!input.has("in") || !input.has("control")) {
        return;
      }
      const data = input.getData("in");
      output.sendDone({ out: data });
    });
    sin = fixtureSocket();
    scontrol = fixtureSocket();
    sout = fixtureSocket();
    c.inPorts.in.attach(sin);
    c.inPorts.control.attach(scontrol);
    c.outPorts.out.attach(sout);
    listen(sout, "ip", (ip) => {
      if (ip.type === "data") {
        received.push(ip.data);
      }
    });
  };

  it("control arrival with no buffered data does not fire", () => {
    build();
    scontrol.post(new noflo.IP("data", "go"));
    assert.equal(firings, 0);
    assert.deepEqual(received, []);
  });

  it("control arrival fires once when data is buffered", () => {
    build();
    sin.post(new noflo.IP("data", 42));
    assert.equal(firings, 1, "data arrival fires the process");
    scontrol.post(new noflo.IP("data", "go"));
    assert.equal(firings, 2, "control arrival fires the gated process");
    assert.deepEqual(received, [42]);
  });

  it("keeps the control IP buffered (non-consuming)", () => {
    build();
    sin.post(new noflo.IP("data", 42));
    scontrol.post(new noflo.IP("data", "go"));
    assert.equal(
      c.inPorts.ports.control.buffer.length,
      1,
      "control IP stays buffered",
    );
  });

  it("fires per scope for scoped data with an unscoped control", () => {
    build();
    c.inPorts.ports.in.options.scoped = true;
    c.inPorts.ports.control.options.scoped = false;
    const scopedIp = new noflo.IP("data", 42);
    scopedIp.scope = "scope-a";
    sin.post(scopedIp);
    scontrol.post(new noflo.IP("data", "go"));
    assert.deepEqual(received, [42]);
    assert.equal(
      c.inPorts.ports.control.buffer.length,
      1,
      "unscoped control stays buffered",
    );
  });

  it("a second control IP does not fire without pending data", () => {
    build();
    sin.post(new noflo.IP("data", 42));
    scontrol.post(new noflo.IP("data", "go"));
    scontrol.post(new noflo.IP("data", "go again"));
    // The first control consumed the buffered data; with no pending
    // non-control input the second control does not fire
    assert.deepEqual(received, [42]);
  });
});

describe("control-dependent firing patterns", () => {
  // The hang shape behind work document #36's collector bug: a component
  // whose activation needs both a data packet and a control value. The
  // control read itself is safe — control ports read non-consumingly — but
  // the ORDER of has/get decides whether the pattern can complete.
  it("a standing control value survives successive activations", () => {
    const c = new noflo.Component({
      inPorts: {
        in: { datatype: "int" },
        encoding: { datatype: "string", control: true },
      },
      outPorts: { out: { datatype: "string" } },
    });
    const received = [];
    c.process((input, output) => {
      if (!input.hasData("in") || !input.hasData("encoding")) {
        return;
      }
      const value = input.getData("in");
      output.sendDone({ out: `${value}:${input.getData("encoding")}` });
    });
    const sin = fixtureSocket();
    const scontrol = fixtureSocket();
    const sout = fixtureSocket();
    c.inPorts.in.attach(sin);
    c.inPorts.encoding.attach(scontrol);
    c.outPorts.out.attach(sout);
    listen(sout, "ip", (ip) => {
      if (ip.type === "data") {
        received.push(ip.data);
      }
    });

    scontrol.post(new noflo.IP("data", "utf-8"));
    sin.post(new noflo.IP("data", 1));
    sin.post(new noflo.IP("data", 2));

    assert.deepEqual(received, ["1:utf-8", "2:utf-8"]);
    assert.equal(
      c.inPorts.ports.encoding.buffer.length,
      1,
      "the control value stays buffered across activations",
    );
    assert.equal(c.load, 0, "no activation left pending");
  });

  it("consuming data before checking control loses the message and pends forever", () => {
    // The documented has/get-order footgun (the shutdown diagnostic spells
    // it out): new arrivals fire fresh contexts — an IP consumed by a
    // waiting activation never comes back, so a control-dependent pattern
    // must has-check the complete precondition set before any get.
    const c = new noflo.Component({
      inPorts: {
        in: { datatype: "int" },
        encoding: { datatype: "string", control: true },
      },
      outPorts: { out: { datatype: "string" } },
    });
    const received = [];
    c.process((input, output) => {
      // Wrong order: consume the data leg, then check the control
      if (!input.hasData("in")) {
        return;
      }
      const value = input.getData("in");
      if (!input.hasData("encoding")) {
        return;
      }
      output.sendDone({ out: `${value}:${input.getData("encoding")}` });
    });
    const sin = fixtureSocket();
    const scontrol = fixtureSocket();
    const sout = fixtureSocket();
    c.inPorts.in.attach(sin);
    c.inPorts.encoding.attach(scontrol);
    c.outPorts.out.attach(sout);
    listen(sout, "ip", (ip) => {
      if (ip.type === "data") {
        received.push(ip.data);
      }
    });

    sin.post(new noflo.IP("data", 1));
    assert.deepEqual(received, [], "nothing sent while control is missing");
    // The control arrival fires a fresh context — the consumed data IP is
    // gone from the buffer, so the pattern can never complete
    scontrol.post(new noflo.IP("data", "utf-8"));
    assert.deepEqual(received, [], "the consumed message never comes back");
    assert.equal(
      c.inPorts.ports.in.buffer.length,
      0,
      "the data IP was consumed by the waiting activation",
    );
    assert.equal(
      c.inPorts.ports.encoding.buffer.length,
      1,
      "the control value itself stays buffered (non-consuming read)",
    );
    assert.equal(c.load, 1, "the first activation stays pending forever");
  });
});

describe("control port streams", () => {
  let c = null;
  let sin = null;
  let scontrol = null;
  const outReceived = [];
  let sout = null;

  const build = () => {
    c = new noflo.Component({
      inPorts: {
        in: { datatype: "object", required: true },
        key: { datatype: "string", control: true, required: true },
      },
      outPorts: { out: { datatype: "all" } },
    });
    c.process((input, output) => {
      if (!input.hasData("in")) {
        return;
      }
      if (!input.hasStream("key")) {
        return;
      }
      const keys = input
        .getStream("key")
        .filter((ip) => ip.type === "data")
        .map((ip) => ip.data);
      const data = input.getData("in");
      output.sendDone({ out: keys.map((key) => data[key]) });
    });
    sin = fixtureSocket();
    scontrol = fixtureSocket();
    sout = fixtureSocket();
    c.inPorts.in.attach(sin);
    c.inPorts.key.attach(scontrol);
    c.outPorts.out.attach(sout);
    outReceived.length = 0;
    listen(sout, "ip", (ip) => {
      if (ip.type === "data") {
        outReceived.push(ip.data);
      }
    });
  };

  const postKeyStream = (values) => {
    scontrol.post(new noflo.IP("openBracket", "keys"));
    for (const value of values) {
      scontrol.post(new noflo.IP("data", value));
    }
    scontrol.post(new noflo.IP("closeBracket", "keys"));
  };

  it("should expose a grouped stream via getStream on a control port", (_t, done) => {
    build();
    postKeyStream(["a", "b"]);
    setTimeout(() => {
      sin.post(new noflo.IP("data", { a: 1, b: 2 }));
    }, 10);
    setTimeout(() => {
      assert.deepStrictEqual(outReceived, [[1, 2]]);
      done();
    }, 50);
  });

  it("should keep only the latest stream on a control port", (_t, done) => {
    build();
    postKeyStream(["a", "b"]);
    setTimeout(() => {
      postKeyStream(["c"]);
    }, 10);
    setTimeout(() => {
      sin.post(new noflo.IP("data", { c: 3 }));
    }, 30);
    setTimeout(() => {
      assert.deepStrictEqual(outReceived, [[3]]);
      done();
    }, 80);
  });
});

describe("control port has() consistency", () => {
  it("should not satisfy bare has() with buffered brackets alone, and keep later reads working", (_t, done) => {
    const c = new noflo.Component({
      inPorts: {
        foo: { datatype: "string" },
        bar: { datatype: "string", control: true },
      },
      outPorts: { baz: { datatype: "object" } },
      process(input, output) {
        if (!input.has("foo", "bar")) {
          return;
        }
        const [foo, bar] = input.getData("foo", "bar");
        output.sendDone({ baz: { foo, bar } });
      },
    });
    const sin1 = fixtureSocket();
    const sin2 = fixtureSocket();
    const sout = fixtureSocket();
    c.inPorts.foo.attach(sin1);
    c.inPorts.bar.attach(sin2);
    c.outPorts.baz.attach(sout);
    const received = [];
    listen(sout, "ip", (ip) => {
      if (ip.type === "data") {
        received.push(ip.data);
      }
    });

    sin1.post(new noflo.IP("data", "foo"));
    // Brackets alone on the control port must not complete the
    // preconditions, and must not break the later data read
    sin2.post(new noflo.IP("openBracket"));
    sin2.post(new noflo.IP("data", "bar"));
    sin2.post(new noflo.IP("closeBracket"));
    sin1.post(new noflo.IP("data", "boo"));

    setTimeout(() => {
      assert.deepStrictEqual(received, [
        { foo: "foo", bar: "bar" },
        // The control IP stays buffered (non-consuming), so the second
        // foo packet pairs with it again
        { foo: "boo", bar: "bar" },
      ]);
      done();
    }, 50);
  });
});

describe("activation contract guard", () => {
  it("surfaces an out-of-activation data send as a process error", async () => {
    const loader = new noflo.ComponentLoader({});
    loader.registerComponent("guard", "Late", () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.outPorts.add("error", { datatype: "object" });
      c.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        input.getData("in");
        // A void PROMISE resolution means "the process already sent" —
        // the bridge completes the activation on resolution. A data send
        // firing after that races drain-based closing
        Promise.resolve().then(() => {
          setTimeout(() => {
            output.send({ out: "late" });
          }, 5);
        });
        return Promise.resolve();
      });
      return c;
    });
    const instance = await loader.load("guard/Late");
    const errors = [];
    const errorSocket = noflo.internalSocket.createSocket();
    instance.outPorts.error.attach(errorSocket);
    errorSocket.addEventListener("ip", (/** @type {any} */ event) => {
      if (event.detail.type === "error") {
        errors.push(event.detail.data);
      }
    });
    const inSocket = noflo.internalSocket.createSocket();
    instance.inPorts.in.attach(inSocket);
    inSocket.post(new noflo.IP("data", "go"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(errors.length, 1);
    assert.match(
      /** @type {Error} */ (errors[0]).message,
      /send outside the activation contract/,
    );
  });

  it("does not fire for a compliant deferred send that holds the activation", async () => {
    const loader = new noflo.ComponentLoader({});
    loader.registerComponent("guard", "Held", () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        input.getData("in");
        // The compliant form: the promise return holds the activation
        // until the deferred send completes
        return new Promise((resolve) => {
          setTimeout(() => resolve({ out: "held" }), 5);
        });
      });
      return c;
    });
    const instance = await loader.load("guard/Held");
    const errors = [];
    instance.addEventListener("process-error", (/** @type {any} */ event) => {
      errors.push(event.detail?.error ?? event.detail);
    });
    const received = [];
    const out = noflo.internalSocket.createSocket();
    instance.outPorts.out.attach(out);
    out.addEventListener("ip", (/** @type {any} */ event) => {
      if (event.detail.type === "data") {
        received.push(event.detail.data);
      }
    });
    const inSocket = noflo.internalSocket.createSocket();
    instance.inPorts.in.attach(inSocket);
    inSocket.post(new noflo.IP("data", "go"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(received, ["held"]);
  });

  it("does not complete a read-then-decline activation: the leak persists", async () => {
    // The activation contract: reads activate the context, and an
    // activated synchronous return must complete. A handler that reads a
    // standing control value and then declines the data gate leaks the
    // activation — nothing consumed, nothing sent, nothing will ever
    // complete it. The engine diagnoses it (debug log naming the
    // component) and leaves the activation open rather than auto-closing:
    // auto-closing would break the legal deferred-completion patterns,
    // which consume data or send before their synchronous return. Peek
    // into buffered contents with has()/hasData()/hasStream() validators
    // before reading instead (work document #45 review follow-up)
    const loader = new noflo.ComponentLoader({});
    loader.registerComponent("guard", "ReadDecline", () => {
      const c = new noflo.Component();
      c.inPorts.add("config", { control: true, datatype: "object" });
      c.inPorts.add("in", { datatype: "all" });
      c.inPorts.add("gate", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        if (input.hasData("config")) {
          // The control standing read activates the context and
          // consumes nothing
          input.getData("config");
        }
        if (!input.hasData("gate")) {
          return;
        }
        const data = input.getData("gate");
        output.sendDone({ out: data });
      });
      return c;
    });
    const instance = await loader.load("guard/ReadDecline");
    const config = noflo.internalSocket.createSocket();
    instance.inPorts.config.attach(config);
    config.post(new noflo.IP("data", { mode: "test" }));
    const inSocket = noflo.internalSocket.createSocket();
    instance.inPorts.in.attach(inSocket);
    // The data arrival fires the process; the control read inside the
    // activation opens the context, and the gate's absence declines it —
    // activated, consumed nothing, sent nothing: the leak
    inSocket.post(new noflo.IP("data", "go"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The activation opened by the control read is still open
    assert.strictEqual(instance.load, 1);
  });

  it("consumes brackets at arrival on a framing-terminating port", async () => {
    // An explicitly-declared empty forwarding rule terminates framing on
    // the port: brackets are consumed at arrival — they never fire, never
    // buffer, and no output context is mirrored. Reading sees pure data
    // (work document #40 update #13)
    const loader = new noflo.ComponentLoader({});
    loader.registerComponent("frame", "Terminator", () => {
      const c = new noflo.Component();
      c.inPorts.add("msg", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      // Framing terminates here: the declaration, not an empty outcome of
      // the defaulting logic
      c.forwardBrackets = { msg: [] };
      c.firings = 0;
      c.process((input, output) => {
        if (!input.hasData("msg")) {
          return;
        }
        const data = input.getData("msg");
        c.firings += 1;
        output.sendDone({ out: data });
      });
      return c;
    });
    const instance = await loader.load("frame/Terminator");
    const received = [];
    const out = noflo.internalSocket.createSocket();
    instance.outPorts.out.attach(out);
    out.addEventListener("ip", (/** @type {any} */ event) => {
      if (event.detail.type === "data") {
        received.push(event.detail.data);
      }
    });
    const msg = noflo.internalSocket.createSocket();
    instance.inPorts.msg.attach(msg);
    msg.post(new noflo.IP("openBracket", "stream"));
    msg.post(new noflo.IP("data", "one"));
    msg.post(new noflo.IP("data", "two"));
    msg.post(new noflo.IP("closeBracket", "stream"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Only the data packets fired the process; the brackets never did and
    // never buffered
    assert.strictEqual(instance.firings, 2);
    assert.deepStrictEqual(received, ["one", "two"]);
    assert.deepStrictEqual(instance.inPorts.ports.msg.buffer, []);
  });

  it("lets the legal deferred-completion pattern complete normally", async () => {
    // A synchronous return that consumed data may complete later: the
    // activation holds until done(). The leak warning must not fire for
    // this shape — it consumed, so it can complete
    const loader = new noflo.ComponentLoader({});
    loader.registerComponent("guard", "Deferred", () => {
      const c = new noflo.Component();
      c.inPorts.add("in", { datatype: "all" });
      c.outPorts.add("out", { datatype: "all" });
      c.process((input, output) => {
        if (!input.hasData("in")) {
          return;
        }
        input.getData("in");
        setTimeout(() => {
          output.sendDone({ out: "deferred" });
        }, 5);
      });
      return c;
    });
    const instance = await loader.load("guard/Deferred");
    const received = [];
    const out = noflo.internalSocket.createSocket();
    instance.outPorts.out.attach(out);
    out.addEventListener("ip", (/** @type {any} */ event) => {
      if (event.detail.type === "data") {
        received.push(event.detail.data);
      }
    });
    const inSocket = noflo.internalSocket.createSocket();
    instance.inPorts.in.attach(inSocket);
    inSocket.post(new noflo.IP("data", "go"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepStrictEqual(received, ["deferred"]);
    assert.strictEqual(instance.load, 0);
  });
});
