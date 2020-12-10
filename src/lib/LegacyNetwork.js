//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2018 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
import { BaseNetwork } from './BaseNetwork';
import { deprecated } from './Platform';

/* eslint-disable
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
export class LegacyNetwork extends BaseNetwork {
  // All NoFlo networks are instantiated with a graph. Upon instantiation
  // they will load all the needed components, instantiate them, and
  // set up the defined connections and IIPs.
  //
  // The legacy network will also listen to graph changes and modify itself
  // accordingly, including removing connections, adding new nodes,
  // and sending new IIPs.
  constructor(graph, options = {}) {
    deprecated('subscribeGraph: true is deprecated. Live-edit network graphs via the network methods instead');
    super(graph, options);
  }

  /**
   * @callback ErrorableCallback
   * @param {Error|null} [err]
   * @returns {void}
   */
  /**
   * @param {ErrorableCallback} [callback]
   * @returns {Promise<this>}
   */
  connect(callback) {
    const promise = super.connect()
      .then(() => {
        this.subscribeGraph();
        return this;
      });
    if (callback) {
      deprecated('Providing a callback to Network.connect is deprecated, use Promises');
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  // A NoFlo graph may change after network initialization.
  // For this, the legacy network subscribes to the change events
  // from the graph.
  //
  // In graph we talk about nodes and edges. Nodes correspond
  // to NoFlo processes, and edges to connections between them.
  subscribeGraph() {
    const graphOps = [];
    let processing = false;
    const registerOp = (op, details) => {
      graphOps.push({
        op,
        details,
      });
    };
    const processOps = (err) => {
      if (err) {
        if (this.listeners('process-error').length === 0) { throw err; }
        this.bufferedEmit('process-error', err);
      }

      if (!graphOps.length) {
        processing = false;
        return;
      }
      processing = true;
      const op = graphOps.shift();
      const cb = processOps;
      switch (op.op) {
        case 'renameNode':
          this.renameNode(op.details.from, op.details.to, cb);
          break;
        default:
          this[op.op](op.details, cb);
      }
    };

    this.graph.on('addNode', (node) => {
      registerOp('addNode', node);
      if (!processing) { processOps(); }
    });
    this.graph.on('removeNode', (node) => {
      registerOp('removeNode', node);
      if (!processing) { processOps(); }
    });
    this.graph.on('renameNode', (oldId, newId) => {
      registerOp('renameNode', {
        from: oldId,
        to: newId,
      });
      if (!processing) { processOps(); }
    });
    this.graph.on('addEdge', (edge) => {
      registerOp('addEdge', edge);
      if (!processing) { processOps(); }
    });
    this.graph.on('removeEdge', (edge) => {
      registerOp('removeEdge', edge);
      if (!processing) { processOps(); }
    });
    this.graph.on('addInitial', (iip) => {
      registerOp('addInitial', iip);
      if (!processing) { processOps(); }
    });
    return this.graph.on('removeInitial', (iip) => {
      registerOp('removeInitial', iip);
      if (!processing) { processOps(); }
    });
  }
}
