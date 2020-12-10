//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

/* eslint-disable
    class-methods-use-this,
    no-underscore-dangle,
    import/prefer-default-export,
*/
import { EventEmitter } from 'events';
import debug from 'debug';
import { InPorts, OutPorts, normalizePortName } from './Ports';
import { deprecated } from './Platform';
import InPort from './InPort'; // eslint-disable-line no-unused-vars
import OutPort from './OutPort'; // eslint-disable-line no-unused-vars
import ProcessContext from './ProcessContext';
import ProcessInput from './ProcessInput';
import ProcessOutput from './ProcessOutput';
import IP from './IP'; // eslint-disable-line no-unused-vars

const debugComponent = debug('noflo:component');
const debugBrackets = debug('noflo:component:brackets');
const debugSend = debug('noflo:component:send');

/**
 * @callback ProcessingFunction
 * @param {ProcessInput} input
 * @param {ProcessOutput} output
 * @param {ProcessContext} context
 * @returns {Promise<any> | void}
 */

/**
 * @typedef ComponentOptions
 * @property {import("./Ports").InPortsOptions | InPorts} [inPorts] - Inports for the component
 * @property {import("./Ports").OutPortsOptions | OutPorts} [outPorts] - Outports for the component
 * @property {string} [icon]
 * @property {string} [description]
 * @property {ProcessingFunction} [options.process] - Component processsing function
 * @property {boolean} [ordered] - Whether component should send
 * packets in same order it received them
 * @property {boolean} [autoOrdering]
 * @property {boolean} [activateOnInput] - Whether component should
 * activate when it receives packets
 * @property {Object<string, Array<string>>} [forwardBrackets] - Mappings of forwarding ports
 */

/**
 * @typedef BracketContext
 * @property {Object<string,Object>} in
 * @property {Object<string,Object>} out
 */

// eslint-disable-next-line max-len
/** @typedef {{ __resolved?: boolean, __bracketClosingAfter?: BracketContext[], [key: string]: any }} ProcessResult */

// ## NoFlo Component Base class
//
// The `noflo.Component` interface provides a way to instantiate
// and extend NoFlo components.
export class Component extends EventEmitter {
  /**
   * @param {ComponentOptions} [options]
   */
  constructor(options = { }) {
    super();
    const opts = options;
    // Prepare inports, if any were given in options.
    // They can also be set up imperatively after component
    // instantiation by using the `component.inPorts.add`
    // method.
    if (!opts.inPorts) { opts.inPorts = {}; }
    if (opts.inPorts instanceof InPorts) {
      this.inPorts = opts.inPorts;
    } else {
      this.inPorts = new InPorts(opts.inPorts);
    }

    // Prepare outports, if any were given in opts.
    // They can also be set up imperatively after component
    // instantiation by using the `component.outPorts.add`
    // method.
    if (!opts.outPorts) { opts.outPorts = {}; }
    if (opts.outPorts instanceof OutPorts) {
      this.outPorts = opts.outPorts;
    } else {
      this.outPorts = new OutPorts(opts.outPorts);
    }

    // Set the default component icon and description
    this.icon = opts.icon ? opts.icon : '';
    this.description = opts.description ? opts.description : '';

    /** @type {string|null} */
    this.componentName = null;
    /** @type {string|null} */
    this.baseDir = null;

    // Initially the component is not started
    this.started = false;
    this.load = 0;

    // Whether the component should keep send packets
    // out in the order they were received
    this.ordered = opts.ordered != null ? opts.ordered : false;
    this.autoOrdering = opts.autoOrdering != null ? opts.autoOrdering : null;

    // Queue for handling ordered output packets
    /** @type {ProcessResult[]} */
    this.outputQ = [];

    // Context used for bracket forwarding
    /** @type {BracketContext} */
    this.bracketContext = {
      in: {},
      out: {},
    };

    // Whether the component should activate when it
    // receives packets
    this.activateOnInput = opts.activateOnInput != null ? opts.activateOnInput : true;

    // Bracket forwarding rules. By default we forward
    // brackets from `in` port to `out` and `error` ports.
    if (!opts.forwardBrackets) {
      opts.forwardBrackets = { in: ['out', 'error'] };
    }
    this.forwardBrackets = opts.forwardBrackets;

    // The component's process function can either be
    // passed in opts, or given imperatively after
    // instantation using the `component.process` method.
    if (typeof opts.process === 'function') {
      this.process(opts.process);
    }

    // Placeholder for the ID of the current node, populated
    // by NoFlo network
    //
    /** @type string | null */
    this.nodeId = null;

    // Deprecated legacy component connection counter
    this.__openConnections = 0;
  }

