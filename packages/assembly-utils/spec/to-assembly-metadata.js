import assert from "node:assert/strict";
import { describe, it } from "node:test";
import noflo from "@noflo/noflo";
import { getComponent } from "../components/ToAssembly.js";

/**
 * Drive a ToAssembly instance with the given node metadata and value,
 * returning the emitted payloads.
 * @param {Record<string, unknown>} metadata
 * @param {unknown} value
 * @returns {Promise<Array<any>>}
 */
async function run(metadata, value) {
  const c = getComponent(metadata);
  const received = [];
  const out = new noflo.internalSocket.InternalSocket();
  c.outPorts.ports.out.attach(out);
  out.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      received.push(event.detail.data);
    }
  });
  const inSocket = new noflo.internalSocket.InternalSocket();
  c.inPorts.ports.in.attach(inSocket);
  inSocket.post(new noflo.IP("data", value));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await c.shutdown();
  return received;
}

describe("ToAssembly field option", () => {
  // The envelope creation goes stock: an application turning bare values
  // into assembly messages picks the message shape via the
  // `assembly.field` node metadata, the same convention the generated
  // adapter graphs use for ExtractField
  it("wraps the value under the data field by default", async () => {
    const received = await run({}, "/x/index.html");
    assert.deepEqual(received, [{ errors: [], data: "/x/index.html" }]);
  });

  it("wraps the value under the configured field", async () => {
    const received = await run({ "assembly.field": "path" }, "/x/index.html");
    assert.deepEqual(received, [{ errors: [], path: "/x/index.html" }]);
  });
});
