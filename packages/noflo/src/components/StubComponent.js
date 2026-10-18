//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT
/* @ts-self-types="./StubComponent.d.ts" */

/* eslint-disable
    import/prefer-default-export,
    no-underscore-dangle,
*/

import { Component } from "../lib/Component.js";
// biome-ignore lint/correctness/noUnusedImports: IP is referenced in the JSDoc casts below; a type-only import is rejected here (TS8006)
import IP from "../lib/IP.js";

/**
 * The error a stub component raises when a data packet reaches a component
 * that has no implementation (work document #19). The dedicated class lets
 * runtimes classify the failure on the wire — the FBP protocol's
 * `STUB_ERROR` telemetry event keys on the error `name` — instead of
 * string-parsing messages, and carries the component name so the run shows
 * exactly where the program stops being real.
 *
 * The stub failing is the feature: a data packet reaching a stub means the
 * graph has run past its implemented surface.
 */
export class StubNotImplementedError extends Error {
  /**
   * @param {string} componentName - Full name of the unimplemented component
   * @param {string|null} [portName] - The triggering inport the data
   *   packet arrived on, when known
   */
  constructor(componentName, portName = null) {
    const at = portName ? ` on inport '${portName}'` : "";
    super(
      `Component ${componentName} is not implemented: a stub component received data${at}`,
    );
    this.name = "StubNotImplementedError";
    /** Name of the unimplemented component the error was raised for */
    this.componentName = componentName;
  }
}

/**
 * The packet policy of a stub component: what happens when a data packet
 * arrives on a triggering inport.
 *
 * @typedef {"throw"|"drop"} StubPacketPolicy
 */

/**
 * Options for constructing a StubComponent: the component's declared
 * signature expressed as plain NoFlo port options, plus the stub-specific
 * packet policy.
 *
 * @typedef {import("../lib/Component.js").ComponentOptions & {
 *   name?: string,
 *   onPacket?: StubPacketPolicy
 * }} StubComponentOptions
 */

/**
 * A signature-only placeholder component (work document #19).
 *
 * Top-down design (noflo/noflo#593) means graphs reference component names
 * that have no implementation yet — only a declared signature: ports with
 * datatypes and control flags. The StubComponent is the canonical class the
 * component registry hands back for such names (and the class a materialized
 * signature sidecar instantiates): every consumer of the registry contract
 * gets the same placeholder instead of hand-rolling one.
 *
 * Behavior contract:
 *
 * - **Silent placeholder**: bracket forwarding is off (`forwardBrackets:
 *   {}`) and output ports are never sourced. Outports are still declared —
 *   graphs validate, edges attach, UIs render — but a placeholder that
 *   emits anything would be lying about having an implementation.
 * - **Data packets fail loudly by default**: a data IP on a triggering
 *   inport raises {@link StubNotImplementedError} through
 *   `output.error` — sent to a connected `error` outport when the signature
 *   declares one, escalated to the network's `process-error` otherwise.
 *   The opt-in `onPacket: "drop"` policy consumes and discards data
 *   instead, for structural dry-runs, performance tests, and demos.
 * - **Control inports are exempt**: `control: true` inports are gate ports
 *   the engine never fires the process for, so configuring an unimplemented
 *   component never throws. Config redelivery comes from initials re-sent
 *   at each network start — not from buffer retention.
 * - **Brackets are always absorbed**: consumed, never emitted. A pure
 *   bracket-heavy stream without data stays silent even under the `throw`
 *   policy — no data arrived, so nothing is unimplemented about it.
 * - **No buffer handover**: buffers die with the instance. Swapping a stub
 *   for its eventual implementation re-delivers initials; in-flight packet
 *   migration would be a separate hot-swap feature.
 *
 * The constructor takes plain NoFlo port options — core defines no
 * signature format of its own. The two declared entry paths for signature
 * data (the full manifest signature shape and the narrower on-disk sidecar
 * shape noflo-ui materializes) go through {@link StubComponent.fromSignature},
 * which maps them losslessly onto port options.
 */