  getDescription() { return this.description; }

  isReady() { return true; }

  isSubgraph() { return false; }

  /**
   * @param {string} icon - Updated icon for the component
   */
  setIcon(icon) {
    this.icon = icon;
    this.emit('icon', this.icon);
  }

  getIcon() { return this.icon; }

  // ### Error emitting helper
  //
  // If component has an `error` outport that is connected, errors
  // are sent as IP objects there. If the port is not connected,
  // errors are thrown.
  /**
   * @param {Error} e
   * @param {Array<string>} [groups]
   * @param {string} [errorPort]
   * @param {string | null} [scope]
   */
  error(e, groups = [], errorPort = 'error', scope = null) {
    const outPort = /** @type {OutPort} */ (this.outPorts.ports[errorPort]);
    if (outPort
      && (outPort.isAttached() || !outPort.isRequired())) {
      groups.forEach((group) => {
        outPort.openBracket(group, { scope });
      });
      outPort.data(e, { scope });
      groups.forEach((group) => {
        outPort.closeBracket(group, { scope });
      });
      return;
    }
    throw e;
  }

  /**
   * @callback ErrorableCallback
   * @param {Error | null} error
   */

  // ### Setup
  //
  // The setUp method is for component-specific initialization.
  // Called at network start-up.
  //
  // Override in component implementation to do component-specific
  // setup work.
  /**
   * @param {ErrorableCallback} callback - Callback for when teardown is ready
   * @returns {Promise<void> | void}
   */
  setUp(callback) {
    callback(null);
  }

  // ### Teardown
  //
  // The tearDown method is for component-specific cleanup. Called
  // at network shutdown
  //
  // Override in component implementation to do component-specific
  // cleanup work, like clearing any accumulated state.
  /**
   * @param {ErrorableCallback} callback - Callback for when teardown is ready
   * @returns {Promise<void> | void}
   */
  tearDown(callback) {
    callback(null);
  }

