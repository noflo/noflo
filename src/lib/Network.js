//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
import { BaseNetwork } from './BaseNetwork';

/* eslint-disable
    no-param-reassign,
    import/prefer-default-export,
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
  addNode(node, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    super.addNode(node, options, (err, process) => {
      if (err) {
        callback(err);
        return;
      }
      if (!options.initial) {
        this.graph.addNode(node.id, node.component, node.metadata);
      }
      callback(null, process);
    });
  }

  // Remove a process from the network. The node will also be removed
  // from the current graph.
  removeNode(node, callback) {
    super.removeNode(node, (err) => {
      if (err) {
        callback(err);
        return;
      }
      this.graph.removeNode(node.id);
      callback();
    });
  }

  // Rename a process in the network. Renaming a process also modifies
  // the current graph.
  renameNode(oldId, newId, callback) {
    super.renameNode(oldId, newId, (err) => {
      if (err) {
        callback(err);
        return;
      }
      this.graph.renameNode(oldId, newId);
      callback();
    });
  }

  // Add a connection to the network. The edge will also be registered
  // with the current graph.
  addEdge(edge, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    super.addEdge(edge, options, (err) => {
      if (err) {
        callback(err);
        return;
      }
      if (!options.initial) {
        this.graph.addEdgeIndex(
          edge.from.node,
          edge.from.port,
          edge.from.index,
          edge.to.node,
          edge.to.port,
          edge.to.index,
          edge.metadata,
        );
      }
      callback();
    });
  }

  // Remove a connection from the network. The edge will also be removed
  // from the current graph.
  removeEdge(edge, callback) {
    super.removeEdge(edge, (err) => {
      if (err) {
        callback(err);
        return;
      }
      this.graph.removeEdge(edge.from.node, edge.from.port, edge.to.node, edge.to.port);
      callback();
    });
  }

  // Add an IIP to the network. The IIP will also be registered with the
  // current graph. If the network is running, the IIP will be sent immediately.
  addInitial(iip, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    super.addInitial(iip, options, (err) => {
      if (err) {
        callback(err);
        return;
      }
      if (!options.initial) {
        this.graph.addInitialIndex(
          iip.from.data,
          iip.to.node,
          iip.to.port,
          iip.to.index,
          iip.metadata,
        );
      }
      callback();
    });
  }

  // Remove an IIP from the network. The IIP will also be removed from the
  // current graph.
  removeInitial(iip, callback) {
    super.removeInitial(iip, (err) => {
      if (err) {
        callback(err);
        return;
      }
      this.graph.removeInitial(iip.to.node, iip.to.port);
      callback();
    });
  }
}
