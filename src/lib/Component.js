/* eslint-disable
    class-methods-use-this,
    consistent-return,
    constructor-super,
    func-names,
    guard-for-in,
    import/order,
    max-len,
    no-constant-condition,
    no-continue,
    no-eval,
    no-loop-func,
    no-param-reassign,
    no-plusplus,
    no-restricted-syntax,
    no-shadow,
    no-this-before-super,
    no-underscore-dangle,
    no-unused-vars,
    no-var,
    prefer-const,
    radix,
    vars-on-top,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
const { EventEmitter } = require('events');

const ports = require('./Ports');
const IP = require('./IP');
const ProcessContext = require('./ProcessContext');
const ProcessInput = require('./ProcessInput');
const ProcessOutput = require('./ProcessOutput');

const debug = require('debug')('noflo:component');
const debugBrackets = require('debug')('noflo:component:brackets');
const debugSend = require('debug')('noflo:component:send');

// ## NoFlo Component Base class
//
// The `noflo.Component` interface provides a way to instantiate
// and extend NoFlo components.
class Component extends EventEmitter {
  static initClass() {
    this.prototype.description = '';
    this.prototype.icon = null;
  }

  constructor(options) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      const thisFn = (() => this).toString();
      const thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1];
      eval(`${thisName} = this;`);
    }
    this.error = this.error.bind(this);
    super();
    if (!options) { options = {}; }

    // Prepare inports, if any were given in options.
    // They can also be set up imperatively after component
    // instantiation by using the `component.inPorts.add`
    // method.
    if (!options.inPorts) { options.inPorts = {}; }
    if (options.inPorts instanceof ports.InPorts) {
      this.inPorts = options.inPorts;
    } else {
      this.inPorts = new ports.InPorts(options.inPorts);
    }

    // Prepare outports, if any were given in options.
    // They can also be set up imperatively after component
    // instantiation by using the `component.outPorts.add`
    // method.
    if (!options.outPorts) { options.outPorts = {}; }
    if (options.outPorts instanceof ports.OutPorts) {
      this.outPorts = options.outPorts;
    } else {
      this.outPorts = new ports.OutPorts(options.outPorts);
    }

    // Set the default component icon and description
    if (options.icon) { this.icon = options.icon; }
    if (options.description) { this.description = options.description; }

    // Initially the component is not started
    this.started = false;
    this.load = 0;

    // Whether the component should keep send packets
    // out in the order they were received
    this.ordered = options.ordered != null ? options.ordered : false;
    this.autoOrdering = options.autoOrdering != null ? options.autoOrdering : null;

    // Queue for handling ordered output packets
    this.outputQ = [];

    // Context used for bracket forwarding
    this.bracketContext = {
      in: {},
      out: {},
    };

    // Whether the component should activate when it
    // receives packets
    this.activateOnInput = options.activateOnInput != null ? options.activateOnInput : true;

    // Bracket forwarding rules. By default we forward
    // brackets from `in` port to `out` and `error` ports.
    this.forwardBrackets = { in: ['out', 'error'] };
    if ('forwardBrackets' in options) {
      this.forwardBrackets = options.forwardBrackets;
    }

    // The component's process function can either be
    // passed in options, or given imperatively after
    // instantation using the `component.process` method.
    if (typeof options.process === 'function') {
      this.process(options.process);
    }
  }

  getDescription() { return this.description; }

  isReady() { return true; }

  isSubgraph() { return false; }

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
  error(e, groups, errorPort, scope = null) {
    if (groups == null) { groups = []; }
    if (errorPort == null) { errorPort = 'error'; }
    if (this.outPorts[errorPort] && (this.outPorts[errorPort].isAttached() || !this.outPorts[errorPort].isRequired())) {
      let group;
      for (group of Array.from(groups)) { this.outPorts[errorPort].openBracket(group, { scope }); }
      this.outPorts[errorPort].data(e, { scope });
      for (group of Array.from(groups)) { this.outPorts[errorPort].closeBracket(group, { scope }); }
      return;
    }
    throw e;
  }

  // ### Setup
  //
  // The setUp method is for component-specific initialization.
  // Called at network start-up.
  //
  // Override in component implementation to do component-specific
  // setup work.
  setUp(callback) {
    callback();
  }

  // ### Setup
  //
  // The tearDown method is for component-specific cleanup. Called
  // at network shutdown
  //
  // Override in component implementation to do component-specific
  // cleanup work, like clearing any accumulated state.
  tearDown(callback) {
    callback();
  }

  // ### Start
  //
  // Called when network starts. This sets calls the setUp
  // method and sets the component to a started state.
  start(callback) {
    if (this.isStarted()) { return callback(); }
    this.setUp((err) => {
      if (err) { return callback(err); }
      this.started = true;
      this.emit('start');
      callback(null);
    });
  }

  // ### Shutdown
  //
  // Called when network is shut down. This sets calls the
  // tearDown method and sets the component back to a
  // non-started state.
  //
  // The callback is called when tearDown finishes and
  // all active processing contexts have ended.
  shutdown(callback) {
    const finalize = () => {
      // Clear contents of inport buffers
      const inPorts = this.inPorts.ports || this.inPorts;
      for (const portName in inPorts) {
        const inPort = inPorts[portName];
        if (typeof inPort.clear !== 'function') { continue; }
        inPort.clear();
      }
      // Clear bracket context
      this.bracketContext = {
        in: {},
        out: {},
      };
      if (!this.isStarted()) { return callback(); }
      this.started = false;
      this.emit('end');
      callback();
    };

    // Tell the component that it is time to shut down
    this.tearDown((err) => {
      if (err) { return callback(err); }
      if (this.load > 0) {
        // Some in-flight processes, wait for them to finish
        var checkLoad = function (load) {
          if (load > 0) { return; }
          this.removeListener('deactivate', checkLoad);
          finalize();
        };
        this.on('deactivate', checkLoad);
        return;
      }
      finalize();
    });
  }

  isStarted() { return this.started; }

  // Ensures braket forwarding map is correct for the existing ports
  prepareForwarding() {
    for (const inPort in this.forwardBrackets) {
      const outPorts = this.forwardBrackets[inPort];
      if (!(inPort in this.inPorts.ports)) {
        delete this.forwardBrackets[inPort];
        continue;
      }
      const tmp = [];
      for (const outPort of Array.from(outPorts)) {
        if (outPort in this.outPorts.ports) { tmp.push(outPort); }
      }
      if (tmp.length === 0) {
        delete this.forwardBrackets[inPort];
      } else {
        this.forwardBrackets[inPort] = tmp;
      }
    }
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
  process(handle) {
    if (typeof handle !== 'function') {
      throw new Error('Process handler must be a function');
    }
    if (!this.inPorts) {
      throw new Error('Component ports must be defined before process function');
    }
    this.prepareForwarding();
    this.handle = handle;
    for (const name in this.inPorts.ports) {
      const port = this.inPorts.ports[name];
      ((name, port) => {
        if (!port.name) { port.name = name; }
        return port.on('ip', (ip) => this.handleIP(ip, port));
      })(name, port);
    }
    return this;
  }

  // Method for checking if a given inport is set up for
  // automatic bracket forwarding
  isForwardingInport(port) {
    let portName;
    if (typeof port === 'string') {
      portName = port;
    } else {
      portName = port.name;
    }
    if (portName in this.forwardBrackets) {
      return true;
    }
    return false;
  }

  // Method for checking if a given outport is set up for
  // automatic bracket forwarding
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
  handleIP(ip, port) {
    let context;
    if (!port.options.triggering) {
      // If port is non-triggering, we can skip the process function call
      return;
    }

    if ((ip.type === 'openBracket') && (this.autoOrdering === null) && !this.ordered) {
      // Switch component to ordered mode when receiving a stream unless
      // auto-ordering is disabled
      debug(`${this.nodeId} port '${port.name}' entered auto-ordering mode`);
      this.autoOrdering = true;
    }

    // Initialize the result object for situations where output needs
    // to be queued to be kept in order
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
        const dataPackets = buf.filter((ip) => ip.type === 'data');
        if ((this.outputQ.length >= this.load) && (dataPackets.length === 0)) {
          if (buf[0] !== ip) { return; }
          // Remove from buffer
          port.get(ip.scope, ip.index);
          context = this.getBracketContext('in', port.name, ip.scope, ip.index).pop();
          context.closeIp = ip;
          debugBrackets(`${this.nodeId} closeBracket-C from '${context.source}' to ${context.ports}: '${ip.data}'`);
          result = {
            __resolved: true,
            __bracketClosingAfter: [context],
          };
          this.outputQ.push(result);
          (this.processOutputQueue)();
        }
        // Check if buffer contains data IPs. If it does, we want to allow
        // firing
        if (!dataPackets.length) { return; }
      }
    }

    // Prepare the input/output pair
    context = new ProcessContext(ip, this, port, result);
    const input = new ProcessInput(this.inPorts, context);
    const output = new ProcessOutput(this.outPorts, context);
    try {
      // Call the processing function
      this.handle(input, output, context);
    } catch (e) {
      this.deactivate(context);
      output.sendDone(e);
    }

    if (context.activated) { return; }
    // If receiving an IP object didn't cause the component to
    // activate, log that input conditions were not met
    if (port.isAddressable()) {
      debug(`${this.nodeId} packet on '${port.name}[${ip.index}]' didn't match preconditions: ${ip.type}`);
      return;
    }
    debug(`${this.nodeId} packet on '${port.name}' didn't match preconditions: ${ip.type}`);
  }

  // Get the current bracket forwarding context for an IP object
  getBracketContext(type, port, scope, idx) {
    let { name, index } = ports.normalizePortName(port);
    if (idx != null) { index = idx; }
    const portsList = type === 'in' ? this.inPorts : this.outPorts;
    if (portsList[name].isAddressable()) {
      port = `${name}[${index}]`;
    }
    // Ensure we have a bracket context for the current scope
    if (!this.bracketContext[type][port]) { this.bracketContext[type][port] = {}; }
    if (!this.bracketContext[type][port][scope]) { this.bracketContext[type][port][scope] = []; }
    return this.bracketContext[type][port][scope];
  }

  // Add an IP object to the list of results to be sent in
  // order
  addToResult(result, port, ip, before) {
    if (before == null) { before = false; }
    const { name, index } = ports.normalizePortName(port);
    const method = before ? 'unshift' : 'push';
    if (this.outPorts[name].isAddressable()) {
      const idx = index ? parseInt(index) : ip.index;
      if (!result[name]) { result[name] = {}; }
      if (!result[name][idx]) { result[name][idx] = []; }
      ip.index = idx;
      result[name][idx][method](ip);
      return;
    }
    if (!result[name]) { result[name] = []; }
    return result[name][method](ip);
  }

  // Get contexts that can be forwarded with this in/outport
  // pair.
  getForwardableContexts(inport, outport, contexts) {
    const { name, index } = ports.normalizePortName(outport);
    const forwardable = [];
    contexts.forEach((ctx, idx) => {
      // No forwarding to this outport
      if (!this.isForwardingOutport(inport, name)) { return; }
      // We have already forwarded this context to this outport
      if (ctx.ports.indexOf(outport) !== -1) { return; }
      // See if we have already forwarded the same bracket from another
      // inport
      const outContext = this.getBracketContext('out', name, ctx.ip.scope, index)[idx];
      if (outContext) {
        if ((outContext.ip.data === ctx.ip.data) && (outContext.ports.indexOf(outport) !== -1)) { return; }
      }
      return forwardable.push(ctx);
    });
    return forwardable;
  }

  // Add any bracket forwards needed to the result queue
  addBracketForwards(result) {
    let context; let ipClone; let
      port;
    if (result.__bracketClosingBefore != null ? result.__bracketClosingBefore.length : undefined) {
      for (context of Array.from(result.__bracketClosingBefore)) {
        debugBrackets(`${this.nodeId} closeBracket-A from '${context.source}' to ${context.ports}: '${context.closeIp.data}'`);
        if (!context.ports.length) { continue; }
        for (port of Array.from(context.ports)) {
          ipClone = context.closeIp.clone();
          this.addToResult(result, port, ipClone, true);
          this.getBracketContext('out', port, ipClone.scope).pop();
        }
      }
    }

    if (result.__bracketContext) {
      // First see if there are any brackets to forward. We need to reverse
      // the keys so that they get added in correct order
      Object.keys(result.__bracketContext).reverse().forEach((inport) => {
        context = result.__bracketContext[inport];
        if (!context.length) { return; }
        return (() => {
          const result1 = [];
          for (var outport in result) {
            var ctx; var datas; var forwardedOpens; var ip; var
              unforwarded;
            const ips = result[outport];
            if (outport.indexOf('__') === 0) { continue; }
            if (this.outPorts[outport].isAddressable()) {
              for (const idx in ips) {
                // Don't register indexes we're only sending brackets to
                const idxIps = ips[idx];
                datas = idxIps.filter((ip) => ip.type === 'data');
                if (!datas.length) { continue; }
                const portIdentifier = `${outport}[${idx}]`;
                unforwarded = this.getForwardableContexts(inport, portIdentifier, context);
                if (!unforwarded.length) { continue; }
                forwardedOpens = [];
                for (ctx of Array.from(unforwarded)) {
                  debugBrackets(`${this.nodeId} openBracket from '${inport}' to '${portIdentifier}': '${ctx.ip.data}'`);
                  ipClone = ctx.ip.clone();
                  ipClone.index = parseInt(idx);
                  forwardedOpens.push(ipClone);
                  ctx.ports.push(portIdentifier);
                  this.getBracketContext('out', outport, ctx.ip.scope, idx).push(ctx);
                }
                forwardedOpens.reverse();
                for (ip of Array.from(forwardedOpens)) { this.addToResult(result, outport, ip, true); }
              }
              continue;
            }
            // Don't register ports we're only sending brackets to
            datas = ips.filter((ip) => ip.type === 'data');
            if (!datas.length) { continue; }
            unforwarded = this.getForwardableContexts(inport, outport, context);
            if (!unforwarded.length) { continue; }
            forwardedOpens = [];
            for (ctx of Array.from(unforwarded)) {
              debugBrackets(`${this.nodeId} openBracket from '${inport}' to '${outport}': '${ctx.ip.data}'`);
              forwardedOpens.push(ctx.ip.clone());
              ctx.ports.push(outport);
              this.getBracketContext('out', outport, ctx.ip.scope).push(ctx);
            }
            forwardedOpens.reverse();
            result1.push((() => {
              const result2 = [];
              for (ip of Array.from(forwardedOpens)) {
                result2.push(this.addToResult(result, outport, ip, true));
              }
              return result2;
            })());
          }
          return result1;
        })();
      });
    }

    if (result.__bracketClosingAfter != null ? result.__bracketClosingAfter.length : undefined) {
      for (context of Array.from(result.__bracketClosingAfter)) {
        debugBrackets(`${this.nodeId} closeBracket-B from '${context.source}' to ${context.ports}: '${context.closeIp.data}'`);
        if (!context.ports.length) { continue; }
        for (port of Array.from(context.ports)) {
          ipClone = context.closeIp.clone();
          this.addToResult(result, port, ipClone, false);
          this.getBracketContext('out', port, ipClone.scope).pop();
        }
      }
    }

    delete result.__bracketClosingBefore;
    delete result.__bracketContext;
    delete result.__bracketClosingAfter;
  }

  // Whenever an execution context finishes, send all resolved
  // output from the queue in the order it is in.
  processOutputQueue() {
    while (this.outputQ.length > 0) {
      if (!this.outputQ[0].__resolved) { break; }
      const result = this.outputQ.shift();
      this.addBracketForwards(result);
      for (const port in result) {
        var ip; var
          portIdentifier;
        const ips = result[port];
        if (port.indexOf('__') === 0) { continue; }
        if (this.outPorts.ports[port].isAddressable()) {
          for (let idx in ips) {
            const idxIps = ips[idx];
            idx = parseInt(idx);
            if (!this.outPorts.ports[port].isAttached(idx)) { continue; }
            for (ip of Array.from(idxIps)) {
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
            }
          }
          continue;
        }
        if (!this.outPorts.ports[port].isAttached()) { continue; }
        for (ip of Array.from(ips)) {
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
        }
      }
    }
  }

  // Signal that component has activated. There may be multiple
  // activated contexts at the same time
  activate(context) {
    if (context.activated) { return; } // prevent double activation
    context.activated = true;
    context.deactivated = false;
    this.load++;
    this.emit('activate', this.load);
    if (this.ordered || this.autoOrdering) {
      this.outputQ.push(context.result);
    }
  }

  // Signal that component has deactivated. There may be multiple
  // activated contexts at the same time
  deactivate(context) {
    if (context.deactivated) { return; } // prevent double deactivation
    context.deactivated = true;
    context.activated = false;
    if (this.isOrdered()) {
      this.processOutputQueue();
    }
    this.load--;
    this.emit('deactivate', this.load);
  }
}
Component.initClass();

exports.Component = Component;