export class StubComponent extends Component {
  /**
   * Create a stub component for the given declared signature.
   *
   * @param {StubComponentOptions} [options]
   */
  constructor(options = {}) {
    const policy = options.onPacket ?? "throw";
    if (policy !== "throw" && policy !== "drop") {
      throw new Error(
        `Unknown StubComponent packet policy '${policy}' — use "throw" (default) or "drop"`,
      );
    }
    if (typeof options.process === "function") {
      throw new Error(
        "StubComponent cannot take a process function: the placeholder behavior is fixed by the stub contract",
      );
    }
    super({
      ...options,
      // A silent placeholder never forwards brackets: output ports are
      // declared but never sourced (work document #19). Enforced after the
      // spread so a caller cannot unsilence the placeholder
      forwardBrackets: {},
    });

    /** Declared component name, used by errors before the network names the instance */
    this.stubName = options.name ?? null;
    /**
     * What a data packet on a triggering inport does
     * @type {StubPacketPolicy}
     */
    this.packetPolicy = policy;

    // Construction-time check: a `throw` stub with zero triggering inports
    // could never fire — the error path would be dead code and the
    // signature almost certainly mistaken. Control-only signatures are
    // legitimate configuration holders under the `drop` policy.
    const triggering = Object.keys(this.inPorts.ports).filter(
      (name) =>
        !(
          /** @type {import("../lib/InPort.js").default} */ (
            this.inPorts.ports[name]
          ).options.control
        ),
    );
    if (policy === "throw" && triggering.length === 0) {
      throw new Error(
        `StubComponent ${this.stubName ?? "(unnamed)"} declares no triggering inports: the "throw" packet policy could never fire — declare the config ports control: true, add a triggering inport, or use the "drop" policy`,
      );
    }

    this.process((input, output) => {
      this.#absorb(input, output);
    });
  }

  /**
   * Absorb the activation's buffered input: every non-control inport's
   * buffer for the activation's scope is drained — data and brackets alike
   * — and nothing is emitted. Control ports are skipped: their buffers are
   * standing state read non-consumingly, and they never fire the process.
   *
   * Under the `throw` policy, data in the drained input raises
   * {@link StubNotImplementedError}; brackets alone stay silent.
   *
   * @param {import("../lib/ProcessInput.js").default} input
   * @param {import("../lib/ProcessOutput.js").default} output
   * @returns {void}
   */
  #absorb(input, output) {
    /** @type {{ port: string, index: number|null }|null} */
    let dataArrival = null;
    Object.keys(this.inPorts.ports).forEach((portName) => {
      const port = /** @type {import("../lib/InPort.js").default} */ (
        this.inPorts.ports[portName]
      );
      if (port.options.control) {
        return;
      }
      if (port.isAddressable()) {
        const attached = /** @type {number[]} */ (input.attached(portName));
        for (const index of attached) {
          for (;;) {
            const ip = /** @type {IP|void} */ (
              input.get([portName, /** @type {number} */ (index)])
            );
            if (!ip) {
              break;
            }
            if (ip.type === "data" && !dataArrival) {
              dataArrival = { port: portName, index };
            }
          }
        }
        return;
      }
      for (;;) {
        const ip = /** @type {IP|void} */ (input.get(portName));
        if (!ip) {
          break;
        }
        if (ip.type === "data" && !dataArrival) {
          dataArrival = { port: portName, index: null };
        }
      }
    });
    if (this.packetPolicy === "throw" && dataArrival) {
      const componentName =
        this.componentName ?? this.stubName ?? "unknown component";
      output.done(new StubNotImplementedError(componentName, dataArrival.port));
      return;
    }
    output.done();
  }

  /**
   * Stub components self-describe as unimplemented: UIs, runtimes, and
   * flowtraces label "not yet implemented" from this authoritative runtime
   * information instead of inferring from registry lookups that can drift.
   *
   * @returns {boolean}
   */
  isStub() {
    return true;
  }

  /**
   * Build a stub component from a component signature: the declared ports
   * as data, with no implementation behind them.
   *
   * Both signature entry paths the contract defines are accepted:
   *
   * - The full signature shape (publish-time manifest entries, registry
   *   protocol detail answers): ports carry `name`, `datatype`,
   *   `addressable`, `description`, `required`, and — inports only —
   *   `control`.
   * - The narrower on-disk sidecar shape noflo-ui materializes
   *   (`components/<name>.json`): ports carry `name`, `type` (the
   *   datatype), and `addressable`. Missing datatypes default to `all`
   *   and missing flags to absent/false, matching the materializer's
   *   emission.
   *
   * The mapping is field-for-field lossless: `type` and `datatype` name
   * the same port option, `control: true` maps onto the core gate-port
   * option of the same name. The signature stays data — the stub
   * validates shape, not semantics.
   *
   * @param {string} name - Full component name (e.g. `fs/ReadFile`),
   *   recorded as the stub's declared name
   * @param {Object<string, any>} signature - The component signature:
   *   `description`, `icon`, `inports`, `outports`
   * @param {{ onPacket?: StubPacketPolicy }} [options] - Stub-specific
   *   options; see {@link StubComponentOptions}
   * @returns {StubComponent}
   */
  static fromSignature(name, signature, options = {}) {
    if (typeof name !== "string" || !name) {
      throw new Error("StubComponent.fromSignature requires a component name");
    }
    if (!signature || typeof signature !== "object") {
      throw new Error(
        `StubComponent ${name}: the signature must be an object with inports/outports arrays`,
      );
    }
    return new StubComponent({
      name,
      description:
        typeof signature.description === "string" ? signature.description : "",
      icon: typeof signature.icon === "string" ? signature.icon : "",
      inPorts: signaturePorts(name, "inports", signature.inports),
      outPorts: signaturePorts(name, "outports", signature.outports),
      ...options,
    });
  }
}

