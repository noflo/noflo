//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     SPDX-License-Identifier: MIT
/* @ts-self-types="./PortMetadata.d.ts" */

/**
 * Per-instance port-behavior overrides (work document #44): the `noflo.*`
 * node-metadata keys the Network applies to a component instance after
 * instantiation and before wiring. The vocabulary is core-owned — these
 * keys tweak Process API semantics, and no other namespace may re-declare
 * them (the publish gate enforces the namespace reservation; work
 * documents #37/#44).
 *
 * **Schema touchpoint**: the keys and their shapes are declared by the
 * `noflo/port-behavior` metadata schema — the `noflo`-namespace catalog
 * entry shipped with the publish-time machinery (work documents #37/#25),
 * where components opt in by composing the keys into their config
 * schemas. This module is the runtime consumer: it validates the subset
 * a running network can check (key recognition, port existence, value
 * shapes) and leaves the publish-time contracts to the gate.
 *
 * The keys and their shapes:
 *
 * - `noflo.control: string[]` — the instance's complete set of gate
 *   inports. The list replaces the component's declared control set:
 *   a listed name is promoted to the gate model (standing,
 *   non-consumingly-read configuration whose arrivals re-fire pending
 *   work per scope), an unlisted control port is demoted to a direct
 *   firing edge. Unlisted data ports are unaffected (work document #47).
 * - `noflo.scoped: object` — inport-name → boolean. Flipping re-prepares
 *   the port's buffer structures. The outport side is not supported: its
 *   flip interacts with the ordered-output and forwarding machinery, and
 *   the semantics need their own design pass.
 * - `noflo.forwardBrackets: object` — inport → outports array (the same
 *   shape as the component option; an empty array is the framing
 *   termination declaration, work document #47). An instance entry
 *   replaces the component's declared rule for that inport; unlisted
 *   inports keep their declared or built-in rules.
 *
 * Overrides apply to the instance only: the loader instantiates one
 * component per node, so a second instance of the same component keeps
 * its declared behavior. The zero-regression posture: a node without
 * `noflo.*` metadata is untouched.
 *
 * **Call before wiring**: a `noflo.scoped` flip re-prepares the port's
 * buffer structures, discarding buffered state. The network path applies
 * the helper pre-wiring, where there is nothing buffered; direct API
 * callers must honor the same contract.
 *
 * Subgraph nodes are out of scope: a `noflo.*` override on a subgraph
 * node's exported ports has undefined relay semantics (the wrapper's
 * relay machinery was not designed against per-instance port knobs), and
 * the network path rejects it.
 */

/**
 * The `noflo.*` keys this helper recognizes, as declared by the
 * `noflo/port-behavior` metadata schema. Runtime validation only: a key
 * outside this set is an error, because the `noflo` namespace is
 * core-owned and nothing else may extend it.
 *
 * @type {string[]}
 */
export const PORT_BEHAVIOR_KEYS = [
  "noflo.control",
  "noflo.scoped",
  "noflo.forwardBrackets",
];

/**
 * Read the `noflo.*` overrides from node metadata, resolve them against
 * the component's declared ports, and apply them to the instance.
 * Validation is loud: unknown `noflo.*` keys, nonexistent ports,
 * non-string names, and mistyped values are errors — never silent
 * ignores.
 *
 * @param {import("./Component.js").Component} component
 * @param {Object<string, any>} [metadata] - The node's metadata; the
 *   `noflo.*` keys carry the overrides
 * @returns {void}
 */
export function applyPortMetadata(component, metadata = {}) {
  const overrides = Object.keys(metadata ?? {})
    .filter((key) => key.startsWith("noflo."))
    .map((key) => {
      if (!PORT_BEHAVIOR_KEYS.includes(key)) {
        throw new Error(
          `Unknown 'noflo.' metadata key '${key}' — the noflo/port-behavior schema declares: ${PORT_BEHAVIOR_KEYS.join(", ")}`,
        );
      }
      return [key.slice("noflo.".length), metadata[key]];
    });

  // The zero-regression posture first: a node without noflo.* overrides
  // is untouched — subgraph nodes included
  if (!overrides.length) {
    return;
  }
  // Overrides present on a subgraph node: the relay semantics for
  // exported ports are not defined, so the network path rejects them
  if (component.isSubgraph?.()) {
    throw new Error(
      "noflo.* overrides do not apply to subgraph nodes: the relay semantics for exported ports are not defined — place the override on the inner graph's node",
    );
  }

  for (const [key, value] of overrides) {
    if (key === "control") {
      applyControl(component, value);
      continue;
    }
    if (key === "scoped") {
      applyScoped(component, value);
      continue;
    }
    if (key === "forwardBrackets") {
      applyForwardBrackets(component, value);
      continue;
    }
    throw new Error(`Unknown 'noflo.' metadata key '${key}'`);
  }
}

