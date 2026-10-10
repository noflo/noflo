/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file network module
 * @description Deterministic in-process execution of fbp-spec test cases.
 *
 *   Suites without an explicit fixture run against their topic component,
 *   instantiated directly (no fbp-protocol, no network overhead). Suites
 *   with an explicit `fixture` run against a real NoFlo network built from
 *   the fixture graph; test inputs and expectations address the fixture's
 *   exported inports and outports.
 *
 *   Sequence semantics follow fbp-spec's runner: when `inputs` and `expect`
 *   are arrays they are zipped pairwise and executed in series — send
 *   `inputs[i]`, wait for the data referenced by `expect[i]` on each
 *   expected port, evaluate, then proceed. This is what makes testing
 *   stateful components possible.
 *
 *   As in fbp-spec, a data packet arriving on a port named `error` fails
 *   the case, unless the case expects data on that port.
 */
/* @ts-self-types="./network.d.ts" */

import * as noflo from "@noflo/noflo";
import { evaluateExpectStep } from "./assertions.js";
import { resolveFixtureGraph } from "./fixture.js";

/**
 * Wait for a condition, racing against a timeout deadline.
 *
 * @param {() => boolean} condition
 * @param {number} timeoutMs
 * @param {string} description - For the timeout error message
 * @returns {Promise<void>}
 */
function waitFor(condition, timeoutMs, description) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (/** @type {Error | null} */ err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poller);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(
      () => {
        finish(
          new Error(`fbp-spec: Timeout after ${timeoutMs}ms ${description}`),
        );
      },
      Math.max(timeoutMs, 1),
    );
    const poller = setInterval(() => {
      if (condition()) finish(null);
    }, 5);
  });
}

/**
 * Normalize a testcase into a pairwise input/expect sequence.
 *
 * @param {Record<string, any>} testCase - The fbp-spec testcase
 * @returns {{ inputs: Record<string, any>[], expects: (Record<string, any> | undefined)[] }}
 */
function normalizeSequence(testCase) {
  const inputs = Array.isArray(testCase.inputs)
    ? testCase.inputs
    : [testCase.inputs];
  const expects = Array.isArray(testCase.expect)
    ? testCase.expect
    : [testCase.expect];
  if (inputs.length !== expects.length) {
    throw new Error(
      `fbp-spec: Mismatch between number of inputs (${inputs.length}) and expect (${expects.length})`,
    );
  }
  return { inputs, expects };
}

/**
 * Shared per-step execution loop. For each step: send the inputs, wait for
 * the expected data (or a process error) within the case deadline, then
 * evaluate the expectations against the received data.
 *
 * @param {{ inputs: Record<string, any>[], expects: (Record<string, any> | undefined)[] }} sequence
 * @param {{
 *   send: (stepInputs: Record<string, any>) => void,
 *   received: () => Record<string, any>,
 *   hasError: () => Error | null,
 *   settled: () => boolean,
 *   expect: (ports: string[]) => void,
 *   timeout: number,
 * }} handlers
 */
async function runSequence(sequence, handlers) {
  const caseDeadline = Date.now() + handlers.timeout;
  for (let i = 0; i < sequence.inputs.length; i += 1) {
    const stepInputs = sequence.inputs[i] || {};
    const expectStep = sequence.expects[i];
    const expectedPorts = Object.keys(expectStep || {});
    handlers.expect(expectedPorts);

    handlers.send(stepInputs);

    const remaining = caseDeadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        `fbp-spec: Timeout after ${handlers.timeout}ms waiting for step ${i + 1}`,
      );
    }
    const description =
      expectedPorts.length > 0
        ? `waiting for data on port(s) ${expectedPorts.join(", ")} (step ${i + 1})`
        : `waiting for component to settle (step ${i + 1})`;

    // The condition checks pending errors first, so component errors
    // surface as rejections rather than waiting for the timeout.
    await waitFor(
      () =>
        handlers.hasError() !== null ||
        (expectedPorts.length > 0
          ? expectedPorts.every((portName) => portName in handlers.received())
          : handlers.settled()),
      remaining,
      description,
    );

    const error = handlers.hasError();
    if (error) throw error;
    evaluateExpectStep(expectStep, handlers.received());
  }
}

/**
 * Execute one test case against the suite's topic component.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader - ComponentLoader to load the topic from
 * @param {string} topic - Component name under test
 * @param {Record<string, any>} testCase - The fbp-spec testcase
 * @param {number} timeout - Case timeout in ms
 * @returns {Promise<void>}
 */
