// The 2.x naming policy (work document #15): port names are
// case-significant and author casing is preserved end to end — DSL, FBP
// JSON, network ports. `out` and `OUT` are distinct ports. Legacy
// documents carrying `caseSensitive: false` (the 1.x interchange
// default) import with port names normalized to lowercase.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as noflo from "../src/lib/NoFlo.js";

const makeMixedCaseComponent = () => {
  const c = new noflo.Component({
    inPorts: {
      inString: { datatype: "string", required: true },
    },
    outPorts: {
      outString: { datatype: "string" },
      OUT: { datatype: "string", description: "Distinct from outString" },
    },
  });
  c.process((input, output) => {
    if (!input.hasData("inString")) {
      return;
    }
    const value = input.getData("inString");
    output.sendDone({ outString: `outString:${value}` });
  });
  return c;
};

describe("case-sensitive port naming", () => {
  it("preserves mixed-case port names on a component", () => {
    const c = makeMixedCaseComponent();
    assert.deepStrictEqual(Object.keys(c.inPorts.ports).sort(), ["inString"]);
    assert.deepStrictEqual(Object.keys(c.outPorts.ports).sort(), [
      "OUT",
      "outString",
    ]);
  });

  it("treats ports differing only by case as distinct", () => {
    const c = makeMixedCaseComponent();
    assert.notStrictEqual(c.outPorts.ports.OUT, undefined);
    assert.notStrictEqual(c.outPorts.ports.outString, undefined);
    assert.notStrictEqual(c.outPorts.ports.outString, c.outPorts.ports.OUT);
  });

  it("wires and fires mixed-case ports end to end", async () => {
    const component = makeMixedCaseComponent();
    const received = [];
    const out = noflo.internalSocket.createSocket();
    component.outPorts.outString.attach(out);
    out.addEventListener("ip", (event) => {
      if (event.detail.type === "data") {
        received.push(event.detail.data);
      }
    });
    const inSocket = noflo.internalSocket.createSocket();
    component.inPorts.inString.attach(inSocket);
    inSocket.post(new noflo.IP("data", "hello"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepStrictEqual(received, ["outString:hello"]);
    assert.strictEqual(component.load, 0);
  });

  it("fails loudly when a reference's case does not match the declared port", async () => {
    const graph = noflo.importFbpJson({
      caseSensitive: true,
      processes: { n: { component: "Mixed" } },
      connections: [
        {
          src: { process: "n", port: "outString" },
          tgt: { process: "n", port: "instring" },
        },
      ],
    });
    const network = await noflo.createNetwork(graph, { delay: true });
    network.loader.registerComponent("", "Mixed", makeMixedCaseComponent);
    await assert.rejects(() => network.connect(), /instring/);
  });

  it("normalizes port names when a legacy document declares caseSensitive: false", () => {
    // A 1.x-era graph referencing lowercase-declared ports with mixed
    // case: the import normalizes so the references resolve
    const graph = noflo.importFbpJson({
      caseSensitive: false,
      processes: { n: { component: "x" } },
      connections: [
        {
          src: { process: "n", port: "OutString" },
          tgt: { process: "n", port: "InString" },
        },
      ],
    });
    const edge = graph.edges()[0];
    assert.equal(edge.from.port, "outstring");
    assert.equal(edge.to.port, "instring");
  });

  it("preserves casing when the legacy document is case-sensitive", () => {
    const graph = noflo.importFbpJson({
      caseSensitive: true,
      processes: { n: { component: "x" } },
      connections: [
        {
          src: { process: "n", port: "OutString" },
          tgt: { process: "n", port: "InString" },
        },
      ],
    });
    const edge = graph.edges()[0];
    assert.equal(edge.from.port, "OutString");
    assert.equal(edge.to.port, "InString");
  });
});
