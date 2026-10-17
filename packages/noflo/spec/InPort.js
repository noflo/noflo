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
  describe("with options stored in port", () => {
    it("should store all provided options in port, whether we expect it or not", () => {
      const options = {
        datatype: "string",
        schema: "example/Person",
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
  describe("with the retired 'type' option", () => {
    it("is ignored in favor of datatype and schema", () => {
      const p = new noflo.InPort({ type: "example/Person" });
      assert.strictEqual(p.getSchema(), null);
      assert.strictEqual(p.getDataType(), "all");
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


// The validator-factory contract (work document #47): ProcessInput
// exercises the happy paths through every firing-pattern spec; these pin
// the guard against old-style calls regressing into a bare makeValidate
// TypeError.
describe("InPort.has validator-factory contract", () => {
  const makePort = () => new noflo.InPort({ datatype: "all" });

  it("fails descriptively on an old-style two-arg call", () => {
    const port = makePort();
    assert.throws(
      () => port.has(null, () => true),
      /InPort\.has takes a validator factory/,
    );
  });

  it("fails descriptively when the factory is missing", () => {
    const port = makePort();
    assert.throws(
      () => port.has(null, null, /** @type {any} */ (undefined)),
      /InPort\.has takes a validator factory/,
    );
  });

  it("fails descriptively in hasStream when the factory is missing", () => {
    const port = makePort();
    assert.throws(
      () => port.hasStream(null, /** @type {any} */ (undefined)),
      /InPort\.hasStream takes a validator factory/,
    );
  });
});