async function executeComponentTestCase(loader, topic, testCase, timeout) {
  const component = await loader.load(topic);
  if (!component.inPorts || !component.outPorts) {
    throw new Error(`Component '${topic}' has no ports`);
  }

  /** Data received during the current sequence step, per port */
  let stepReceived = /** @type {Record<string, any>} */ ({});
  /** Set when a component error fires; rejects the pending wait */
  let pendingError = /** @type {Error | null} */ (null);
  /** Ports expected by the current step; guards the `error` port check */
  let expectedPorts = /** @type {string[]} */ ([]);

  /**
   * Record a data packet, applying the fbp-spec `error` port rule: a data
   * packet on port `error` fails the case when that port is not expected.
   *
   * @param {string} portName
   * @param {any} data
   * @returns {void}
   */
  const receiveData = (portName, data) => {
    if (portName === "error" && !expectedPorts.includes("error")) {
      pendingError = new Error(
        "fbp-spec: unexpected error packet on port 'error'",
      );
      return;
    }
    stepReceived[portName] = data;
  };

  /**
   * Attach an internal socket to an output port, recording data IPs.
   *
   * @param {string} portName
   * @returns {import("@noflo/noflo").internalSocket.InternalSocket}
   */
  const attachOut = (portName) => {
    const socket = noflo.internalSocket.createSocket();
    socket.addEventListener("ip", (event) => {
      const ip = /** @type {any} */ (event).detail;
      if (ip.type === "data") {
        receiveData(portName, ip.data);
      }
    });
    socket.addEventListener("error", (event) => {
      const err = /** @type {any} */ (event).detail;
      pendingError = err?.error ?? err;
    });
    /** @type {any} */ (component.outPorts.ports)[portName].attach(socket);
    return socket;
  };

  const outSockets = {};
  for (const portName of Object.keys(
    /** @type {any} */ (component.outPorts).ports || {},
  )) {
    outSockets[portName] = attachOut(portName);
  }

  // Attach input sockets for every port any step sends to
  const inSockets = {};
  const inputPorts = new Set();
  for (const step of [testCase.inputs].flat()) {
    for (const portName of Object.keys(step || {})) {
      inputPorts.add(portName);
    }
  }
  for (const portName of inputPorts) {
    if (!(/** @type {any} */ (component.inPorts.ports)[portName])) {
      throw new Error(`Component '${topic}' has no inlet port '${portName}'`);
    }
    const socket = noflo.internalSocket.createSocket();
    socket.addEventListener("error", (event) => {
      const err = /** @type {any} */ (event).detail;
      pendingError = err?.error ?? err;
    });
    /** @type {any} */ (component.inPorts.ports)[portName].attach(socket);
    inSockets[portName] = socket;
  }

  try {
    await runSequence(normalizeSequence(testCase), {
      timeout,
      send: (stepInputs) => {
        for (const [portName, data] of Object.entries(stepInputs)) {
          inSockets[portName].post(new noflo.IP("data", data));
        }
      },
      received: () => stepReceived,
      hasError: () => pendingError,
      settled: () => /** @type {any} */ (component).load === 0,
      expect: (ports) => {
        pendingError = null;
        stepReceived = {};
        expectedPorts = ports;
      },
    });
  } finally {
    for (const [portName, socket] of Object.entries(outSockets)) {
      /** @type {any} */ (component.outPorts.ports)[portName].detach(socket);
    }
    for (const [portName, socket] of Object.entries(inSockets)) {
      /** @type {any} */ (component.inPorts.ports)[portName].detach(socket);
    }
  }
}

/**
 * Execute one test case against an explicit fixture graph.
 *
 * The fixture graph is started as a real NoFlo network (sharing the suite's
 * ComponentLoader). Test inputs and expectations address the graph's
 * exported inports and outports.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader - ComponentLoader providing the fixture's components
 * @param {import("@noflo/noflo").GraphModel} graph - Fixture graph model
 * @param {string} topic - Suite topic, for error messages
 * @param {Record<string, any>} testCase - The fbp-spec testcase
 * @param {number} timeout - Case timeout in ms
 * @returns {Promise<void>}
 */
