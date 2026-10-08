/**
 * (c) 2021-2026 Henri Bergius
 * @file browser/main.js
 * @description End-to-end no-build browser flow for work document #18,
 *   running the static-registry pattern (#16/#6) entirely in the browser:
 *
 *   1. graph construction over the native `@noflo/graph` model
 *   2. network start against a ComponentLoader backed by the static
 *      registry (components resolved via lazy `import()` of ESM URLs)
 *   3. packet flow: an IIP enters the graph, flows through two Repeat
 *      components, and is captured from the process outport
 *   4. live-editing: a new component is registered on the registry at
 *      runtime; the loader picks it up via the `change` event and the
 *      component runs in a second network
 *   5. network stop
 *
 *   Progress is written to `window.__fixtureResult` (and the #status
 *   element) for the browser CI job to assert on. No build step, no
 *   bundler — this file is served as-is.
 */

import * as noflo from "@noflo/noflo";
import { createBrowserRegistry } from "./registry.js";

const statusElement = document.getElementById("status");
/** @type {{ ok: boolean, steps: { name: string, detail?: any }[], error?: string }} */
// @ts-expect-error - the fixture result is the page's output contract
const result = (window.__fixtureResult = { ok: true, steps: [] });

/**
 * Record a completed step and show progress.
 *
 * @param {string} name
 * @param {any} [detail]
 * @returns {void}
 */
function step(name, detail) {
  result.steps.push(detail === undefined ? { name } : { name, detail });
  statusElement.textContent = `${result.steps.length} steps done: ${result.steps
    .map((s) => s.name)
    .join(", ")}`;
}

/**
 * Attach an internal socket to a process outport and resolve with the
 * first data IP payload.
 *
 * @param {any} network
 * @param {string} nodeName
 * @param {string} portName
 * @returns {Promise<any>}
 */
function captureNextData(network, nodeName, portName) {
  return new Promise((resolve, reject) => {
    const process = network.processes[nodeName];
    if (!process?.component?.outPorts?.ports[portName]) {
      reject(new Error(`No outport ${portName} on process ${nodeName}`));
      return;
    }
    const socket = noflo.internalSocket.createSocket();
    socket.addEventListener("ip", (/** @type {any} */ event) => {
      if (event.detail.type === "data") {
        resolve(event.detail.data);
      }
    });
    socket.addEventListener("error", (/** @type {any} */ event) => {
      reject(event.detail?.error ?? event.detail);
    });
    process.component.outPorts.ports[portName].attach(socket);
  });
}

/**
 * Send a data IP into a process inport.
 *
 * @param {any} network
 * @param {string} nodeName
 * @param {string} portName
 * @param {any} data
 * @returns {void}
 */
function sendData(network, nodeName, portName, data) {
  const process = network.processes[nodeName];
  const socket = noflo.internalSocket.createSocket();
  process.component.inPorts.ports[portName].attach(socket);
  socket.send(data);
  socket.disconnect();
}

/**
 * Run a single-node graph: IIP data flows through the node's process
 * function and is captured from its outport.
 *
 * @param {any} loader
 * @param {string} componentName
 * @param {string} nodeName
 * @param {any} data
 * @returns {Promise<any>} The captured output value
 */
async function runOneNodeGraph(loader, componentName, nodeName, data) {
  const graph = new noflo.GraphModel({ name: nodeName });
  graph.addNode({ entity_id: nodeName, component: componentName });
  graph.addIIP({ data, to: { node: nodeName, port: "in" } });

  const network = await noflo.createNetwork(graph, {
    componentLoader: loader,
    delay: true,
  });
  await network.connect();
  const captured = captureNextData(network, nodeName, "out");
  await network.start();
  const output = await captured;
  await network.stop();
  return output;
}

async function main() {
  const registry = createBrowserRegistry();
  registry.register("fixture/Repeat", "./components/Repeat.js");
  const loader = new noflo.ComponentLoader({ registry });
  step("registry and loader created");

  // ### 1-3: graph construction, network start, packet flow
  const graph = new noflo.GraphModel({ name: "browser-fixture" });
  graph.addNode({ entity_id: "repeat1", component: "fixture/Repeat" });
  graph.addNode({ entity_id: "repeat2", component: "fixture/Repeat" });
  graph.addEdge({
    from: { node: "repeat1", port: "out" },
    to: { node: "repeat2", port: "in" },
  });
  graph.addIIP({ data: "Hello browser", to: { node: "repeat1", port: "in" } });
  step("graph built", { nodes: 2, edges: 1, iips: 1 });

  const network = await noflo.createNetwork(graph, {
    componentLoader: loader,
    delay: true,
  });
  await network.connect();
  step("network connected", { processes: Object.keys(network.processes) });

  const captured = captureNextData(network, "repeat2", "out");
  await network.start();
  step("network started");

  const output = await captured;
  if (output !== "Hello browser") {
    throw new Error(`Expected echoed IIP, got ${JSON.stringify(output)}`);
  }
  step("packet flowed", { output });

  // ### 4: live-editing — register a new component at runtime. The loader
  // subscribes to registry `change` events at construction, so the cache
  // refreshes without any manual reload call.
  registry.register("fixture/Uppercase", "./components/Uppercase.js");
  const uppercase = await loader.load("fixture/Uppercase");
  if (!uppercase) {
    throw new Error("Live-registered component was not loadable");
  }
  const uppercaseOutput = await runOneNodeGraph(
    loader,
    "fixture/Uppercase",
    "upper",
    "noflo",
  );
  if (uppercaseOutput !== "NOFLO") {
    throw new Error(
      `Expected uppercased output, got ${JSON.stringify(uppercaseOutput)}`,
    );
  }
  step("live-registered component ran", { output: uppercaseOutput });

  // ### 5: network stop
  await network.stop();
  step("network stopped");

  result.ok = true;
  statusElement.textContent = `fixture complete: ${result.steps
    .map((s) => s.name)
    .join(" → ")}`;
}

main().catch((/** @type {Error} */ error) => {
  result.ok = false;
  result.error = String(error?.stack ?? error);
  statusElement.textContent = `fixture failed: ${error?.message ?? error}`;
});
