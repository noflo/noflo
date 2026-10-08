/**
 * @file network module
 * @description Deterministic in-process execution of fbp-spec test cases.
 *
 *   The component under test is instantiated directly (no fbp-protocol, no
 *   network overhead) and driven with internal sockets. v1 asserts against
 *   data IPs only.
 *
 *   Sequence semantics follow fbp-spec's runner: when `inputs` and `expect`
 *   are arrays they are zipped pairwise and executed in series — send
 *   `inputs[i]`, wait for the data referenced by `expect[i]` on each
 *   expected port, evaluate, then proceed. This is what makes testing
 *   stateful components possible.
 */

import * as noflo from "@noflo/noflo";
import { evaluateExpectStep } from "./assertions.js";

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
 * Execute one test case against a component.
 *
 * @param {import("@noflo/noflo").ComponentLoader} loader - ComponentLoader to load the topic from
 * @param {string} topic - Component name under test
 * @param {Record<string, any>} testCase - The fbp-spec testcase
 * @param {number} [defaultTimeout=2000] - Suite-level default timeout in ms
 * @returns {Promise<void>}
 */
export async function executeTestCase(
  loader,
  topic,
  testCase,
  defaultTimeout = 2000,
) {
  const timeout = testCase.timeout ?? defaultTimeout;
  const component = await loader.load(topic);
  if (!component.inPorts || !component.outPorts) {
    throw new Error(`Component '${topic}' has no ports`);
  }

  /** Data received during the current sequence step, per port */
  let stepReceived = /** @type {Record<string, any>} */ ({});
  /** Set when a component error fires; rejects the pending wait */
  let pendingError = /** @type {Error | null} */ (null);

  /**
   * Attach an internal socket to an output port, recording data IPs.
   *
   * @param {string} portName
   * @returns {import("@noflo/noflo").internalSocket.InternalSocket}
   */
  const attachOut = (portName) => {
    const socket = noflo.internalSocket.createSocket();
    socket.on("ip", (ip) => {
      if (ip.type === "data") {
        stepReceived[portName] = ip.data;
      }
    });
    socket.on("error", (event) => {
      pendingError =
        /** @type {any} */ (event)?.error ?? /** @type {any} */ (event);
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

  // Attach input sockets for every port any step sends to
  const inSockets = {};
  const inputPorts = new Set();
  for (const step of inputs) {
    for (const portName of Object.keys(step || {})) {
      inputPorts.add(portName);
    }
  }
  for (const portName of inputPorts) {
    if (!(/** @type {any} */ (component.inPorts.ports)[portName])) {
      throw new Error(`Component '${topic}' has no inlet port '${portName}'`);
    }
    const socket = noflo.internalSocket.createSocket();
    socket.on("error", (event) => {
      pendingError =
        /** @type {any} */ (event)?.error ?? /** @type {any} */ (event);
    });
    /** @type {any} */ (component.inPorts.ports)[portName].attach(socket);
    inSockets[portName] = socket;
  }

  const caseDeadline = Date.now() + timeout;
  try {
    for (let i = 0; i < inputs.length; i += 1) {
      const stepInputs = inputs[i] || {};
      const expectStep = expects[i];
      const expectedPorts = Object.keys(expectStep || {});
      pendingError = null;
      stepReceived = {};

      // Send this step's inputs as data IPs
      for (const [portName, data] of Object.entries(stepInputs)) {
        inSockets[portName].post(new noflo.IP("data", data));
      }

      const remaining = caseDeadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `fbp-spec: Timeout after ${timeout}ms waiting for step ${i + 1}`,
        );
      }
      const description =
        expectedPorts.length > 0
          ? `waiting for data on port(s) ${expectedPorts.join(", ")} (step ${i + 1})`
          : `waiting for component to settle (step ${i + 1})`;

      // The condition checks pendingError first, so component errors
      // surface as rejections rather than waiting for the timeout.
      await waitFor(
        () =>
          pendingError !== null ||
          (expectedPorts.length > 0
            ? expectedPorts.every((portName) => portName in stepReceived)
            : /** @type {any} */ (component).load === 0),
        remaining,
        description,
      );

      if (pendingError) throw pendingError;
      evaluateExpectStep(expectStep, stepReceived);
    }
  } finally {
    for (const [portName, socket] of Object.entries(outSockets)) {
      /** @type {any} */ (component.outPorts.ports)[portName].detach(socket);
    }
    for (const [portName, socket] of Object.entries(inSockets)) {
      /** @type {any} */ (component.inPorts.ports)[portName].detach(socket);
    }
  }
}
