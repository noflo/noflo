//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2017-2018 Flowhub UG
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    no-param-reassign,
    import/prefer-default-export,
*/
import { Graph } from 'fbp-graph';
import { ComponentLoader } from './ComponentLoader';
import { Network } from './Network';
import IP from './IP';
import * as internalSocket from './InternalSocket';

// ## asCallback embedding API
//
// asCallback is a helper for embedding NoFlo components or
// graphs in other JavaScript programs.
//
// By using the `noflo.asCallback` function, you can turn any
// NoFlo component or NoFlo Graph instance into a regular,
// Node.js-style JavaScript function.
//
// Each call to that function starts a new NoFlo network where
// the given input arguments are sent as IP objects to matching
// inports. Once the network finishes, the IP objects received
// from the network will be sent to the callback function.
//
// If there was anything sent to an `error` outport, this will
// be provided as the error argument to the callback.

// ### Option normalization
//
// Here we handle the input valus given to the `asCallback`
// function. This allows passing things like a pre-initialized
// NoFlo ComponentLoader, or giving the component loading
// baseDir context.
/**
 * @typedef {Graph | string} AsCallbackComponent
 */
/**
 * @typedef {Object} AsCallbackOptions
 * @property {string} [name] - Name for the wrapped network
 * @property {ComponentLoader} [loader] - Component loader instance to use, if any
 * @property {string} [baseDir] - Project base directory for component loading
 * @property {Object} [flowtrace] - Flowtrace instance to use for tracing this network run
 * @property {NetworkCallback} [networkCallback] - Access to Network instance
 * @property {boolean} [raw] - Whether the callback should operate on raw noflo.IP objects
 * @property {boolean} [asyncDelivery] - Make Information Packet delivery asynchronous
 */

/**
 * @typedef {Array<Object<string, IP>>} OutputMap
 */
/**
 * @typedef {Object<string, Array<IP|any>>|Array<Object<string, IP|any>>} InputMap
 */

/**
 * @param {AsCallbackOptions} options
 * @param {AsCallbackComponent} component
 * @returns {AsCallbackOptions}
 */
function normalizeOptions(options, component) {
  if (!options) { options = {}; }
  if (!options.name && typeof component === 'string') {
    options.name = component;
  }
  if (options.loader) {
    options.baseDir = options.loader.baseDir;
  }
  if (!options.baseDir && process && process.cwd) {
    options.baseDir = process.cwd();
  }
  if (options.baseDir && !options.loader) {
    options.loader = new ComponentLoader(options.baseDir);
  }
  if (!options.raw) {
    options.raw = false;
  }
  if (!options.asyncDelivery) {
    options.asyncDelivery = false;
  }
  return options;
}

// ### Network preparation
//
// Each invocation of the asCallback-wrapped NoFlo graph
// creates a new network. This way we can isolate multiple
// executions of the function in their own contexts.
/**
 * @param {AsCallbackComponent} component
 * @param {AsCallbackOptions} options
 * @returns {Promise<Network>}
 */
function prepareNetwork(component, options) {
  // If we were given a graph instance, then just create a network
  if (typeof component === 'object') {
    // This is a graph object
    const network = new Network(component, {
      ...options,
      componentLoader: options.loader,
    });
    // Wire the network up
    return network.connect();
  }

  if (!options.loader) {
    return Promise.reject(new Error('No component loader provided'));
  }

  // Start by loading the component
  return options.loader.load(component, {})
    .then((instance) => {
      // Prepare a graph wrapping the component
      const graph = new Graph(options.name);
      const nodeName = options.name || 'AsCallback';
      graph.addNode(nodeName, component);
      // Expose ports
      const inPorts = instance.inPorts.ports;
      const outPorts = instance.outPorts.ports;
      Object.keys(inPorts).forEach((port) => {
        graph.addInport(port, nodeName, port);
      });
      Object.keys(outPorts).forEach((port) => {
        graph.addOutport(port, nodeName, port);
      });
      // Prepare network
      const network = new Network(graph, {
        ...options,
        componentLoader: options.loader,
      });
      // Wire the network up and start execution
      return network.connect();
    });
}

// ### Network execution
//
// Once network is ready, we connect to all of its exported
// in and outports and start the network.
//
// Input data is sent to the inports, and we collect IP
// packets received on the outports.
//
// Once the network finishes, we send the resulting IP
// objects to the callback.
/**
 * @param {Network} network
 * @param {any} inputs
 * @returns {Promise<OutputMap>}
 */