  // ### Start
  //
  // Called when network starts. This sets calls the setUp
  // method and sets the component to a started state.
  /**
   * @param {ErrorableCallback} [callback] - Callback for when shutdown is ready
   * @returns {Promise<void>}
   */
  start(callback) {
    let promise;
    if (this.isStarted()) {
      promise = Promise.resolve();
    } else {
      promise = new Promise((resolve, reject) => {
        const res = this.setUp((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
        if (res && res.then) {
          // setUp returned a Promise
          res.then(resolve, reject);
        }
      })
        .then(() => {
          this.started = true;
          this.emit('start');
          return Promise.resolve();
        });
    }
    if (callback) {
      deprecated('Providing a callback to Component.start is deprecated, use Promises');
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  // ### Shutdown
  //
  // Called when network is shut down. This sets calls the
  // tearDown method and sets the component back to a
  // non-started state.
  //
  // The callback is called when tearDown finishes and
  // all active processing contexts have ended.
  /**
   * @param {ErrorableCallback} [callback] - Callback for when shutdown is ready
   * @returns {Promise<void>}
   */
  shutdown(callback) {
    const promise = new Promise((resolve, reject) => {
      // Tell the component that it is time to shut down
      const res = this.tearDown((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
      if (res && res.then) {
        // Teardown returned a Promise
        res.then(resolve, reject);
      }
    })
      .then(() => new Promise((resolve) => {
        if (this.load > 0) {
          // Some in-flight processes, wait for them to finish
          /**
           * @param {number} load
           */
          const checkLoad = (load) => {
            if (load > 0) {
              return;
            }
            this.removeListener('deactivate', checkLoad);
            resolve();
          };
          this.on('deactivate', checkLoad);
          return;
        }
        resolve();
      }))
      .then(() => {
        // Clear contents of inport buffers
        const inPorts = this.inPorts.ports || this.inPorts;
        Object.keys(inPorts).forEach((portName) => {
          const inPort = /** @type {InPort} */ (inPorts[portName]);
          if (typeof inPort.clear !== 'function') { return; }
          inPort.clear();
        });
        // Clear bracket context
        this.bracketContext = {
          in: {},
          out: {},
        };
        if (!this.isStarted()) {
          return Promise.resolve();
        }
        this.started = false;
        this.emit('end');
        return Promise.resolve();
      });
    if (callback) {
      deprecated('Providing a callback to Component.shutdown is deprecated, use Promises');
      promise.then(() => {
        callback(null);
      }, callback);
    }
    return promise;
  }

  isStarted() {
    return this.started;
  }

  // Ensures bracket forwarding map is correct for the existing ports
  prepareForwarding() {
    Object.keys(this.forwardBrackets).forEach((inPort) => {
      const outPorts = this.forwardBrackets[inPort];
      if (!(inPort in this.inPorts.ports)) {
        delete this.forwardBrackets[inPort];
        return;
      }
      /** @type {Array<string>} */
      const tmp = [];
      outPorts.forEach((outPort) => {
        if (outPort in this.outPorts.ports) {
          tmp.push(outPort);
        }
      });
      if (tmp.length === 0) {
        delete this.forwardBrackets[inPort];
      } else {
        this.forwardBrackets[inPort] = tmp;
      }
    });
  }

  // Method for determining if a component is using the modern
  // NoFlo Process API
  isLegacy() {
    // Process API
    if (this.handle) { return false; }
    // Legacy
    return true;
  }

  // Sets process handler function
  /**
   * @param {ProcessingFunction} handle - Processing function
   * @returns {this}
   */
  process(handle) {
    if (typeof handle !== 'function') {
      throw new Error('Process handler must be a function');
    }
    if (!this.inPorts) {
      throw new Error('Component ports must be defined before process function');
    }
    this.prepareForwarding();
    this.handle = handle;
    Object.keys(this.inPorts.ports).forEach((name) => {
      const port = /** @type {InPort} */ (this.inPorts.ports[name]);
      if (!port.name) { port.name = name; }
      port.on('ip', (ip) => this.handleIP(ip, port));
    });
    return this;
  }

  // Method for checking if a given inport is set up for
  // automatic bracket forwarding
  /**
   * @param {InPort|string} port
   * @returns {boolean}
   */
  isForwardingInport(port) {
    let portName;
    if (typeof port === 'string') {
      portName = port;
    } else {
      portName = port.name;
    }
    if (portName && portName in this.forwardBrackets) {
      return true;
    }
    return false;
  }

  // Method for checking if a given outport is set up for
  // automatic bracket forwarding
  /**
   * @param {InPort|string} inport
   * @param {OutPort|string} outport
   * @returns {boolean}
   */
  isForwardingOutport(inport, outport) {
    let inportName; let
      outportName;
    if (typeof inport === 'string') {
      inportName = inport;
    } else {
      inportName = inport.name;
    }
    if (typeof outport === 'string') {
      outportName = outport;
    } else {
      outportName = outport.name;
    }
    if (!inportName || !outportName) {
      return false;
    }
    if (!this.forwardBrackets[inportName]) { return false; }
    if (this.forwardBrackets[inportName].indexOf(outportName) !== -1) { return true; }
    return false;
  }

  // Method for checking whether the component sends packets
  // in the same order they were received.
  isOrdered() {
    if (this.ordered) { return true; }
    if (this.autoOrdering) { return true; }
    return false;
  }

  // ### Handling IP objects
  //
  // The component has received an Information Packet. Call the
  // processing function so that firing pattern preconditions can
  // be checked and component can do processing as needed.
  /**
   * @param {IP} ip
   * @param {InPort} port
   * @returns {void}
   */
  handleIP(ip, port) {
    if (!port.options.triggering) {
      // If port is non-triggering, we can skip the process function call
      return;
    }

    if ((ip.type === 'openBracket') && (this.autoOrdering === null) && !this.ordered) {
      // Switch component to ordered mode when receiving a stream unless
      // auto-ordering is disabled
      debugComponent(`${this.nodeId} port '${port.name}' entered auto-ordering mode`);
      this.autoOrdering = true;
    }

    // Initialize the result object for situations where output needs
    // to be queued to be kept in order
    /** @type {ProcessResult} */
    let result = {};

    if (this.isForwardingInport(port)) {
      // For bracket-forwarding inports we need to initialize a bracket context
      // so that brackets can be sent as part of the output, and closed after.
      if (ip.type === 'openBracket') {
        // For forwarding ports openBrackets don't fire
        return;
      }

      if (ip.type === 'closeBracket') {
        // For forwarding ports closeBrackets don't fire
        // However, we need to handle several different scenarios:
        // A. There are closeBrackets in queue before current packet
        // B. There are closeBrackets in queue after current packet
        // C. We've queued the results from all in-flight processes and
        //    new closeBracket arrives
        const buf = port.getBuffer(ip.scope, ip.index);
        const dataPackets = buf.filter((p) => p.type === 'data');
        if ((this.outputQ.length >= this.load) && (dataPackets.length === 0)) {
          if (buf[0] !== ip) { return; }
          if (!port.name) { return; }
          // Remove from buffer
          port.get(ip.scope, ip.index);
          const bracketCtx = this.getBracketContext('in', port.name, ip.scope, ip.index).pop();
          bracketCtx.closeIp = ip;
          debugBrackets(`${this.nodeId} closeBracket-C from '${bracketCtx.source}' to ${bracketCtx.ports}: '${ip.data}'`);
          result = {
            __resolved: true,
            __bracketClosingAfter: [bracketCtx],
          };
          this.outputQ.push(result);
          this.processOutputQueue();
        }
        // Check if buffer contains data IPs. If it does, we want to allow
        // firing
        if (!dataPackets.length) { return; }
      }
    }

    // Prepare the input/output pair
    const context = new ProcessContext(ip, this, port, result);
    const input = new ProcessInput(this.inPorts, context);
    const output = new ProcessOutput(this.outPorts, context);
    try {
      // Call the processing function
      if (!this.handle) {
        throw new Error('Processing function not defined');
      }
      const res = this.handle(input, output, context);
      if (res && res.then) {
        // Processing function returned a Promise
        res.then(
          (data) => output.sendDone(data),
          (err) => output.done(err),
        );
      }
    } catch (e) {
      this.deactivate(context);
      output.sendDone(e);
    }

    if (context.activated) { return; }
    // If receiving an IP object didn't cause the component to
    // activate, log that input conditions were not met
    if (port.isAddressable()) {
      debugComponent(`${this.nodeId} packet on '${port.name}[${ip.index}]' didn't match preconditions: ${ip.type}`);
      return;
    }
    debugComponent(`${this.nodeId} packet on '${port.name}' didn't match preconditions: ${ip.type}`);
  }

  // Get the current bracket forwarding context for an IP object
  /**
   * @param {string} type
   * @param {string} port
   * @param {string|null} scope
   * @param {number|null} [idx]
   */
  getBracketContext(type, port, scope, idx = null) {
    let { name, index } = normalizePortName(port);
    if (idx != null) { index = `${idx}`; }
    const portsList = type === 'in' ? this.inPorts : this.outPorts;
    if (portsList.ports[name].isAddressable()) {
      name = `${name}[${index}]`;
    } else {
      name = port;
    }
    // Ensure we have a bracket context for the current scope
    if (!this.bracketContext[type][name]) {
      this.bracketContext[type][name] = {};
    }
    if (!this.bracketContext[type][name][scope]) {
      this.bracketContext[type][name][scope] = [];
    }
    return this.bracketContext[type][name][scope];
  }

  // Add an IP object to the list of results to be sent in
  // order
  /**
   * @param {ProcessResult} result
   * @param {Object} port
   * @param {IP} packet
   * @param {boolean} [before]
   */
  addToResult(result, port, packet, before = false) {
    const res = result;
    const ip = packet;
    const { name, index } = normalizePortName(port);
    const method = before ? 'unshift' : 'push';
    if (this.outPorts.ports[name].isAddressable()) {
      const idx = /** @type {number} */ (index ? parseInt(index, 10) : ip.index);
      if (!res[name]) {
        res[name] = {};
      }
      if (!res[name][idx]) {
        res[name][idx] = [];
      }
      ip.index = idx;
      res[name][idx][method](ip);
      return;
    }
    if (!res[name]) {
      res[name] = [];
    }
    res[name][method](ip);
  }

  // Get contexts that can be forwarded with this in/outport
  // pair.
  /** @private */
  getForwardableContexts(inport, outport, contexts) {
    const { name, index } = normalizePortName(outport);
    const forwardable = [];
    contexts.forEach((ctx, idx) => {
      // No forwarding to this outport
      if (!this.isForwardingOutport(inport, name)) { return; }
      // We have already forwarded this context to this outport
      if (ctx.ports.indexOf(outport) !== -1) { return; }
      // See if we have already forwarded the same bracket from another
      // inport
      const outContext = this.getBracketContext('out', name, ctx.ip.scope, parseInt(index, 10))[idx];
      if (outContext) {
        if ((outContext.ip.data === ctx.ip.data) && (outContext.ports.indexOf(outport) !== -1)) {
          return;
        }
      }
      forwardable.push(ctx);
    });
    return forwardable;
  }

  // Add any bracket forwards needed to the result queue
  /** @private */
  addBracketForwards(result) {
    const res = result;
    if (res.__bracketClosingBefore != null ? res.__bracketClosingBefore.length : undefined) {
      res.__bracketClosingBefore.forEach((context) => {
        debugBrackets(`${this.nodeId} closeBracket-A from '${context.source}' to ${context.ports}: '${context.closeIp.data}'`);
        if (!context.ports.length) { return; }
        context.ports.forEach((port) => {
          const ipClone = context.closeIp.clone();
          this.addToResult(res, port, ipClone, true);
          this.getBracketContext('out', port, ipClone.scope).pop();
        });
      });
    }

    if (res.__bracketContext) {
      // First see if there are any brackets to forward. We need to reverse
      // the keys so that they get added in correct order
      Object.keys(res.__bracketContext).reverse().forEach((inport) => {
        const context = res.__bracketContext[inport];
        if (!context.length) { return; }
        Object.keys(res).forEach((outport) => {
          let datas; let forwardedOpens; let unforwarded;
          const ips = res[outport];
          if (outport.indexOf('__') === 0) { return; }
          if (this.outPorts[outport].isAddressable()) {
            Object.keys(ips).forEach((idx) => {
              // Don't register indexes we're only sending brackets to
              const idxIps = ips[idx];
              datas = idxIps.filter((ip) => ip.type === 'data');
              if (!datas.length) { return; }
              const portIdentifier = `${outport}[${idx}]`;
              unforwarded = this.getForwardableContexts(inport, portIdentifier, context);
              if (!unforwarded.length) { return; }
              forwardedOpens = [];
              unforwarded.forEach((ctx) => {
                debugBrackets(`${this.nodeId} openBracket from '${inport}' to '${portIdentifier}': '${ctx.ip.data}'`);
                const ipClone = ctx.ip.clone();
                ipClone.index = parseInt(idx, 10);
                forwardedOpens.push(ipClone);
                ctx.ports.push(portIdentifier);
                this.getBracketContext('out', outport, ctx.ip.scope, ipClone.index).push(ctx);
              });
              forwardedOpens.reverse();
              forwardedOpens.forEach((ip) => { this.addToResult(res, outport, ip, true); });
            });
            return;
          }
          // Don't register ports we're only sending brackets to
          datas = ips.filter((ip) => ip.type === 'data');
          if (!datas.length) { return; }
          unforwarded = this.getForwardableContexts(inport, outport, context);
          if (!unforwarded.length) { return; }
          forwardedOpens = [];
          unforwarded.forEach((ctx) => {
            debugBrackets(`${this.nodeId} openBracket from '${inport}' to '${outport}': '${ctx.ip.data}'`);
            forwardedOpens.push(ctx.ip.clone());
            ctx.ports.push(outport);
            this.getBracketContext('out', outport, ctx.ip.scope).push(ctx);
          });
          forwardedOpens.reverse();
          forwardedOpens.forEach((ip) => { this.addToResult(res, outport, ip, true); });
        });
      });
    }

    if (res.__bracketClosingAfter != null ? res.__bracketClosingAfter.length : undefined) {
      res.__bracketClosingAfter.forEach((context) => {
        debugBrackets(`${this.nodeId} closeBracket-B from '${context.source}' to ${context.ports}: '${context.closeIp.data}'`);
        if (!context.ports.length) { return; }
        context.ports.forEach((port) => {
          const ipClone = context.closeIp.clone();
          this.addToResult(res, port, ipClone, false);
          this.getBracketContext('out', port, ipClone.scope).pop();
        });
      });
    }

    delete res.__bracketClosingBefore;
    delete res.__bracketContext;
    delete res.__bracketClosingAfter;
  }

  // Whenever an execution context finishes, send all resolved
  // output from the queue in the order it is in.
  /** @private */
  processOutputQueue() {
    while (this.outputQ.length > 0) {
      if (!this.outputQ[0].__resolved) { break; }
      const result = this.outputQ.shift();
      this.addBracketForwards(result);
      Object.keys(result).forEach((port) => {
        let portIdentifier;
        const ips = result[port];
        if (port.indexOf('__') === 0) { return; }
        if (this.outPorts.ports[port].isAddressable()) {
          Object.keys(ips).forEach((index) => {
            const idxIps = ips[index];
            const idx = parseInt(index, 10);
            if (!this.outPorts.ports[port].isAttached(idx)) { return; }
            idxIps.forEach((packet) => {
              const ip = packet;
              portIdentifier = `${port}[${ip.index}]`;
              if (ip.type === 'openBracket') {
                debugSend(`${this.nodeId} sending ${portIdentifier} < '${ip.data}'`);
              } else if (ip.type === 'closeBracket') {
                debugSend(`${this.nodeId} sending ${portIdentifier} > '${ip.data}'`);
              } else {
                debugSend(`${this.nodeId} sending ${portIdentifier} DATA`);
              }
              if (!this.outPorts[port].options.scoped) {
                ip.scope = null;
              }
              this.outPorts[port].sendIP(ip);
            });
          });
          return;
        }
        if (!this.outPorts.ports[port].isAttached()) { return; }
        ips.forEach((packet) => {
          const ip = packet;
          portIdentifier = port;
          if (ip.type === 'openBracket') {
            debugSend(`${this.nodeId} sending ${portIdentifier} < '${ip.data}'`);
          } else if (ip.type === 'closeBracket') {
            debugSend(`${this.nodeId} sending ${portIdentifier} > '${ip.data}'`);
          } else {
            debugSend(`${this.nodeId} sending ${portIdentifier} DATA`);
          }
          if (!this.outPorts[port].options.scoped) {
            ip.scope = null;
          }
          this.outPorts[port].sendIP(ip);
        });
      });
    }
  }

  // Signal that component has activated. There may be multiple
  // activated contexts at the same time
  /**
   * @param {Object} context
   * @param {boolean} context.activated
   * @param {boolean} context.deactivated
   * @param {Object} context.result
   */
  activate(context) {
    if (context.activated) { return; } // prevent double activation
    context.activated = true;
    context.deactivated = false;
    this.load += 1;
    this.emit('activate', this.load);
    if (this.ordered || this.autoOrdering) {
      this.outputQ.push(context.result);
    }
  }

  // Signal that component has deactivated. There may be multiple
  // activated contexts at the same time
  /**
   * @param {Object} context
   * @param {boolean} context.activated
   * @param {boolean} context.deactivated
   */
  deactivate(context) {
    if (context.deactivated) { return; } // prevent double deactivation
    context.deactivated = true;
    context.activated = false;
    if (this.isOrdered()) {
      this.processOutputQueue();
    }
    this.load -= 1;
    this.emit('deactivate', this.load);
  }
}
Component.description = '';
Component.icon = null;
