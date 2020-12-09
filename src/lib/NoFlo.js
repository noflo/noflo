//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
//
// NoFlo is a Flow-Based Programming environment for JavaScript. This file provides the
// main entry point to the NoFlo network.
//
// Find out more about using NoFlo from <http://noflojs.org/documentation/>

/* eslint-disable
    no-param-reassign,
    import/first
*/

// ## Main APIs
//
// ### Graph interface
//
// [fbp-graph](https://github.com/flowbased/fbp-graph) is used for instantiating FBP graph definitions.
import { graph } from 'fbp-graph';

// ## Network instantiation
//
// This function handles instantiation of NoFlo networks from a Graph object. It creates
// the network, and then starts execution by sending the Initial Information Packets.
//
//     const network = await noflo.createNetwork(someGraph, {});
//     console.log('Network is now running!');
//
// It is also possible to instantiate a Network but delay its execution by giving the
// third `delay` option. In this case you will have to handle connecting the graph and
// sending of IIPs manually.
//
//     noflo.createNetwork(someGraph, {
//       delay: true,
//     })
//       .then((network) => network.connect())
//       .then((network) => network.start())
//       .then(() => {
//         console.log('Network is now running!');
//       });
//
// ### Network options
//
// It is possible to pass some options to control the behavior of network creation:
//
// * `baseDir`: (default: cwd) Project base directory used for component loading
// * `componentLoader`: (default: NULL) NoFlo ComponentLoader instance to use for the
//   network. New one will be instantiated for the baseDir if this is not given.
// * `delay`: (default: FALSE) Whether the network should be started later. Defaults to
//   immediate execution
// * `flowtrace`: (default: NULL) Flowtrace instance to create a retroactive debugging
//   trace of the network run.
// * `subscribeGraph`: (default: FALSE) Whether the network should monitor the underlying
//   graph for changes
//
// Options can be passed as a second argument before the callback:
//
//     noflo.createNetwork(someGraph, options, callback);
//
// The options object can also be used for setting ComponentLoader options in this
// network.
import { Network } from './Network';
import { LegacyNetwork } from './LegacyNetwork';
import { deprecated } from './Platform';

export {
  graph,
  Graph,
  journal,
  Journal,
} from 'fbp-graph';

// ### Platform detection
//
// NoFlo works on both Node.js and the browser. Because some dependencies are different,
// we need a way to detect which we're on.
export { isBrowser } from './Platform';

// ### Component Loader
//
// The [ComponentLoader](../ComponentLoader/) is responsible for finding and loading
// NoFlo components. Component Loader uses [fbp-manifest](https://github.com/flowbased/fbp-manifest)
// to find components and graphs by traversing the NPM dependency tree from a given root
// directory on the file system.
export { ComponentLoader } from './ComponentLoader';

// ### Component baseclasses
//
// These baseclasses can be used for defining NoFlo components.
export { Component } from './Component';

// ### NoFlo ports
//
// These classes are used for instantiating ports on NoFlo components.
export { InPorts, OutPorts } from './Ports';

export { default as InPort } from './InPort';
export { default as OutPort } from './OutPort';

// ### NoFlo sockets
//
// The NoFlo [internalSocket](InternalSocket.html) is used for connecting ports of
// different components together in a network.
import * as internalSocket from './InternalSocket';

export { internalSocket };

// ### Information Packets
//
// NoFlo Information Packets are defined as "IP" objects.
export { default as IP } from './IP';

/**
 * @callback NetworkCallback
 * @param {Error | null} err
 * @param {Network|LegacyNetwork} [network]
 */

/**
 * @param {import("fbp-graph").Graph} graphInstance - Graph definition to build a Network for
 * @param {Object} options - Network options
 * @param {string} [options.baseDir] - Project base directory for component loading
 * @param {import("./ComponentLoader").ComponentLoader} [options.componentLoader]
 * @param {Object} [options.flowtrace] - Flowtrace instance to use for tracing this network run
 * @param {boolean} [options.subscribeGraph] - Whether the Network should monitor the graph
 * @param {boolean} [options.delay] - Whether the Network should be started later
 * @param {NetworkCallback} [callback] - Legacy callback for the created Network
 * @returns {Promise<Network|LegacyNetwork>}
 */
export function createNetwork(graphInstance, options, callback) {
  if (typeof options !== 'object') {
    options = {};
  }
  if (typeof options.subscribeGraph === 'undefined') {
    options.subscribeGraph = false;
  }

  // Choose legacy or modern network based on whether graph
  // subscription is needed
  const NetworkType = options.subscribeGraph ? LegacyNetwork : Network;
  const network = new NetworkType(graphInstance, options);

  // Ensure components are loaded before continuing
  const promise = network.loader.listComponents()
    .then(() => {
      if (options.delay) {
        // In case of delayed execution we don't wire it up
        return Promise.resolve(network);
      }
      const connected = /** @type {Promise<Network|LegacyNetwork>} */ (network.connect());
      return connected.then(() => network.start());
    });
  if (callback) {
    deprecated('Providing a callback to NoFlo.createNetwork is deprecated, use Promises');
    promise.then((nw) => {
      callback(null, nw);
    }, callback);
  }
  return promise;
}

// ### Starting a network from a file
//
// It is also possible to start a NoFlo network by giving it a path to a `.json` or `.fbp` network
// definition file.
//
//     noflo.loadFile('somefile.json', {})
//       .then((network) => {
//         console.log('Network is now running!');
//       });
/**
 * @param {string} file
 * @param {Object} options
 * @param {any} [callback] - Legacy callback
 * @returning {Promise<Network>}
 */
export function loadFile(file, options, callback) {
  const promise = graph.loadFile(file)
    .then((graphInstance) => createNetwork(graphInstance, options));
  if (callback) {
    deprecated('Providing a callback to NoFlo.loadFile is deprecated, use Promises');
    promise.then((network) => {
      callback(null, network);
    }, callback);
  }
  return promise;
}

// ### Saving a network definition
//
// NoFlo graph files can be saved back into the filesystem with this method.
/**
 * @param {graph.Graph} graphInstance
 * @param {string} file
 * @param {any} [callback] - Legacy callback
 * @returning {Promise<string>}
 */
export function saveFile(graphInstance, file, callback) {
  return graphInstance.save(file, callback);
}

// ## Embedding NoFlo in existing JavaScript code
//
// The `asCallback` helper provides an interface to wrap NoFlo components
// or graphs into existing JavaScript code.
//
//     // Produce an asynchronous function wrapping a NoFlo graph
//     var wrapped = noflo.asCallback('myproject/MyGraph');
//
//     // Call the function, providing input data and a callback for output data
//     wrapped({
//       in: 'data'
//     }, function (err, results) {
//       // Do something with results
//     });
//
export { asCallback, asPromise } from './AsCallback';

// ## Generating components from JavaScript functions
//
// The `asComponent` helper makes it easy to expose a JavaScript function as a
// NoFlo component. All input arguments become input ports, and the function's
// result will be sent to either `out` or `error` port.
//
//     exports.getComponent = function () {
//       return noflo.asComponent(Math.random, {
//         description: 'Generate a random number',
//       });
//     };
//
export { asComponent } from './AsComponent';
