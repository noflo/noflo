import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import * as noflo from "../src/lib/NoFlo.js";
import { listen } from "./utils/events.js";

describe("Inport Port", () => {
  describe("with default options", () => {
    const p = new noflo.InPort();
    it('should be of datatype "all"', () => {
      assert.equal(p.getDataType(), "all");
    });
    it("should not be required", () => {
      assert.equal(p.isRequired(), false);
    });
    it("should not be addressable", () => {
      assert.equal(p.isAddressable(), false);
    });
    it("should not be buffered", () => assert.equal(p.isBuffered(), false));
  });
  describe("with custom type", () => {
    const p = new noflo.InPort({
      datatype: "string",
      schema: "text/url",
    });
    it("should retain the type", () => {
      assert.equal(p.getDataType(), "string");
      assert.equal(p.getSchema(), "text/url");
    });
  });
  describe("without attached sockets", () => {
    const p = new noflo.InPort();
    it("should not be attached", () => {
      assert.equal(p.isAttached(), false);
      assert.deepEqual(p.listAttached(), []);
    });
    it("should allow attaching", () => {
      assert.equal(p.canAttach(), true);
    });
    it("should not be connected initially", () => {
      assert.equal(p.isConnected(), false);
    });
    it("should not contain a socket initially", () => {
      assert.strictEqual(p.sockets.length, 0);
    });
  });
  describe("with processing function called with port as context", () => {
    it("should deliver the packet to the listener", (_t, done) => {
      const s = new noflo.internalSocket.InternalSocket();
      const p = new noflo.InPort();
      listen(p, "ip", (ip) => {
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, "some-data");
        done();
      });
      p.attach(s);
      s.send("some-data");
    });
  });
  describe("with default value", () => {
    let p = null;
    let s = null;
    beforeEach(() => {
      p = new noflo.InPort({ default: "default-value" });
      s = new noflo.internalSocket.InternalSocket();
      p.attach(s);
    });
    it("should send the default value as a packet, though on next tick after initialization", (_t, done) => {
      listen(p, "ip", (ip) => {
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, "default-value");
        done();
      });
      s.send();
    });
    it("should send the default value before IIP", (_t, done) => {
      const received = ["default-value", "some-iip"];
      listen(p, "ip", (ip) => {
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, received.shift());
        if (received.length === 0) {
          done();
        }
      });
      setTimeout(() => {
        s.send();
        s.send("some-iip");
      }, 0);
    });
  });
  describe("with options stored in port", () => {
    it("should store all provided options in port, whether we expect it or not", () => {
      const options = {
        datatype: "string",
        type: "http://schema.org/Person",
        description: "Person",
        required: true,
        weNeverExpectThis: "butWeStoreItAnyway",
      };
      const p = new noflo.InPort(options);
      for (const name in options) {
        if (Object.hasOwn(options, name)) {
          const option = options[name];
          assert.strictEqual(p.options[name], option);
        }
      }
    });
  });
  describe("with data type information", () => {
    const right = "all string number int object array".split(" ");
    const wrong = "not valie data types".split(" ");
    const f = (datatype) => new noflo.InPort({ datatype });
    right.forEach((r) => {
      it(`should accept a '${r}' data type`, () => {
        assert.doesNotThrow(() => f(r));
      });
    });
    wrong.forEach((w) => {
      it(`should NOT accept a '${w}' data type`, () => {
        assert.throws(() => f(w));
      });
    });
  });
  describe("with TYPE (i.e. ontology) information", () => {
    const f = (type) => new noflo.InPort({ type });
    it("should be a URL or MIME", () => {
      assert.doesNotThrow(() => f("http://schema.org/Person"));
      assert.doesNotThrow(() => f("text/javascript"));
      assert.throws(() => f("neither-a-url-nor-mime"));
    });
  });
  describe("with accepted enumerated values", () => {
    it("should accept certain values", (_t, done) => {
      const p = new noflo.InPort({ values: "noflo is awesome".split(" ") });
      const s = new noflo.internalSocket.InternalSocket();
      p.attach(s);
      listen(p, "ip", (ip) => {
        assert.strictEqual(ip.type, "data");
        assert.strictEqual(ip.data, "awesome");
        done();
      });
      s.send("awesome");
    });
    it("should throw an error if value is not accepted", () => {
      const p = new noflo.InPort({ values: "noflo is awesome".split(" ") });
      const s = new noflo.internalSocket.InternalSocket();
      p.attach(s);
      listen(p, "ip", (ip) => {
        if (ip.type !== "data") {
          return;
        }
        // Fail the test, we shouldn't have received anything
        assert.fail("Received an unexpected data packet");
      });
      assert.throws(() => s.send("terrific"));
    });
  });
  describe("with processing shorthand", () => {
    it("should also accept metadata (i.e. options) when provided", (_t, done) => {
      const s = new noflo.internalSocket.InternalSocket();
      const ps = {
        outPorts: new noflo.OutPorts({ out: new noflo.OutPort() }),
        inPorts: new noflo.InPorts(),
      };
      ps.inPorts.add("in", {
        datatype: "string",
        required: true,
      });
      listen(ps.inPorts.in, "ip", (ip) => {
        if (ip.type !== "data") {
          return;
        }
        assert.strictEqual(ip.data, "some-data");
        done();
      });
      ps.inPorts.in.attach(s);
      assert.deepEqual(ps.inPorts.in.listAttached(), [0]);
      s.send("some-data");
      s.disconnect();
    });
    it("should stamp an IP object with the port's datatype", (_t, done) => {
      const p = new noflo.InPort({ datatype: "string" });
      listen(p, "ip", (data) => {
        assert.strictEqual(typeof data, "object");
        assert.strictEqual(data.type, "data");
        assert.strictEqual(data.data, "Hello");
        assert.strictEqual(data.datatype, "string");
        done();
      });
      p.handleIP(new noflo.IP("data", "Hello"));
    });
    it("should keep an IP object's datatype as-is if already set", (_t, done) => {
      const p = new noflo.InPort({ datatype: "string" });
      listen(p, "ip", (data) => {
        assert.strictEqual(typeof data, "object");
        assert.strictEqual(data.type, "data");
        assert.strictEqual(data.data, 123);
        assert.strictEqual(data.datatype, "integer");
        done();
      });
      p.handleIP(new noflo.IP("data", 123, { datatype: "integer" }));
    });
    it("should stamp an IP object with the port's schema", (_t, done) => {
      const p = new noflo.InPort({
        datatype: "string",
        schema: "text/markdown",
      });
      listen(p, "ip", (data) => {
        assert.strictEqual(typeof data, "object");
        assert.strictEqual(data.type, "data");
        assert.strictEqual(data.data, "Hello");
        assert.strictEqual(data.datatype, "string");
        assert.strictEqual(data.schema, "text/markdown");
        done();
      });
      p.handleIP(new noflo.IP("data", "Hello"));
    });
    it("should keep an IP object's schema as-is if already set", (_t, done) => {
      const p = new noflo.InPort({
        datatype: "string",
        schema: "text/markdown",
      });
      listen(p, "ip", (data) => {
        assert.strictEqual(typeof data, "object");
        assert.strictEqual(data.type, "data");
        assert.strictEqual(data.data, "Hello");
        assert.strictEqual(data.datatype, "string");
        assert.strictEqual(data.schema, "text/plain");
        done();
      });
      p.handleIP(
        new noflo.IP("data", "Hello", {
          datatype: "string",
          schema: "text/plain",
        }),
      );
    });
  });
});