function runNetwork(network, inputs) {
  return new Promise((resolve, reject) => {
    // Prepare inports
    /** @type {Object<string, import("./InternalSocket").InternalSocket>} */
    let inSockets = {};
    // Subscribe outports
    /** @type {Array<Object<string, IP>>} */
    const received = [];
    const outPorts = Object.keys(network.graph.outports);
    /** @type {Object<string, import("./InternalSocket").InternalSocket>} */
    let outSockets = {};
    outPorts.forEach((outport) => {
      const portDef = network.graph.outports[outport];
      const process = network.getNode(portDef.process);
      if (!process || !process.component) {
        return;
      }
      outSockets[outport] = internalSocket.createSocket({}, {
        debug: false,
      });
      network.subscribeSocket(outSockets[outport]);
      process.component.outPorts.ports[portDef.port].attach(outSockets[outport]);
      outSockets[outport].from = {
        process,
        port: portDef.port,
      };
      outSockets[outport].on('ip', (ip) => {
        /** @type Object<string, IP> */
        const res = {};
        res[outport] = ip;
        received.push(res);
      });
    });
    // Subscribe to process errors
    /**
     * @callback EndListener
     * @returns {void}
     */
    /**
     * @callback ErrorListener
     * @param {import("./InternalSocket").SocketError} err
     * @returns {void}
     */
    /** @type {EndListener} */
    let onEnd;
    /** @type {ErrorListener} */
    const onError = (err) => {
      reject(err.error);
      network.removeListener('end', onEnd);
    };
    network.once('process-error', onError);
    // Subscribe network finish
    onEnd = () => {
      // Clear listeners
      Object.keys(outSockets).forEach((port) => {
        const socket = outSockets[port];
        socket.from.process.component.outPorts[socket.from.port].detach(socket);
      });
      outSockets = {};
      inSockets = {};
      resolve(received);
      network.removeListener('process-error', onError);
    };
    network.once('end', onEnd);
    // Start network
    network.start()
      .then(() => {
        // Send inputs
        for (let i = 0; i < inputs.length; i += 1) {
          const inputMap = inputs[i];
          const keys = Object.keys(inputMap);
          for (let j = 0; j < keys.length; j += 1) {
            const port = keys[j];
            const value = inputMap[port];
            if (!inSockets[port]) {
              const portDef = network.graph.inports[port];
              if (!portDef) {
                reject(new Error(`Port ${port} not available in the graph`));
                return;
              }
              const process = network.getNode(portDef.process);
              if (!process || !process.component) {
                reject(new Error(`Process ${portDef.process} for port ${port} not available in the graph`));
                return;
              }
              inSockets[port] = internalSocket.createSocket({}, {
                debug: false,
              });
              network.subscribeSocket(inSockets[port]);
              inSockets[port].to = {
                process,
                port,
              };
              process.component.inPorts.ports[portDef.port].attach(inSockets[port]);
            }
            try {
              if (IP.isIP(value)) {
                inSockets[port].post(value);
              } else {
                inSockets[port].post(new IP('data', value));
              }
            } catch (e) {
              reject(e);
              network.removeListener('process-error', onError);
              network.removeListener('end', onEnd);
              return;
            }
          }
        }
      }, reject);
  });
}

/**
 * @param {any} inputs
 * @param {Network} network
 * @returns {string}
 */
function getType(inputs, network) {
  // Scalar values are always simple inputs
  if (typeof inputs !== 'object' || !inputs) { return 'simple'; }

  if (Array.isArray(inputs)) {
    const maps = inputs.filter((entry) => getType(entry, network) === 'map');
    // If each member if the array is an input map, this is a sequence
    if (maps.length === inputs.length) { return 'sequence'; }
    // Otherwise arrays must be simple inputs
    return 'simple';
  }

  // Empty objects can't be maps
  const keys = Object.keys(inputs);
  if (!keys.length) { return 'simple'; }
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!network.graph.inports[key]) { return 'simple'; }
  }
  return 'map';
}

/**
 * @param {any} inputs
 * @param {string} inputType
 * @param {Network} network
 * @returns {InputMap}
 */
function prepareInputMap(inputs, inputType, network) {
  // Sequence we can use as-is
  if (inputType === 'sequence') { return inputs; }
  // We can turn a map to a sequence by wrapping it in an array
  if (inputType === 'map') { return [inputs]; }
  // Simple inputs need to be converted to a sequence
  let inPort = Object.keys(network.graph.inports)[0];
  if (!inPort) {
    return {};
  }
  // If we have a port named "IN", send to that
  if (network.graph.inports.in) {
    inPort = 'in';
  }
  /** @type {InputMap} */
  const map = {};
  map[inPort] = inputs;
  return [map];
}

