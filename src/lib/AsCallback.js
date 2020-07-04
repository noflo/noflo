/* eslint-disable
    func-names,
    guard-for-in,
    no-continue,
    no-param-reassign,
    no-restricted-syntax,
    no-shadow,
    no-unused-vars,
    no-use-before-define,
    no-var,
    vars-on-top,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2017-2018 Flowhub UG
//     NoFlo may be freely distributed under the MIT license
const {
  Graph,
} = require('fbp-graph');
const {
  ComponentLoader,
} = require('./ComponentLoader');
const {
  Network,
} = require('./Network');
const IP = require('./IP');
const internalSocket = require('./InternalSocket');

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
const normalizeOptions = function (options, component) {
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
};

// ### Network preparation
//
// Each invocation of the asCallback-wrapped NoFlo graph
// creates a new network. This way we can isolate multiple
// executions of the function in their own contexts.
const prepareNetwork = function (component, options, callback) {
  // If we were given a graph instance, then just create a network
  let network;
  if (typeof component === 'object') {
    component.componentLoader = options.loader;

    network = new Network(component, options);
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
    let def; let
      port;
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
    for (port in inPorts) {
      def = inPorts[port];
      graph.addInport(port, nodeName, port);
    }
    for (port in outPorts) {
      def = outPorts[port];
      graph.addOutport(port, nodeName, port);
    }
    // Prepare network
    graph.componentLoader = options.loader;
    network = new Network(graph, options);
    // Wire the network up and start execution
    network.connect((err) => {
      if (err) {
        callback(err);
        return;
      }
      callback(null, network);
    });
  });
};

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
const runNetwork = function (network, inputs, options, callback) {
  // Prepare inports
  const inPorts = Object.keys(network.graph.inports);
  let inSockets = {};
  // Subscribe outports
  const received = [];
  const outPorts = Object.keys(network.graph.outports);
  let outSockets = {};
  outPorts.forEach((outport) => {
    const portDef = network.graph.outports[outport];
    const process = network.getNode(portDef.process);
    outSockets[outport] = internalSocket.createSocket();
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
  const onError = function (err) {
    callback(err.error);
    network.removeListener('end', onEnd);
  };
  network.once('process-error', onError);
  // Subscribe network finish
  var onEnd = function () {
    // Clear listeners
    for (const port in outSockets) {
      const socket = outSockets[port];
      socket.from.process.component.outPorts[socket.from.port].detach(socket);
    }
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
    for (const inputMap of Array.from(inputs)) {
      for (const port in inputMap) {
        const value = inputMap[port];
        if (!inSockets[port]) {
          const portDef = network.graph.inports[port];
          const process = network.getNode(portDef.process);
          inSockets[port] = internalSocket.createSocket();
          process.component.inPorts[portDef.port].attach(inSockets[port]);
        }
        try {
          if (IP.isIP(value)) {
            inSockets[port].post(value);
            continue;
          }
          inSockets[port].post(new IP('data', value));
        } catch (e) {
          callback(e);
          network.removeListener('process-error', onError);
          network.removeListener('end', onEnd);
          return;
        }
      }
    }
  });
};

var getType = function (inputs, network) {
  // Scalar values are always simple inputs
  if (typeof inputs !== 'object') { return 'simple'; }

  if (Array.isArray(inputs)) {
    const maps = inputs.filter((entry) => getType(entry, network) === 'map');
    // If each member if the array is an input map, this is a sequence
    if (maps.length === inputs.length) { return 'sequence'; }
    // Otherwise arrays must be simple inputs
    return 'simple';
  }

  // Empty objects can't be maps
  if (!Object.keys(inputs).length) { return 'simple'; }
  for (const key in inputs) {
    const value = inputs[key];
    if (!network.graph.inports[key]) { return 'simple'; }
  }
  return 'map';
};

const prepareInputMap = function (inputs, inputType, network) {
  // Sequence we can use as-is
  if (inputType === 'sequence') { return inputs; }
  // We can turn a map to a sequence by wrapping it in an array
  if (inputType === 'map') { return [inputs]; }
  // Simple inputs need to be converted to a sequence
  let inPort = Object.keys(network.graph.inports)[0];
  // If we have a port named "IN", send to that
  if (network.graph.inports.in) { inPort = 'in'; }
  const map = {};
  map[inPort] = inputs;
  return [map];
};

const normalizeOutput = function (values, options) {
  if (options.raw) { return values; }
  const result = [];
  let previous = null;
  let current = result;
  for (const packet of Array.from(values)) {
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
  }
  if (result.length === 1) {
    return result[0];
  }
  return result;
};

const sendOutputMap = function (outputs, resultType, options, callback) {
  // First check if the output sequence contains errors
  const errors = outputs.filter((map) => map.error != null).map((map) => map.error);
  if (errors.length) {
    callback(normalizeOutput(errors, options));
    return;
  }

  if (resultType === 'sequence') {
    callback(null, outputs.map((map) => {
      const res = {};
      for (const key in map) {
        const val = map[key];
        if (options.raw) {
          res[key] = val;
          continue;
        }
        res[key] = normalizeOutput([val], options);
      }
      return res;
    }));
    return;
  }

  // Flatten the sequence
  const mappedOutputs = {};
  for (const map of Array.from(outputs)) {
    for (const key in map) {
      const val = map[key];
      if (!mappedOutputs[key]) { mappedOutputs[key] = []; }
      mappedOutputs[key].push(val);
    }
  }

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
  for (const port in mappedOutputs) {
    const packets = mappedOutputs[port];
    result[port] = normalizeOutput(packets, options);
  }
  callback(null, result);
};

exports.asCallback = function (component, options) {
  options = normalizeOptions(options, component);
  return function (inputs, callback) {
    prepareNetwork(component, options, (err, network) => {
      if (err) {
        callback(err);
        return;
      }
      const resultType = getType(inputs, network);
      const inputMap = prepareInputMap(inputs, resultType, network);
      runNetwork(network, inputMap, options, (err, outputMap) => {
        if (err) {
          callback(err);
          return;
        }
        sendOutputMap(outputMap, resultType, options, callback);
      });
    });
  };
};
