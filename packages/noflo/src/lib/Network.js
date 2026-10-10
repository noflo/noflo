//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./Network.d.ts" */
import { sameRef } from "@noflo/graph";
import { BaseNetwork } from "./BaseNetwork.js";

/* eslint-disable
    no-param-reassign,
    import/prefer-default-export,
*/

/**
 * @typedef NetworkProcess
 * @property {string} id
 * @property {string} [componentName]
 * @property {import("./Component.js").Component} [component]
 */

/**
 * The NoFlo network coordinator.
 *
 * NoFlo networks consist of processes connected to each other via sockets
 * attached from outports to inports. The role of the network coordinator is
 * to take a graph and instantiate all the necessary processes from the
 * designated components, attach sockets between them, and handle the sending
 * of Initial Information Packets.
 */
export class Network extends BaseNetwork {
  /**
   * Add a process to the network. The node will also be registered with the
   * current graph.
   *
   * @param {import("@noflo/graph").GraphNode} node
   * @param {Object} [options]
   * @returns {Promise<NetworkProcess>}
   */
  addNode(node, options = {}) {
    return super.addNode(node, options).then((process) => {
      if (!options.initial && !this.graph.hasNode(node.entity_id)) {
        this.graph.addNode(node);
      }
      return process;
    });
  }

  /**
   * Remove a process from the network. The node will also be removed from
   * the current graph.
   *
   * @param {import("@noflo/graph").GraphNode} node
   * @returns {Promise<void>}
   */
  removeNode(node) {
    return super.removeNode(node).then(() => {
      this.graph.removeNode(node.entity_id);
    });
  }

  /**
   * Rename a process in the network. Renaming a process also modifies the
   * current graph.
   *
   * @param {string} oldId
   * @param {string} newId
   * @returns {Promise<void>}
   */
  renameNode(oldId, newId) {
    return super.renameNode(oldId, newId).then(() => {
      this.graph.renameNode(oldId, newId);
    });
  }

  /**
   * Add a connection to the network. The edge will also be registered with
   * the current graph.
   *
   * @param {import("@noflo/graph").GraphEdge} edge
   * @param {Object} [options]
   * @returns {Promise<import("./InternalSocket.js").InternalSocket>}
   */
  addEdge(edge, options = {}) {
    return super.addEdge(edge, options).then((socket) => {
      if (!options.initial) {
        this.graph.addEdge({
          from: edge.from,
          to: edge.to,
          ...(edge.metadata === undefined ? {} : { metadata: edge.metadata }),
        });
      }
      return socket;
    });
  }

  /**
   * Remove a connection from the network. The edge will also be removed
   * from the current graph.
   *
   * @param {import("@noflo/graph").GraphEdge} edge
   * @returns {Promise<void>}
   */
  removeEdge(edge) {
    return super.removeEdge(edge).then(() => {
      this.removeGraphEdge(edge);
    });
  }

  /**
   * Add an IIP to the network. The IIP will also be registered with the
   * current graph. If the network is running, the IIP will be sent
   * immediately.
   *
   * @param {import("@noflo/graph").GraphIIP} iip
   * @param {Object} [options]
   * @returns {Promise<import("./InternalSocket.js").InternalSocket>}
   */
  addInitial(iip, options = {}) {
    return super.addInitial(iip, options).then((socket) => {
      if (!options.initial) {
        this.graph.addIIP({
          data: iip.from.data,
          to: iip.to,
          ...(iip.metadata === undefined ? {} : { metadata: iip.metadata }),
        });
      }
      return socket;
    });
  }

  /**
   * Remove an IIP from the network. The IIP will also be removed from the
   * current graph.
   *
   * @param {import("@noflo/graph").GraphIIP} iip
   * @returns {Promise<void>}
   */
  removeInitial(iip) {
    return super.removeInitial(iip).then(() => {
      this.removeGraphIIP(iip);
    });
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