/**
 * @param {import("./Component.js").Component} component
 * @param {any} value
 * @returns {void}
 */
function applyControl(component, value) {
  if (!Array.isArray(value)) {
    throw new Error(
      `noflo.control must be an array of inport names — got ${typeof value}`,
    );
  }
  // Validate everything first: a later invalid entry must not leave
  // earlier ports already flipped (the helper is public API). The gate
  // model on addressable ports is untested territory — the
  // control-triggered walk does not scan addressable buffers — so an
  // addressable promotion is rejected
  for (const name of value) {
    if (typeof name !== "string") {
      throw new Error(
        `noflo.control entries must be port names — got ${typeof name}`,
      );
    }
    const port = component.inPorts.ports[name];
    if (!port) {
      throw new Error(
        `noflo.control names inport '${name}', which the component does not have`,
      );
    }
    if (port.isAddressable()) {
      throw new Error(
        `noflo.control names addressable inport '${name}' — the gate model does not support addressable ports`,
      );
    }
  }
  // Replace semantics: the list is the instance's complete gate set.
  // Unlisted inports return to direct firing, whatever the component
  // declared
  for (const name of value) {
    component.inPorts.ports[name].options.control = true;
  }
  for (const [name, port] of Object.entries(component.inPorts.ports)) {
    if (!value.includes(name)) {
      port.options.control = false;
    }
  }
}

/**
 * @param {import("./Component.js").Component} component
 * @param {any} value
 * @returns {void}
 */
function applyScoped(component, value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `noflo.scoped must be an object of port-name to boolean — got ${typeof value}`,
    );
  }
  // Validate everything first: the flips are atomic, so a later invalid
  // entry cannot leave earlier ports already flipped (the helper is
  // public API)
  for (const [name, scoped] of Object.entries(value)) {
    if (typeof scoped !== "boolean") {
      throw new Error(
        `noflo.scoped values must be booleans — '${name}' got ${typeof scoped}`,
      );
    }
    if (!component.inPorts.ports[name]) {
      throw new Error(
        component.outPorts.ports[name]
          ? `noflo.scoped names outport '${name}' — the outport-side scoped flip interacts with the ordered-output and forwarding machinery and is not supported yet (work document #44)`
          : `noflo.scoped names port '${name}', which the component does not have`,
      );
    }
  }
  for (const [name, scoped] of Object.entries(value)) {
    const inPort = component.inPorts.ports[name];
    if (inPort) {
      if (inPort.options.scoped !== scoped) {
        inPort.options.scoped = scoped;
        // The buffer structures are prepared for the declared scoping;
        // a flip re-prepares them. The helper runs pre-wiring, so there
        // is no buffered state to migrate
        inPort.prepareBuffer();
      }
      continue;
    }
    // An outport's scoped option gates the scope stamping at send time
    component.outPorts.ports[name].options.scoped = scoped;
  }
}

/**
 * @param {import("./Component.js").Component} component
 * @param {any} value
 * @returns {void}
 */
function applyForwardBrackets(component, value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `noflo.forwardBrackets must be an object of inport-name to outport-name array — got ${typeof value}`,
    );
  }
  // Validate everything first: the map application is atomic
  for (const [inPortName, outPorts] of Object.entries(value)) {
    if (typeof inPortName !== "string") {
      throw new Error(
        `noflo.forwardBrackets keys must be inport names — got ${typeof inPortName}`,
      );
    }
    const port = component.inPorts.ports[inPortName];
    if (!port) {
      throw new Error(
        `noflo.forwardBrackets names inport '${inPortName}', which the component does not have`,
      );
    }
    if (!Array.isArray(outPorts)) {
      throw new Error(
        `noflo.forwardBrackets values must be arrays of outport names — '${inPortName}' got ${typeof outPorts}`,
      );
    }
    for (const outPortName of outPorts) {
      if (typeof outPortName !== "string") {
        throw new Error(
          `noflo.forwardBrackets entries must be outport names — '${inPortName}' got ${typeof outPortName}`,
        );
      }
      if (!component.outPorts.ports[outPortName]) {
        throw new Error(
          `noflo.forwardBrackets for inport '${inPortName}' references outport '${outPortName}', which the component does not have`,
        );
      }
    }
  }
  // Replace semantics per inport: an instance entry replaces the
  // component's declared rule for that inport; unlisted inports keep
  // their declared or built-in rules
  component.forwardBrackets = {
    ...component.forwardBrackets,
    ...value,
  };
}
