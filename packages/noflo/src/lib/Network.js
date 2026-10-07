//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
import { sameRef } from "@noflo/graph";
import { BaseNetwork } from "./BaseNetwork.js";
import { deprecated } from "./Platform.js";

/* eslint-disable
    no-param-reassign,
    import/prefer-default-export,
*/

/**
 * @typedef NetworkProcess
 * @property {string} id
 * @property {string} [componentName]
 * @property {import("./Component").Component} [component]
 */

// ## The NoFlo network coordinator
//
// NoFlo networks consist of processes connected to each other
// via sockets attached from outports to inports.
//
// The role of the network coordinator is to take a graph and
// instantiate all the necessary processes from the designated
// components, attach sockets between them, and handle the sending
// of Initial Information Packets.
export class Network extends BaseNetwork {
  // Add a process to the network. The node will also be registered
  // with the current graph.
  /**
   * @param {import("@noflo/graph").GraphNode} node
   * @param {Object} options
   * @returns {Promise<NetworkProcess>}
   */
  addNode(node, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    options = options || {};
    const promise = super.addNode(node, options).then((process) => {
      if (!options.initial && !this.graph.hasNode(node.entity_id)) {
        this.graph.addNode(node);
      }
      return process;
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.addNode is deprecated, use Promises",
      );
      promise.then((process) => {
        callback(null, process);
      }, callback);
    }
    return promise;
  }

  // Remove a process from the network. The node will also be removed
  // from the current graph.
  removeNode(node, callback) {
    const promise = super.removeNode(node).then(() => {
      this.graph.removeNode(node.entity_id);
      return null;
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.removeNode is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  // Rename a process in the network. Renaming a process also modifies
  // the current graph.
  renameNode(oldId, newId, callback) {
    const promise = super.renameNode(oldId, newId).then(() => {
      this.graph.renameNode(oldId, newId);
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.renameNode is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  // Add a connection to the network. The edge will also be registered
  // with the current graph.
  addEdge(edge, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    options = options || {};
    const promise = super.addEdge(edge, options).then((socket) => {
      if (!options.initial) {
        this.graph.addEdge({
          from: edge.from,
          to: edge.to,
          ...(edge.metadata === undefined ? {} : { metadata: edge.metadata }),
        });
      }
      return socket;
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.addEdge is deprecated, use Promises",
      );
      promise.then((socket) => {
        callback(null, socket);
      }, callback);
    }
    return promise;
  }

  // Remove a connection from the network. The edge will also be removed
  // from the current graph.
  removeEdge(edge, callback) {
    const promise = super.removeEdge(edge).then(() => {
      this.removeGraphEdge(edge);
      return null;
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.removeEdge is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  // Add an IIP to the network. The IIP will also be registered with the
  // current graph. If the network is running, the IIP will be sent immediately.
  addInitial(iip, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    options = options || {};
    const promise = super.addInitial(iip, options).then((socket) => {
      if (!options.initial) {
        this.graph.addIIP({
          data: iip.from.data,
          to: iip.to,
          ...(iip.metadata === undefined ? {} : { metadata: iip.metadata }),
        });
      }
      return socket;
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.addInitial is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  // Remove an IIP from the network. The IIP will also be removed from the
  // current graph.
  removeInitial(iip, callback) {
    const promise = super.removeInitial(iip).then(() => {
      this.removeGraphIIP(iip);
    });
    if (callback) {
      deprecated(
        "Providing a callback to Network.removeInitial is deprecated, use Promises",
      );
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  /**
   * Remove the edge matching the given connection from the graph.
   *
   * @param {import("@noflo/graph").GraphEdge} edge
   * @returns {void}
   */
  removeGraphEdge(edge) {
    const match = this.graph
      .edges()
      .find(
        (candidate) =>
          sameRef(candidate.from, edge.from) && sameRef(candidate.to, edge.to),
      );
    if (!match) {
      throw new Error(
        `No edge from ${edge.from.node}:${edge.from.port} to ${edge.to.node}:${edge.to.port} to remove`,
      );
    }
    this.graph.removeEdge(match.entity_id);
  }

  /**
   * Remove the IIP matching the given initializer from the graph.
   *
   * @param {import("@noflo/graph").GraphIIP} iip
   * @returns {void}
   */
  removeGraphIIP(iip) {
    const match = this.graph
      .iips()
      .find((candidate) => sameRef(candidate.to, iip.to));
    if (!match) {
      throw new Error(
        `No IIP targeting ${iip.to.node}:${iip.to.port} to remove`,
      );
    }
    this.graph.removeIIP(match.entity_id);
  }
}
