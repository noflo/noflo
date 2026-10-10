/**
 * @module @noflo/noflo
 * @description NoFlo is a Flow-Based Programming environment for JavaScript. This
 *   module provides the main entry point to the NoFlo network.
 *
 *   Find out more about using NoFlo from <http://noflojs.org/documentation/>
 */

/* @ts-self-types="./NoFlo.d.ts" */

//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    no-param-reassign,
    import/first
*/

import { exportFbpJson, GraphModel, importFbpJson } from "@noflo/graph";
// ## Main APIs
//
// ### Graph interface
//
// Graphs are instances of the native `@noflo/graph` model (work document #10).
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
// * `componentLoader`: (default: NULL) NoFlo ComponentLoader instance to use for the
//   network. New one will be instantiated from the `registry` option if this is not given.
// * `registry`: (default: NULL) Application-supplied component registry used for
//   component loading, when no componentLoader is given.
// * `delay`: (default: FALSE) Whether the network should be started later. Defaults to
//   immediate execution
// * `flowtrace`: (default: NULL) Flowtrace instance to create a retroactive debugging
//   trace of the network run.
// * `asyncDelivery`: (default: FALSE) Whether Information Packets should be
//   delivered asynchronously.
//
// Options can be passed as a second argument before the callback:
//
//     noflo.createNetwork(someGraph, options, callback);
//
// The options object can also be used for setting ComponentLoader options in this
// network.
import { Network } from "./Network.js";
import { isBrowser } from "./Platform.js";

// ### Native graph model
//
// The native `@noflo/graph` model is the 2.x core data model, also available
// as a standalone package for protocol runtimes and tooling.
export { exportFbpJson, GraphModel, importFbpJson } from "@noflo/graph";
// ### Component Loader
//
// The [ComponentLoader](../ComponentLoader/) is responsible for instantiating
// NoFlo components. It consumes an application-supplied component registry;
// platform-specific discovery is provided by registry implementations like
// [@noflo/loader-node](https://jsr.io/@noflo/loader-node).
export { ComponentLoader } from "./ComponentLoader.js";
// ### Network
//
// The Network class, for runtimes and tools that build on the engine
// directly (1.x exported it; the 2.x native-graph model keeps that surface).
export { Network } from "./Network.js";
// ### Platform detection
//
// NoFlo works on both Node.js and the browser. Because some dependencies are different,
// we need a way to detect which we're on.
export { isBrowser } from "./Platform.js";

import { ComponentLoader } from "./ComponentLoader.js";

// ### Component baseclasses
//
// These baseclasses can be used for defining NoFlo components.
export { Component } from "./Component.js";

import { Component } from "./Component.js";

// ### NoFlo ports
//
// These classes are used for instantiating ports on NoFlo components.
export { InPorts, OutPorts } from "./Ports.js";

import { InPorts, OutPorts } from "./Ports.js";

export { default as InPort } from "./InPort.js";

import InPort from "./InPort.js";

export { default as OutPort } from "./OutPort.js";

// ### NoFlo sockets
//
// The NoFlo [internalSocket](InternalSocket.html) is used for connecting ports of
// different components together in a network.
import * as internalSocket from "./InternalSocket.js";
import OutPort from "./OutPort.js";

// ### Information Packets
//
// NoFlo Information Packets are defined as "IP" objects.
export { default as IP } from "./IP.js";
export { internalSocket };

import IP from "./IP.js";

/**
 * @typedef CreateNetworkOptions
 * @property {boolean} [delay] - Whether the Network should be started later
 */

/**
 * @typedef { CreateNetworkOptions & import("./BaseNetwork.js").NetworkOptions} NetworkOptions
 */

/**
 * @param {import("@noflo/graph").GraphModel} graphInstance - Graph definition to build a Network for
 * @param {NetworkOptions} [options] - Network options
 * @returns {Promise<Network>}
 */
export function createNetwork(graphInstance, options = {}) {
  const network = new Network(graphInstance, options);

  // Ensure components are loaded before continuing
  const promise = network.loader.listComponents().then(() => {
    if (options.delay) {
      // In case of delayed execution we don't wire it up
      return Promise.resolve(network);
    }
    const connected = /** @type {Promise<Network>} */ (network.connect());
    return connected.then(
      () => /** @type {Promise<Network>} */ (network.start()),
    );
  });
  return promise;
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
export { asCallback, asPromise } from "./AsCallback.js";

import { asCallback, asPromise } from "./AsCallback.js";

export default {
  isBrowser,
  GraphModel,
  importFbpJson,
  exportFbpJson,
  ComponentLoader,
  Component,
  InPorts,
  OutPorts,
  InPort,
  OutPort,
  internalSocket,
  IP,
  createNetwork,
  asCallback,
  asPromise,
};
