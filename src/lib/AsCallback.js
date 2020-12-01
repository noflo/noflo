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
function normalizeOptions(options, component) {
  if (!options) { options = {}; }
  if (!options.name) { options.name = component; }
  if (options.loader) {
    options.baseDir = options.loader.baseDir;
  }
  if (!options.baseDir && process && process.cwd) {
    options.baseDir = process.cwd();
  }
  if (!options.loader) {
    options.loader = new ComponentLoader(options.baseDir);
  }
  if (!options.raw) { options.raw = false; }
  return options;
}

// ### Network preparation
//
// Each invocation of the asCallback-wrapped NoFlo graph
// creates a new network. This way we can isolate multiple
// executions of the function in their own contexts.
function prepareNetwork(component, options, callback) {
  // If we were given a graph instance, then just create a network
  let network;
  if (typeof component === 'object') {
    // This is a graph object
    network = new Network(component, {
      ...options,
      componentLoader: options.loader,
    });
    // Wire the network up
    network.connect((err) => {
      if (err) {
        callback(err);
        return;
      }
      callback(null, network);
    });
    return;
  }

  // Start by loading the component
  options.loader.load(component, (err, instance) => {
    if (err) {
      callback(err);
      return;
    }
    // Prepare a graph wrapping the component
    const graph = new Graph(options.name);
    const nodeName = options.name;
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
    network = new Network(graph, {
      ...options,
      componentLoader: options.loader,
    });
    // Wire the network up and start execution
    network.connect((err2) => {
      if (err2) {
        callback(err2);
        return;
      }
      callback(null, network);
    });
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
function runNetwork(network, inputs, options, callback) {
  // Prepare inports
  let inSockets = {};
  // Subscribe outports
  const received = [];
  const outPorts = Object.keys(network.graph.outports);
  let outSockets = {};
  outPorts.forEach((outport) => {
    const portDef = network.graph.outports[outport];
    const process = network.getNode(portDef.process);
    outSockets[outport] = internalSocket.createSocket();
    network.subscribeSocket(outSockets[outport]);
    process.component.outPorts[portDef.port].attach(outSockets[outport]);
    outSockets[outport].from = {
      process,
      port: portDef.port,
    };
    outSockets[outport].on('ip', (ip) => {
      const res = {};
      res[outport] = ip;
      received.push(res);
    });
  });
  // Subscribe to process errors
  let onEnd = null;
  let onError = null;
  onError = (err) => {
    callback(err.error);
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
    callback(null, received);
    network.removeListener('process-error', onError);
  };
  network.once('end', onEnd);
  // Start network
  network.start((err) => {
    if (err) {
      callback(err);
      return;
    }
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
            callback(new Error(`Port ${port} not available in the graph`));
            return;
          }
          const process = network.getNode(portDef.process);
          inSockets[port] = internalSocket.createSocket();
          network.subscribeSocket(inSockets[port]);
          inSockets[port].to = {
            process,
            port,
          };
          process.component.inPorts[portDef.port].attach(inSockets[port]);
        }
        try {
          if (IP.isIP(value)) {
            inSockets[port].post(value);
          } else {
            inSockets[port].post(new IP('data', value));
          }
        } catch (e) {
          callback(e);
          network.removeListener('process-error', onError);
          network.removeListener('end', onEnd);
          return;
        }
      }
    }
  });
}

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
  if (network.graph.inports.in) { inPort = 'in'; }
  const map = {};
  map[inPort] = inputs;
  return [map];
}

function normalizeOutput(values, options) {
  if (options.raw) { return values; }
  const result = [];
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
      current = previous;
    }
  });
  if (result.length === 1) {
    return result[0];
  }
  return result;
}

function sendOutputMap(outputs, resultType, options, callback) {
  // First check if the output sequence contains errors
  const errors = outputs.filter((map) => map.error != null).map((map) => map.error);
  if (errors.length) {
    callback(normalizeOutput(errors, options));
    return;
  }

  if (resultType === 'sequence') {
    callback(null, outputs.map((map) => {
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
    return;
  }

  // Flatten the sequence
  const mappedOutputs = {};
  outputs.forEach((map) => {
    Object.keys(map).forEach((key) => {
      const val = map[key];
      if (!mappedOutputs[key]) { mappedOutputs[key] = []; }
      mappedOutputs[key].push(val);
    });
  });

  const outputKeys = Object.keys(mappedOutputs);
  const withValue = outputKeys.filter((outport) => mappedOutputs[outport].length > 0);
  if (withValue.length === 0) {
    // No output
    callback(null);
    return;
  }
  if ((withValue.length === 1) && (resultType === 'simple')) {
    // Single outport
    callback(null, normalizeOutput(mappedOutputs[withValue[0]], options));
    return;
  }
  const result = {};
  Object.keys(mappedOutputs).forEach((port) => {
    const packets = mappedOutputs[port];
    result[port] = normalizeOutput(packets, options);
  });
  callback(null, result);
}

export function asCallback(component, options) {
  if (!component) {
    throw new Error('No component or graph provided');
  }
  options = normalizeOptions(options, component);
  return (inputs, callback) => {
    prepareNetwork(component, options, (err, network) => {
      if (err) {
        callback(err);
        return;
      }
      if (options.networkCallback) {
        options.networkCallback(network);
      }
      const resultType = getType(inputs, network);
      const inputMap = prepareInputMap(inputs, resultType, network);
      runNetwork(network, inputMap, options, (err2, outputMap) => {
        if (err2) {
          callback(err2);
          return;
        }
        sendOutputMap(outputMap, resultType, options, callback);
      });
    });
  };
}