/**
 * @param {Array<IP>} values
 * @param {AsCallbackOptions} options
 * @returns {Array<any>}
 */
function normalizeOutput(values, options) {
  if (options.raw) { return values; }
  /** @type {Array<any>} */
  const result = [];
  /** @type {Array<any>|null} */
  let previous = null;
  let current = result;
  values.forEach((packet) => {
    if (packet.type === 'openBracket') {
      previous = current;
      current = [];
      previous.push(current);
    }
    if (packet.type === 'data') {
      current.push(packet.data);
    }
    if (packet.type === 'closeBracket') {
      current = /** @type {Array<any>} */ (previous);
    }
  });
  if (result.length === 1) {
    return result[0];
  }
  return result;
}
/**
 * @param {OutputMap} outputs
 * @param {string} resultType
 * @param {AsCallbackOptions} options
 */
function sendOutputMap(outputs, resultType, options) {
  // First check if the output sequence contains errors
  const errors = outputs.filter((map) => map.error != null).map((map) => map.error);
  if (errors.length) {
    return Promise.reject(normalizeOutput(errors, options));
  }

  if (resultType === 'sequence') {
    return Promise.resolve(outputs.map((map) => {
      /** @type {Object<string, any|IP>} */
      const res = {};
      Object.keys(map).forEach((key) => {
        const val = map[key];
        if (options.raw) {
          res[key] = val;
          return;
        }
        res[key] = normalizeOutput([val], options);
      });
      return res;
    }));
  }

  // Flatten the sequence
  /** @type {Object<string, Array<any|IP>>} */
  const mappedOutputs = {};
  outputs.forEach((map) => {
    Object.keys(map).forEach((key) => {
      const val = map[key];
      if (!mappedOutputs[key]) {
        mappedOutputs[key] = [];
      }
      mappedOutputs[key].push(val);
    });
  });

  const outputKeys = Object.keys(mappedOutputs);
  const withValue = outputKeys.filter((outport) => mappedOutputs[outport].length > 0);
  if (withValue.length === 0) {
    // No output
    return Promise.resolve(null);
  }
  if ((withValue.length === 1) && (resultType === 'simple')) {
    // Single outport
    return Promise.resolve(normalizeOutput(mappedOutputs[withValue[0]], options));
  }
  /** @type {Object<string, any|IP>} */
  const result = {};
  Object.keys(mappedOutputs).forEach((port) => {
    const packets = mappedOutputs[port];
    result[port] = normalizeOutput(packets, options);
  });
  return Promise.resolve(result);
}

/**
 * @callback ResultCallback
 * @param {Error | null} err
 * @param {any} [output]
 * @returns {void}
 */

/**
 * @callback NetworkAsCallback
 * @param {any} input
 * @param {ResultCallback} callback
 * @returns void
 */

/**
 * @callback NetworkAsPromise
 * @param {any} input
 * @returns {Promise<any>}
 */

/**
 * @callback NetworkCallback
 * @param {Network} network
 * @returns void
 */

/**
 * @param {Graph | string} component - Graph or component to load
 * @param {Object} options
 * @param {string} [options.name] - Name for the wrapped network
 * @param {ComponentLoader} [options.loader] - Component loader instance to use, if any
 * @param {string} [options.baseDir] - Project base directory for component loading
 * @param {Object} [options.flowtrace] - Flowtrace instance to use for tracing this network run
 * @param {NetworkCallback} [options.networkCallback] - Access to Network instance
 * @param {boolean} [options.raw] - Whether the callback should operate on raw noflo.IP objects
 * @returns {NetworkAsPromise}
 */
export function asPromise(component, options) {
  if (!component) {
    throw new Error('No component or graph provided');
  }
  options = normalizeOptions(options, component);
  return (inputs) => prepareNetwork(component, options)
    .then((network) => {
      if (options.networkCallback) {
        options.networkCallback(network);
      }
      const resultType = getType(inputs, network);
      const inputMap = prepareInputMap(inputs, resultType, network);
      return runNetwork(network, inputMap)
        .then((outputMap) => sendOutputMap(outputMap, resultType, options));
    });
}

/**
 * @param {AsCallbackComponent} component - Graph or component to load
 * @param {AsCallbackOptions} options
 * @returns {NetworkAsCallback}
 */
export function asCallback(component, options) {
  const promised = asPromise(component, options);
  return (inputs, callback) => {
    promised(inputs)
      .then((output) => {
        callback(null, output);
      }, callback);
  };
}
