//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  StubComponent,
  StubNotImplementedError,
} from "../src/components/StubComponent.js";
import * as noflo from "../src/lib/NoFlo.js";
import {
  closeBracket,
  fixtureSocket,
  listen,
  listenData,
  openBracket,
  sendData,
  settle,
} from "./utils/events.js";
import { nativeGraph } from "./utils/nativeGraph.js";

/**
 * Build a stub with the given signature pieces and attach sockets to the
 * named inports. Returns the component and its input sockets.
 *
 * @param {Object<string, any>} options StubComponent options
 * @param {string[]} [inports] Inport names to attach sockets to
 * @returns {{ stub: StubComponent, sockets: Object<string, import("../src/lib/InternalSocket.js").InternalSocket> }}
 */
function wiredStub(options, inports = []) {
  const stub = new StubComponent(options);
  /** @type {Object<string, any>} */
  const sockets = {};
  for (const name of inports) {
    const socket = fixtureSocket();
    stub.inPorts.ports[name].attach(socket);
    sockets[name] = socket;
  }
  return { stub, sockets };
}

describe("StubComponent", () => {
  describe("construction", () => {
    it("declares the signature ports", () => {
      const stub = new StubComponent({
        name: "fs/ReadFile",
        description: "Reads a file",
        icon: "file",
        inPorts: {
          in: { datatype: "string", required: true },
          options: { datatype: "object", control: true },
        },
        outPorts: {
          out: { datatype: "string" },
          error: { datatype: "object" },
        },
      });
      assert.deepStrictEqual(Object.keys(stub.inPorts.ports), [
        "in",
        "options",
      ]);
      assert.deepStrictEqual(Object.keys(stub.outPorts.ports), [
        "out",
        "error",
      ]);
      assert.strictEqual(stub.inPorts.ports.in.getDataType(), "string");
      assert.strictEqual(stub.inPorts.ports.in.isRequired(), true);
      assert.strictEqual(stub.inPorts.ports.options.options.control, true);
      assert.strictEqual(stub.description, "Reads a file");
      assert.strictEqual(stub.icon, "file");
    });

    it("self-describes as a stub, not a subgraph", () => {
      const stub = new StubComponent({
        inPorts: { in: { datatype: "all" } },
      });
      assert.strictEqual(stub.isStub(), true);
      assert.strictEqual(stub.isSubgraph(), false);
      assert.strictEqual(stub.isReady(), true);
    });

    it("is a silent placeholder: no bracket forwarding, outports never sourced", () => {
      const stub = new StubComponent({
        inPorts: { in: { datatype: "all" } },
        outPorts: { out: { datatype: "all" } },
      });
      assert.strictEqual(stub.isForwardingInport("in"), false);
      assert.deepStrictEqual(stub.forwardBrackets, {});
      // The outport stays declared: graphs validate, edges attach
      assert.ok(stub.outPorts.ports.out);
    });

    it("rejects an unknown packet policy", () => {
      assert.throws(
        () =>
          new StubComponent({
            inPorts: { in: { datatype: "all" } },
            onPacket: "explode",
          }),
        /Unknown StubComponent packet policy/,
      );
    });

    it("rejects a process function: the placeholder behavior is fixed", () => {
      assert.throws(
        () =>
          new StubComponent({
            inPorts: { in: { datatype: "all" } },
            process: () => {},
          }),
        /cannot take a process function/,
      );
    });

    it("rejects the throw policy with zero triggering inports", () => {
      // A control-only signature could never fire, so the error path
      // would be dead code
      assert.throws(
        () =>
          new StubComponent({
            name: "config/Only",
            inPorts: { options: { datatype: "object", control: true } },
          }),
        /declares no triggering inports/,
      );
      assert.throws(
        () => new StubComponent({ name: "empty/None" }),
        /declares no triggering inports/,
      );
    });

    it("accepts a control-only signature under the drop policy", () => {
      const stub = new StubComponent({
        name: "config/Only",
        inPorts: { options: { datatype: "object", control: true } },
        onPacket: "drop",
      });
      assert.strictEqual(stub.packetPolicy, "drop");
    });
  });

  describe("fromSignature", () => {
    it("maps the full signature shape onto port options", () => {
      const stub = StubComponent.fromSignature("math/Add", {
        description: "Adds numbers",
        icon: "plus",
        inports: [
          {
            name: "augend",
            datatype: "number",
            addressable: false,
            description: "First addend",
            required: true,
          },
          { name: "options", datatype: "object", control: true },
        ],
        outports: [{ name: "sum", datatype: "number", required: true }],
      });
      assert.strictEqual(stub.stubName, "math/Add");
      assert.strictEqual(stub.description, "Adds numbers");
      assert.strictEqual(stub.icon, "plus");
      const augend = stub.inPorts.ports.augend;
      assert.strictEqual(augend.getDataType(), "number");
      assert.strictEqual(augend.isRequired(), true);
      assert.strictEqual(augend.isAddressable(), false);
      assert.strictEqual(augend.getDescription(), "First addend");
      assert.strictEqual(stub.inPorts.ports.options.options.control, true);
      const sum = stub.outPorts.ports.sum;
      assert.strictEqual(sum.getDataType(), "number");
      assert.strictEqual(sum.isRequired(), true);
    });

    it("maps the narrower on-disk sidecar shape with defaults", () => {
      const stub = StubComponent.fromSignature("project/Widget", {
        name: "Widget",
        description: "A widget",
        icon: "gear",
        inports: [
          { name: "in", type: "string" },
          { name: "slot", addressable: true },
        ],
        outports: [{ name: "out", type: "all" }],
      });
      // `type` maps onto datatype; missing datatypes default to all;
      // missing flags default to absent/false
      assert.strictEqual(stub.inPorts.ports.in.getDataType(), "string");
      assert.strictEqual(stub.inPorts.ports.slot.getDataType(), "all");
      assert.strictEqual(stub.inPorts.ports.slot.isAddressable(), true);
      assert.strictEqual(stub.inPorts.ports.in.isRequired(), false);
      assert.strictEqual(stub.outPorts.ports.out.getDataType(), "all");
    });

    it("validates the signature shape loudly", () => {
      assert.throws(
        () => StubComponent.fromSignature("bad/None", null),
        /must be an object/,
      );
      assert.throws(
        () => StubComponent.fromSignature("bad/Ports", { inports: "in" }),
        /must be an array/,
      );
      assert.throws(
        () =>
          StubComponent.fromSignature("bad/Name", {
            inports: [{ datatype: "all" }],
          }),
        /missing a port name/,
      );
      assert.throws(
        () =>
          StubComponent.fromSignature("bad/Dup", {
            inports: [{ name: "in" }, { name: "in" }],
          }),
        /twice/,
      );
      assert.throws(
        () =>
          StubComponent.fromSignature("bad/Control", {
            outports: [{ name: "out", control: true }],
          }),
        /control is an inport flag/,
      );
      assert.throws(
        () =>
          StubComponent.fromSignature("bad/Flag", {
            inports: [{ name: "in", addressable: "yes" }],
          }),
        /non-boolean addressable/,
      );
      assert.throws(
        () =>
          StubComponent.fromSignature("bad/Datatype", {
            inports: [{ name: "in", datatype: 42 }],
          }),
        /non-string datatype/,
      );
    });
  });

  describe("packet policy: throw (default)", () => {
    let stub = null;
    let sockets = null;

    beforeEach(() => {
      ({ stub, sockets } = wiredStub(
        {
          name: "dummy/Sink",
          inPorts: { in: { datatype: "all" } },
          outPorts: {
            out: { datatype: "all" },
            error: { datatype: "object" },
          },
        },
        ["in"],
      ));
      // The declared error outport receives the failure; unconnected, the
      // error escalates instead
      stub.outPorts.ports.error.required = true;
    });

    it("raises StubNotImplementedError for a data packet", async () => {
      const errorPort = fixtureSocket();
      stub.outPorts.ports.error.attach(errorPort);
      const received = [];
      listen(errorPort, "ip", (ip) => {
        if (ip.type === "data") {
          received.push(ip.data);
        }
      });
      stub.componentName = "dummy/Sink";
      sendData(sockets.in, "hello");
      await settle();
      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].name, "StubNotImplementedError");
      assert.strictEqual(received[0].componentName, "dummy/Sink");
      assert.match(received[0].message, /not implemented/);
      assert.match(received[0].message, /'in'/);
      assert.ok(received[0] instanceof StubNotImplementedError);
    });

    it("falls back to the declared name before the network names the instance", async () => {
      const errorPort = fixtureSocket();
      stub.outPorts.ports.error.attach(errorPort);
      const received = [];
      listen(errorPort, "ip", (ip) => {
        if (ip.type === "data") {
          received.push(ip.data);
        }
      });
      sendData(sockets.in, "hello");
      await settle();
      assert.strictEqual(received[0].componentName, "dummy/Sink");
    });

    it("absorbs a bracket-heavy stream without data silently", async () => {
      const errorPort = fixtureSocket();
      stub.outPorts.ports.error.attach(errorPort);
      const received = [];
      listen(errorPort, "ip", (ip) => {
        received.push(ip);
      });
      openBracket(sockets.in, "group");
      openBracket(sockets.in, "inner");
      closeBracket(sockets.in);
      closeBracket(sockets.in);
      await settle();
      // Brackets are consumed, never emitted, and never classified as
      // unimplemented: no data arrived
      assert.deepStrictEqual(received, []);
      assert.strictEqual(stub.inPorts.ports.in.countBuffered(), 0);
    });

    it("never sources the declared outports", async () => {
      const outPort = fixtureSocket();
      stub.outPorts.ports.out.attach(outPort);
      const outData = [];
      listenData(outPort, (data) => outData.push(data));
      const errorPort = fixtureSocket();
      stub.outPorts.ports.error.attach(errorPort);
      const errorData = [];
      listenData(errorPort, (data) => errorData.push(data));
      sendData(sockets.in, "hello");
      await settle();
      assert.deepStrictEqual(outData, []);
      assert.strictEqual(errorData.length, 1);
    });
  });

  describe("packet policy: drop", () => {
    it("consumes and discards data without failing", async () => {
      const { stub, sockets } = wiredStub(
        {
          name: "dummy/Sink",
          inPorts: { in: { datatype: "all" } },
          outPorts: { out: { datatype: "all" } },
          onPacket: "drop",
        },
        ["in"],
      );
      const outPort = fixtureSocket();
      stub.outPorts.ports.out.attach(outPort);
      const outData = [];
      listenData(outPort, (data) => outData.push(data));
      sendData(sockets.in, "hello");
      sendData(sockets.in, "world");
      await settle();
      assert.deepStrictEqual(outData, []);
      assert.strictEqual(stub.inPorts.ports.in.countBuffered(), 0);
    });

    it("absorbs bracketed streams whole", async () => {
      const { stub, sockets } = wiredStub(
        {
          inPorts: { in: { datatype: "all" } },
          onPacket: "drop",
        },
        ["in"],
      );
      openBracket(sockets.in, "group");
      sendData(sockets.in, "a");
      sendData(sockets.in, "b");
      closeBracket(sockets.in);
      await settle();
      assert.strictEqual(stub.inPorts.ports.in.countBuffered(), 0);
    });
  });

  describe("control inports", () => {
    it("never fire the process, so configuring never throws", async () => {
      const { stub, sockets } = wiredStub(
        {
          name: "dummy/Configured",
          inPorts: {
            in: { datatype: "all" },
            options: { datatype: "object", control: true },
          },
          outPorts: { error: { datatype: "object", required: true } },
        },
        ["in", "options"],
      );
      const errors = [];
      const errorPort = fixtureSocket();
      stub.outPorts.ports.error.attach(errorPort);
      listen(errorPort, "ip", (ip) => {
        if (ip.type === "data") {
          errors.push(ip.data);
        }
      });
      // Configuring the unimplemented component: standing state, not work
      sendData(sockets.options, { mode: "fast" });
      await settle();
      assert.deepStrictEqual(errors, []);
      // The control value stays buffered as standing state (control
      // buffers are excluded from countBuffered by design)
      assert.strictEqual(
        stub.inPorts.ports.options.getBuffer(null, null).length,
        1,
      );
      // Data still fails per policy
      sendData(sockets.in, "hello");
      await settle();
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].name, "StubNotImplementedError");
    });
  });

  describe("in a network", () => {
    it("runs top-down: the placeholder loads, wires, and fails loudly on data", async () => {
      const stubDefinition = {
        getComponent: () =>
          new StubComponent({
            name: "dummy/NoOp",
            inPorts: { in: { datatype: "all" } },
            outPorts: { out: { datatype: "all" } },
          }),
      };
      const loader = new noflo.ComponentLoader({
        registry: {
          list: () => ({ "dummy/NoOp": stubDefinition }),
          get: async () => undefined,
        },
      });
      const graph = nativeGraph("stubs").addNode("Sink", "dummy/NoOp");
      const network = new noflo.Network(graph, {
        componentLoader: loader,
        delay: true,
      });
      await network.connect();
      const instance = network.processes.Sink.component;
      assert.strictEqual(instance.isStub(), true);
      assert.strictEqual(instance.componentName, "dummy/NoOp");

      const processErrors = [];
      listen(network, "process-error", (event) => {
        processErrors.push(event.error ?? event);
      });
      // An initial on the stub's inport is data: the placeholder runs
      // top-down until the first real packet exposes the missing
      // implementation
      network.addInitial({
        from: { data: "hello" },
        to: { node: "Sink", port: "in" },
      });
      await network.start();
      await settle();
      assert.strictEqual(processErrors.length, 1);
      assert.strictEqual(processErrors[0].name, "StubNotImplementedError");
      await network.stop();
    });
  });
});
