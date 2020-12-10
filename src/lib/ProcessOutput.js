//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2020 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable no-underscore-dangle */
import debug from 'debug';
import IP from './IP';

const debugComponent = debug('noflo:component');

// Checks if a value is an Error
/**
 * @param {any} err
 * @returns {boolean}
 */
function isError(err) {
  return err instanceof Error
    || (Array.isArray(err) && (err.length > 0) && err[0] instanceof Error);
}

export default class ProcessOutput {
  /**
   * @param {import("./Ports").OutPorts} ports - Component outports
   * @param {import("./ProcessContext").default} context - Processing context
   */
  constructor(ports, context) {
    this.ports = ports;
    this.context = context;
    this.nodeInstance = this.context.nodeInstance;
    this.ip = this.context.ip;
    this.result = this.context.result;
    this.scope = this.context.scope;
  }

  // Sends an error object
  /**
   * @param {Error|Error[]} err
   * @returns {void}
   */
  error(err) {
    const errs = Array.isArray(err) ? err : [err];
    if (this.ports.ports.error
      && (this.ports.ports.error.isAttached() || !this.ports.ports.error.isRequired())) {
      if (errs.length > 1) { this.sendIP('error', new IP('openBracket')); }
      errs.forEach((e) => { this.sendIP('error', e); });
      if (errs.length > 1) { this.sendIP('error', new IP('closeBracket')); }
    } else {
      errs.forEach((e) => { throw e; });
    }
  }

  // Sends a single IP object to a port
  /**
   * @param {string} port - Port to send to
   * @param {IP|any} packet - IP or data to send
   * @returns {void}
   */
  sendIP(port, packet) {
    const ip = IP.isIP(packet) ? packet : new IP('data', packet);
    if ((this.scope !== null) && (ip.scope === null)) { ip.scope = this.scope; }

    if (!this.nodeInstance.outPorts.ports[port]) {
      throw new Error(`Node ${this.nodeInstance.nodeId} does not have outport ${port}`);
    }

    // eslint-disable-next-line max-len
    const portImpl = /** @type {import("./OutPort").default} */ (this.nodeInstance.outPorts.ports[port]);

    if (portImpl.isAddressable() && (ip.index === null)) {
      throw new Error(`Sending packets to addressable port ${this.nodeInstance.nodeId} ${port} requires specifying index`);
    }

    if (this.nodeInstance.isOrdered()) {
      this.nodeInstance.addToResult(this.result, port, ip);
      return;
    }
    if (!portImpl.options.scoped) {
      ip.scope = null;
    }
    portImpl.sendIP(ip);
  }

  // Sends packets for each port as a key in the map
  // or sends Error or a list of Errors if passed such
  /**
   * @param {Error|Array<Error>|Object<string, any>} outputMap
   */
  send(outputMap) {
    if (isError(outputMap)) {
      const errors = /** @type {Error|Array<Error>} */ (outputMap);
      this.error(errors);
      return;
    }

    /** @type {Array<string>} */
    const componentPorts = [];
    let mapIsInPorts = false;
    Object.keys(this.ports.ports).forEach((port) => {
      if ((port !== 'error') && (port !== 'ports') && (port !== '_callbacks')) { componentPorts.push(port); }
      if (!mapIsInPorts && (outputMap != null) && (typeof outputMap === 'object') && (Object.keys(outputMap).indexOf(port) !== -1)) {
        mapIsInPorts = true;
      }
    });

    if ((componentPorts.length === 1) && !mapIsInPorts) {
      this.sendIP(componentPorts[0], outputMap);
      return;
    }

    if ((componentPorts.length > 1) && !mapIsInPorts) {
      throw new Error('Port must be specified for sending output');
    }

    Object.keys(outputMap).forEach((port) => {
      const packet = outputMap[port];
      this.sendIP(port, packet);
    });
  }

  // Sends the argument via `send()` and marks activation as `done()`
  /**
   * @param {Error|Array<Error>|Object<string, any>} outputMap
   */
  sendDone(outputMap) {
    this.send(outputMap);
    this.done();
  }

  // Makes a map-style component pass a result value to `out`
  // keeping all IP metadata received from `in`,
  // or modifying it if `options` is provided
  /**
   * @param {any} data
   * @param {Object<string, any>} [options]
   */
  pass(data, options = {}) {
    if (!('out' in this.ports)) {
      throw new Error('output.pass() requires port "out" to be present');
    }
    const that = this;
    Object.keys(options).forEach((key) => {
      const val = options[key];
      that.ip[key] = val;
    });
    this.ip.data = data;
    this.sendIP('out', this.ip);
    this.done();
  }

  // Finishes process activation gracefully
  /**
   * @param {Error|Array<Error>} [error]
   */
  done(error) {
    this.result.__resolved = true;
    this.nodeInstance.activate(this.context);
    if (error) { this.error(error); }

    const isLast = () => {
      // We only care about real output sets with processing data
      const resultsOnly = this.nodeInstance.outputQ.filter((q) => {
        if (!q.__resolved) { return true; }
        if ((Object.keys(q).length === 2) && q.__bracketClosingAfter) {
          return false;
        }
        return true;
      });
      const pos = resultsOnly.indexOf(this.result);
      const len = resultsOnly.length;
      const {
        load,
      } = this.nodeInstance;
      if (pos === (len - 1)) { return true; }
      if ((pos === -1) && (load === (len + 1))) { return true; }
      if ((len <= 1) && (load === 1)) { return true; }
      return false;
    };
    if (this.nodeInstance.isOrdered() && isLast()) {
      // We're doing bracket forwarding. See if there are
      // dangling closeBrackets in buffer since we're the
      // last running process function.
      Object.keys(this.nodeInstance.bracketContext.in).forEach((port) => {
        const contexts = this.nodeInstance.bracketContext.in[port];
        if (!contexts[this.scope]) { return; }
        const nodeContext = contexts[this.scope];
        if (!nodeContext.length) { return; }
        const context = nodeContext[nodeContext.length - 1];
        // eslint-disable-next-line max-len
        const inPorts = /** @type {import("./InPort").default} */ (this.nodeInstance.inPorts.ports[context.source]);
        const buf = inPorts.getBuffer(context.ip.scope, context.ip.index);
        while (buf.length > 0 && buf[0].type === 'closeBracket') {
          const ip = inPorts.get(context.ip.scope, context.ip.index);
          const ctx = nodeContext.pop();
          ctx.closeIp = ip;
          if (!this.result.__bracketClosingAfter) { this.result.__bracketClosingAfter = []; }
          this.result.__bracketClosingAfter.push(ctx);
        }
      });
    }

    debugComponent(`${this.nodeInstance.nodeId} finished processing ${this.nodeInstance.load}`);

    this.nodeInstance.deactivate(this.context);
  }
}