async function executeGraphTestCase(loader, graph, topic, testCase, timeout) {
  // Public export name -> internal port reference
  const inExports = /** @type {Map<string, { node: string, port: string }>} */ (
    new Map()
  );
  const outExports =
    /** @type {Map<string, { node: string, port: string }>} */ (new Map());
  for (const exp of graph.exports()) {
    if (exp.direction === "inport") inExports.set(exp.public, exp.internal);
    if (exp.direction === "outport") outExports.set(exp.public, exp.internal);
  }

  const network = await noflo.createNetwork(graph, {
    componentLoader: loader,
    delay: true,
  });
  // The network re-throws process errors when nobody listens, so attach
  // the listener before wiring the network up
  let pendingError = /** @type {Error | null} */ (null);
  network.addEventListener("process-error", (event) => {
    const detail = /** @type {any} */ (event).detail ?? {};
    const err = detail.error ?? detail;
    pendingError =
      err instanceof Error ? err : new Error(err?.message ?? String(err));
  });

  /** Data received during the current sequence step, per exported port */
  let stepReceived = /** @type {Record<string, any>} */ ({});
  /** Ports expected by the current step; guards the `error` port check */
  let expectedPorts = /** @type {string[]} */ ([]);

  const outSockets =
    /** @type {Record<string, import("@noflo/noflo").internalSocket.InternalSocket>} */ ({});
  const inSockets =
    /** @type {Record<string, import("@noflo/noflo").internalSocket.InternalSocket>} */ ({});

  try {
    await network.connect();
    await network.start();

    /**
     * Get the instantiated process behind an export.
     *
     * @param {string} publicName
     * @param {{ node: string, port: string }} internal
     * @param {"in"|"out"} direction
     * @returns {any} The component's port
     */
    const exportedPort = (publicName, internal, direction) => {
      const process = /** @type {any} */ (network.getNode(internal.node));
      if (!process?.component) {
        throw new Error(
          `Fixture of '${topic}' has no process '${internal.node}' (export '${publicName}')`,
        );
      }
      const ports =
        direction === "in"
          ? process.component.inPorts
          : process.component.outPorts;
      const port = /** @type {any} */ (ports?.ports)?.[internal.port];
      if (!port) {
        throw new Error(
          `Fixture of '${topic}' exports '${publicName}' through unknown ${direction}port '${internal.node}.${internal.port}'`,
        );
      }
      return port;
    };

    for (const [publicName, internal] of outExports) {
      const port = exportedPort(publicName, internal, "out");
      const socket = noflo.internalSocket.createSocket();
      socket.addEventListener("ip", (event) => {
        const ip = /** @type {any} */ (event).detail;
        if (ip.type !== "data") return;
        if (publicName === "error" && !expectedPorts.includes("error")) {
          pendingError = new Error(
            "fbp-spec: unexpected error packet on port 'error'",
          );
          return;
        }
        stepReceived[publicName] = ip.data;
      });
      port.attach(socket);
      outSockets[publicName] = socket;
    }

    for (const step of [testCase.inputs].flat()) {
      for (const portName of Object.keys(step || {})) {
        if (inSockets[portName]) continue;
        const internal = inExports.get(portName);
        if (!internal) {
          throw new Error(
            `Fixture of '${topic}' has no exported inlet port '${portName}'`,
          );
        }
        const port = exportedPort(portName, internal, "in");
        const socket = noflo.internalSocket.createSocket();
        socket.addEventListener("error", (event) => {
          const err = /** @type {any} */ (event).detail;
          pendingError = err?.error ?? err;
        });
        port.attach(socket);
        inSockets[portName] = socket;
      }
    }

    await runSequence(normalizeSequence(testCase), {
      timeout,
      send: (stepInputs) => {
        for (const [portName, data] of Object.entries(stepInputs)) {
          inSockets[portName].post(new noflo.IP("data", data));
        }
      },
      received: () => stepReceived,
      hasError: () => pendingError,
      settled: () =>
        Object.values(network.processes).every(
          (process) =>
            !process.component ||
            /** @type {any} */ (process.component).load === 0,
        ),
      expect: (ports) => {
        pendingError = null;
        stepReceived = {};
        expectedPorts = ports;
      },
    });
  } finally {
    for (const [publicName, socket] of Object.entries(outSockets)) {
      const internal = outExports.get(publicName);
      if (!internal) continue;
      const process = /** @type {any} */ (network.getNode(internal.node));
      const port = process?.component?.outPorts?.ports?.[internal.port];
      if (port) port.detach(socket);
    }
    for (const [publicName, socket] of Object.entries(inSockets)) {
      const internal = inExports.get(publicName);
      if (!internal) continue;
      const process = /** @type {any} */ (network.getNode(internal.node));
      const port = process?.component?.inPorts?.ports?.[internal.port];
      if (port) port.detach(socket);
    }
    await network.stop();
  }
}

/**
 * Execute one test case against a suite's fixture.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader - ComponentLoader providing the suite's components
 * @param {Record<string, any>} suite - The fbp-spec suite (topic and optional fixture)
 * @param {Record<string, any>} testCase - The fbp-spec testcase
 * @param {number} [defaultTimeout=2000] - Suite-level default timeout in ms
 * @returns {Promise<void>}
 */
export async function executeTestCase(
  loader,
  suite,
  testCase,
  defaultTimeout = 2000,
) {
  const timeout = testCase.timeout ?? defaultTimeout;
  const graphJson = resolveFixtureGraph(suite);
  if (graphJson) {
    const graph = noflo.importFbpJson(graphJson);
    return executeGraphTestCase(loader, graph, suite.topic, testCase, timeout);
  }
  return executeComponentTestCase(loader, suite.topic, testCase, timeout);
}