/**
 * Map one signature direction's port entries onto NoFlo port options.
 *
 * @param {string} componentName
 * @param {string} direction - `inports` or `outports`, for error messages
 * @param {any} ports - The signature's port entries
 * @returns {Object<string, Object<string, any>>} Port options keyed by port name
 */
function signaturePorts(componentName, direction, ports) {
  /** @type {Object<string, Object<string, any>>} */
  const mapped = {};
  if (ports == null) {
    return mapped;
  }
  if (!Array.isArray(ports)) {
    throw new Error(
      `StubComponent ${componentName}: signature ${direction} must be an array of port entries`,
    );
  }
  ports.forEach((port, position) => {
    const at = `${direction}[${position}]`;
    if (!port || typeof port !== "object") {
      throw new Error(
        `StubComponent ${componentName}: signature ${at} is not a port entry object`,
      );
    }
    if (typeof port.name !== "string" || !port.name) {
      throw new Error(
        `StubComponent ${componentName}: signature ${at} is missing a port name`,
      );
    }
    if (direction === "outports" && port.control !== undefined) {
      throw new Error(
        `StubComponent ${componentName}: signature ${at} declares control on an outport — control is an inport flag (work document #40)`,
      );
    }
    if (mapped[port.name]) {
      throw new Error(
        `StubComponent ${componentName}: signature ${direction} declares port '${port.name}' twice`,
      );
    }
    const datatype = port.datatype ?? port.type;
    if (datatype !== undefined && typeof datatype !== "string") {
      throw new Error(
        `StubComponent ${componentName}: signature ${at} port '${port.name}' has a non-string datatype`,
      );
    }
    /** @type {Object<string, any>} */
    const portOptions = {
      // The sidecar shape names the datatype `type`; the manifest shape
      // `datatype`. Both map onto the port option of the latter name
      datatype: datatype ?? "all",
      addressable: flag(
        componentName,
        at,
        port.name,
        "addressable",
        port.addressable,
      ),
      description: typeof port.description === "string" ? port.description : "",
    };
    if (port.required !== undefined) {
      portOptions.required = flag(
        componentName,
        at,
        port.name,
        "required",
        port.required,
      );
    }
    if (port.control !== undefined) {
      portOptions.control = flag(
        componentName,
        at,
        port.name,
        "control",
        port.control,
      );
    }
    mapped[port.name] = portOptions;
  });
  return mapped;
}

/**
 * Validate a boolean signature flag.
 *
 * @param {string} componentName
 * @param {string} at - Position description for error messages
 * @param {string} portName
 * @param {string} flagName
 * @param {any} value
 * @returns {boolean|undefined} The validated flag, or undefined when absent
 */
function flag(componentName, at, portName, flagName, value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(
      `StubComponent ${componentName}: signature ${at} port '${portName}' has a non-boolean ${flagName} flag`,
    );
  }
  return value;
}
