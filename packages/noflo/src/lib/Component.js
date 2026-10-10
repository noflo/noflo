//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./Component.d.ts" */

import InPort from "./InPort.js"; // eslint-disable-line no-unused-vars
import IP from "./IP.js"; // eslint-disable-line no-unused-vars
/* eslint-disable
    class-methods-use-this,
    no-underscore-dangle,
    import/prefer-default-export,
*/
import { LegacyEventBase } from "./LegacyEvents.js";
import { createDebug } from "./logger.js";
import OutPort from "./OutPort.js"; // eslint-disable-line no-unused-vars
import { InPorts, normalizePortName, OutPorts } from "./Ports.js";
import ProcessContext from "./ProcessContext.js";
import ProcessInput from "./ProcessInput.js";
import ProcessOutput from "./ProcessOutput.js";

const debugComponent = createDebug("noflo:component");
const debugBrackets = createDebug("noflo:component:brackets");
const debugSend = createDebug("noflo:component:send");

/**
 * @callback ProcessingFunction
 * @param {ProcessInput} input
 * @param {ProcessOutput} output
 * @param {ProcessContext} context
 * @returns {Promise<any> | void}
 */

/**
 * @typedef ComponentOptions
 * @property {import("./Ports.js").InPortsOptions | InPorts} [inPorts] - Inports for the component
 * @property {import("./Ports.js").OutPortsOptions | OutPorts} [outPorts] - Outports for the component
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

/**
 * The NoFlo Component base class.
 *
 * The `noflo.Component` interface provides a way to instantiate and extend
 * NoFlo components.
 */
export class Component extends LegacyEventBase {
  /**
   * Create a component. Ports, icon, description, ordering behavior, and the
   * process function can all be provided via options, or set up imperatively
   * afterwards (ports via `component.inPorts.add`, the process function via
   * {@link Component#process}).
   *
   * @param {ComponentOptions} [options]
   */
  constructor(options = {}) {
    super();
    const opts = options;
    // Prepare inports, if any were given in options
    if (!opts.inPorts) {
      opts.inPorts = {};
    }
    /**
     * Input ports of the component; can also be extended imperatively after instantiation via {@link InPorts#add}
     * @type {InPorts}
     */
    this.inPorts =
      opts.inPorts instanceof InPorts
        ? opts.inPorts
        : new InPorts(opts.inPorts);

    // Prepare outports, if any were given in opts
    if (!opts.outPorts) {
      opts.outPorts = {};
    }
    /**
     * Output ports of the component; can also be extended imperatively after instantiation via {@link OutPorts#add}
     * @type {OutPorts}
     */
    this.outPorts =
      opts.outPorts instanceof OutPorts
        ? opts.outPorts
        : new OutPorts(opts.outPorts);

    // Set the default component icon and description
    /**
     * Icon name for UI display, from options or library defaults
     * @type {string}
     */
    this.icon = opts.icon ? opts.icon : "";
    /**
     * One-line component description
     * @type {string}
     */
    this.description = opts.description ? opts.description : "";

    /**
     * Name the component instance is registered under in the network, populated by the network
     * @type {string|null}
     */
    this.componentName = null;
    /**
     * Base directory for the component, populated by the loader on Node.js
     * @type {string|null}
     */
    this.baseDir = null;

    // Initially the component is not started
    /**
     * Whether the component has been started via {@link Component#start}
     * @type {boolean}
     */
    this.started = false;
    /**
     * Number of currently active processing contexts
     * @type {number}
     */
    this.load = 0;

    // Whether the component should keep send packets
    // out in the order they were received
    /**
     * Whether to keep output packets in the order input was received, fixed at construction
     * @type {boolean}
     */
    this.ordered = opts.ordered != null ? opts.ordered : false;
    /**
     * Whether to automatically switch to ordered output when packet order is detected to matter; overridden by {@link Component#ordered}
     * @type {boolean|null}
     */
    this.autoOrdering = opts.autoOrdering != null ? opts.autoOrdering : null;

    // Queue for handling ordered output packets
    /**
     * Output queue for ordered components, drained by {@link Component#processOutputQueue}
     * @type {ProcessResult[]}
     */
    this.outputQ = [];

    /**
     * Bracket forwarding state, keyed by direction (`in`/`out`), port, and scope
     * @type {BracketContext}
     */
    this.bracketContext = {
      in: {},
      out: {},
    };

    // Whether the component should activate when it
    // receives packets
    /**
     * Whether incoming packets should activate the process function (only `false` for components driven manually)
     * @type {boolean}
     */
    this.activateOnInput =
      opts.activateOnInput != null ? opts.activateOnInput : true;

    // Bracket forwarding rules. By default we forward
    // brackets from `in` port to `out` and `error` ports.
    if (!opts.forwardBrackets) {
      opts.forwardBrackets = { in: ["out", "error"] };
    }
    /**
     * Map of inport name to the outports its brackets forward to
     * @type {Object<string, string[]>}
     */
    this.forwardBrackets = opts.forwardBrackets;

    // The component's process function can either be
    // passed in opts, or given imperatively after
    // instantation using the `component.process` method.
    /**
     * The Process API handler, set via options or {@link Component#process}
     * @type {ProcessingFunction|null}
     */
    this.handle = typeof opts.process === "function" ? opts.process : null;
    if (typeof opts.process === "function") {
      this.process(opts.process);
    }

    // Placeholder for the ID of the current node, populated
    // by NoFlo network
    //
    /**
     * ID of the node this component instance is attached to in a network, populated by the network
     * @type {string|null}
     */
    this.nodeId = null;
  }

  /**
   * Get the component description.
   *
   * @returns {string}
   */
  getDescription() {
    return this.description;
  }

  /**
   * Check whether the component is ready to be started. Always true for
   * elementary components; subclasses may override with actual readiness
   * checks.
   *
   * @returns {boolean}
   */
  isReady() {
    return true;
  }

  /**
   * Check whether the component is a subgraph. Always false for elementary
   * components; the subgraph component class overrides this.
   *
   * @returns {boolean}
   */
  isSubgraph() {
    return false;
  }

  /**
   * Set the component icon and inform the network about the change.
   *
   * @param {string} icon - Updated icon for the component
   */
  setIcon(icon) {
    this.icon = icon;
    this.dispatchLifecycleEvent("icon", this.icon);
  }

  /**
   * Get the component icon name.
   *
   * @returns {string}
   */
  getIcon() {
    return this.icon;
  }

  /**
   * Report an error from the component. If the component has an `error`
   * outport that is connected, errors are sent as IP objects there. If the
   * port is not connected and not optional, errors are thrown.
   *
   * @param {Error} e
   * @param {Array<string>} [groups]
   * @param {string} [errorPort]
   * @param {string | null} [scope]
   */
  error(e, groups = [], errorPort = "error", scope = null) {
    const outPort = /** @type {OutPort} */ (this.outPorts.ports[errorPort]);
    if (outPort && (outPort.isAttached() || !outPort.isRequired())) {
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

  /**
   * Component-specific initialization, called at network start-up. Override
   * in a component implementation to do component-specific setup work.
   * Return a Promise to delay start-up until it resolves; throw to fail the
   * network start.
   *
   * @returns {Promise<void>}
   */
  setUp() {
    return Promise.resolve();
  }

  /**
   * Component-specific cleanup, called at network shutdown. Override in a
   * component implementation to do component-specific cleanup work, like
   * clearing any accumulated state.
   *
   * @returns {Promise<void>}
   */
  tearDown() {
    return Promise.resolve();
  }

  /**
   * Start the component: calls {@link Component#setUp} and marks the
   * component started. Called by the network on start-up.
   *
   * @returns {Promise<void>}
   */
  start() {
    if (this.isStarted()) {
      return Promise.resolve();
    }
    return Promise.resolve()
      .then(() => this.setUp())
      .then(() => {
        this.started = true;
        this.dispatchLifecycleEvent("start");
      });
  }

  /**
   * Shut the component down: calls {@link Component#tearDown}, waits for all
   * active processing contexts to finish, clears the inport buffers and
   * bracket contexts, and marks the component stopped. Called by the network
   * on shutdown.
   *
   * @returns {Promise<void>}
   */
  shutdown() {
    return Promise.resolve()
      .then(() => this.tearDown())
      .then(
        () =>
          new Promise((resolve) => {
            if (this.load > 0) {
              // Some in-flight processes, wait for them to finish
              /**
               * @param {Event & { detail: number }} event
               */
              const checkLoad = (event) => {
                if (event.detail > 0) {
                  return;
                }
                this.removeEventListener("deactivate", checkLoad);
                resolve();
              };
              this.addEventListener("deactivate", checkLoad);
              return;
            }
            resolve();
          }),
      )
      .then(() => {
        // Clear contents of inport buffers
        const inPorts = this.inPorts.ports || this.inPorts;
        Object.keys(inPorts).forEach((portName) => {
          const inPort = /** @type {InPort} */ (inPorts[portName]);
          if (typeof inPort.clear !== "function") {
            return;
          }
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
        this.dispatchLifecycleEvent("end");
        return Promise.resolve();
      });
  }

  /**
   * Check whether the component is currently started.
   *
   * @returns {boolean}
   */
  isStarted() {
    return this.started;
  }

  /**
   * Ensure the bracket forwarding map only references ports that actually
   * exist on the component.
   *
   * @returns {void}
   */
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

  /**
   * Set the Process API handler function for the component.
   *
   * @param {ProcessingFunction} handle - Processing function
   * @returns {this}
   */
  process(handle) {
    if (typeof handle !== "function") {
      throw new Error("Process handler must be a function");
    }
    if (!this.inPorts) {
      throw new Error(
        "Component ports must be defined before process function",
      );
    }
    this.prepareForwarding();
    this.handle = handle;
    Object.keys(this.inPorts.ports).forEach((name) => {
      const port = /** @type {InPort} */ (this.inPorts.ports[name]);
      if (!port.name) {
        port.name = name;
      }
      port.addEventListener("ip", (event) => this.handleIP(event.detail, port));
    });
    return this;
  }

  /**
   * Check whether a given inport is set up for automatic bracket forwarding.
   *
   * @param {InPort|string} port
   * @returns {boolean}
   */
  isForwardingInport(port) {
    let portName;
    if (typeof port === "string") {
      portName = port;
    } else {
      portName = port.name;
    }
    if (portName && portName in this.forwardBrackets) {
      return true;
    }
    return false;
  }

  /**
   * Check whether a given inport/outport pair is set up for automatic
   * bracket forwarding.
   *
   * @param {InPort|string} inport
   * @param {OutPort|string} outport
   * @returns {boolean}
   */
  isForwardingOutport(inport, outport) {
    let inportName;
    let outportName;
    if (typeof inport === "string") {
      inportName = inport;
    } else {
      inportName = inport.name;
    }
    if (typeof outport === "string") {
      outportName = outport;
    } else {
      outportName = outport.name;
    }
    if (!inportName || !outportName) {
      return false;
    }
    if (!this.forwardBrackets[inportName]) {
      return false;
    }
    if (this.forwardBrackets[inportName].indexOf(outportName) !== -1) {
      return true;
    }
    return false;
  }

  /**
   * Check whether the component sends packets in the same order they were
   * received.
   *
   * @returns {boolean}
   */
  isOrdered() {
    if (this.ordered) {
      return true;
    }
    if (this.autoOrdering) {
      return true;
    }
    return false;
  }

  /**
   * Handle an Information Packet that arrived on an inport: check the firing
   * pattern preconditions and invoke the process function as needed.
   *
   * @param {IP} ip
   * @param {InPort} port
   * @returns {void}
   */
  handleIP(ip, port) {
    if (!port.options.triggering) {
      // Work document #1 Phase 2 (#607): control-triggered firing reacts
      // to any data IP arriving on a non-triggering port, in any scope.
      // Reading the control value follows normal port scoping: declare
      // the control port scoped: false when an unscoped standing control
      // IP should gate scoped data. The control IP stays buffered (a
      // non-consuming standing gate) and each arrival is one firing
      // edge. Bracket IPs on control ports do not fire. Addressable
      // control ports do not participate in control-triggered firing
      // yet.
      if (ip.type !== "data") {
        return;
      }
      if (port.options.scoped && ip.scope == null) {
        // The one broken arrival: a scoped control port fed an unscoped
        // control IP. The firing happens, but the control value is
        // unreadable at this scope — warn loudly.
        debugComponent(
          `${this.nodeId} unscoped control IP on scoped control port '${port.name}': the control value cannot be read; declare the port scoped: false`,
        );
      }
      const hasPendingData = (buffer) =>
        Boolean(buffer?.some((buffered) => buffered.type === "data"));
      const isNonControl = (other) =>
        other !== port && other.options.triggering !== false;
      /** @type {Array<string|null>} */
      const scopesToFire = [];
      let anyPending = false;
      Object.keys(this.inPorts.ports).forEach((name) => {
        const other = this.inPorts.ports[name];
        if (!isNonControl(other)) {
          return;
        }
        if (hasPendingData(other.getBuffer(null, null))) {
          if (!scopesToFire.includes(null)) {
            scopesToFire.push(null);
            anyPending = true;
          }
        }
        if (other.scopedBuffer) {
          Object.keys(other.scopedBuffer).forEach((scope) => {
            if (
              hasPendingData(other.scopedBuffer[scope]) &&
              !scopesToFire.includes(scope)
            ) {
              scopesToFire.push(scope);
              anyPending = true;
            }
          });
        }
      });
      if (!anyPending) {
        return;
      }
      // Fire once per scope: unscoped for the default buffer, and once
      // with the scope stamped on the context for each scoped buffer.
      // The control IP itself stays buffered (non-consuming gate); each
      // firing context carries the control packet with the scope set so
      // that reads and output stamping resolve to that scope.
      scopesToFire.forEach((scope) => {
        const contextIp =
          scope === null ? ip : new IP(ip.type, ip.data, { scope });
        this.fireProcess(contextIp, port);
      });
      return;
    }

    this.fireProcess(ip, port);
  }

  /**
   * Run the processing function for an Information Packet in a prepared
   * context. Precondition checks (forwarding brackets, firing gates)
   * are the caller's responsibility.
   *
   * @param {IP} ip
   * @param {InPort} port
   */
  fireProcess(ip, port) {
    if (
      ip.type === "openBracket" &&
      this.autoOrdering === null &&
      !this.ordered
    ) {
      // Switch component to ordered mode when receiving a stream unless
      // auto-ordering is disabled
      debugComponent(
        `${this.nodeId} port '${port.name}' entered auto-ordering mode`,
      );
      this.autoOrdering = true;
    }

    // Initialize the result object for situations where output needs
    // to be queued to be kept in order
    /** @type {ProcessResult} */
    let result = {};

    if (this.isForwardingInport(port)) {
      // For bracket-forwarding inports we need to initialize a bracket context
      // so that brackets can be sent as part of the output, and closed after.
      if (ip.type === "openBracket") {
        // For forwarding ports openBrackets don't fire
        return;
      }

      if (ip.type === "closeBracket") {
        // For forwarding ports closeBrackets don't fire
        // However, we need to handle several different scenarios:
        // A. There are closeBrackets in queue before current packet
        // B. There are closeBrackets in queue after current packet
        // C. We've queued the results from all in-flight processes and
        //    new closeBracket arrives
        const buf = port.getBuffer(ip.scope, ip.index);
        const dataPackets = buf.filter((p) => p.type === "data");
        if (this.outputQ.length >= this.load && dataPackets.length === 0) {
          if (buf[0] !== ip) {
            return;
          }
          if (!port.name) {
            return;
          }
          // Remove from buffer
          port.get(ip.scope, ip.index);
          const bracketCtx = this.getBracketContext(
            "in",
            port.name,
            ip.scope,
            ip.index,
          ).pop();
          bracketCtx.closeIp = ip;
          debugBrackets(
            `${this.nodeId} closeBracket-C from '${bracketCtx.source}' to ${bracketCtx.ports}: '${ip.data}'`,
          );
          result = {
            __resolved: true,
            __bracketClosingAfter: [bracketCtx],
          };
          this.outputQ.push(result);
          this.processOutputQueue();
        }
        // Check if buffer contains data IPs. If it does, we want to allow
        // firing
        if (!dataPackets.length) {
          return;
        }
      }
    }
    const context = new ProcessContext(ip, this, port, result);
    const input = new ProcessInput(this.inPorts, context);
    const output = new ProcessOutput(this.outPorts, context);
    try {
      // Call the processing function
      if (!this.handle) {
        throw new Error("Processing function not defined");
      }
      const res = this.handle(input, output, context);
      // biome-ignore  lint/complexity/useOptionalChain: We need to support both promisified and classic processing functions
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

    if (context.activated) {
      return;
    }
    // If receiving an IP object didn't cause the component to
    // activate, log that input conditions were not met
    if (port.isAddressable()) {
      debugComponent(
        `${this.nodeId} packet on '${port.name}[${ip.index}]' didn't match preconditions: ${ip.type}`,
      );
      return;
    }
    debugComponent(
      `${this.nodeId} packet on '${port.name}' didn't match preconditions: ${ip.type}`,
    );
  }

  // Get the current bracket forwarding context for an IP object
  /**
   * Get (or initialize) the bracket forwarding contexts for a port in a
   * given direction and scope.
   *
   * @param {string} type
   * @param {string} port
   * @param {string|null} scope
   * @param {number|null} [idx]
   */
  getBracketContext(type, port, scope, idx = null) {
    let { name, index } = normalizePortName(port);
    if (idx != null) {
      index = `${idx}`;
    }
    const portsList = type === "in" ? this.inPorts : this.outPorts;
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

  /**
   * Add an IP object to the list of results to be sent in order.
   *
   * @param {ProcessResult} result
   * @param {Object} port
   * @param {IP} packet
   * @param {boolean} [before]
   */
  addToResult(result, port, packet, before = false) {
    const res = result;
    const ip = packet;
    const { name, index } = normalizePortName(port);
    const method = before ? "unshift" : "push";
    if (this.outPorts.ports[name].isAddressable()) {
      const idx = /** @type {number} */ (
        index ? parseInt(index, 10) : ip.index
      );
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

  /**
   * Get bracket contexts that can be forwarded with this inport/outport
   * pair.
   *
   * @private
   * @param inport
   * @param outport
   * @param contexts
   */
  getForwardableContexts(inport, outport, contexts) {
    const { name, index } = normalizePortName(outport);
    const forwardable = [];
    contexts.forEach((ctx, idx) => {
      // No forwarding to this outport
      if (!this.isForwardingOutport(inport, name)) {
        return;
      }
      // We have already forwarded this context to this outport
      if (ctx.ports.indexOf(outport) !== -1) {
        return;
      }
      // See if we have already forwarded the same bracket from another
      // inport
      const outContext = this.getBracketContext(
        "out",
        name,
        ctx.ip.scope,
        parseInt(index, 10),
      )[idx];
      if (outContext) {
        if (
          outContext.ip.data === ctx.ip.data &&
          outContext.ports.indexOf(outport) !== -1
        ) {
          return;
        }
      }
      forwardable.push(ctx);
    });
    return forwardable;
  }

  /**
   * Add any bracket forwards needed to the result queue.
   *
   * @private
   * @param result
   */
  addBracketForwards(result) {
    const res = result;
    if (
      res.__bracketClosingBefore != null
        ? res.__bracketClosingBefore.length
        : undefined
    ) {
      res.__bracketClosingBefore.forEach((context) => {
        debugBrackets(
          `${this.nodeId} closeBracket-A from '${context.source}' to ${context.ports}: '${context.closeIp.data}'`,
        );
        if (!context.ports.length) {
          return;
        }
        context.ports.forEach((port) => {
          const ipClone = context.closeIp.clone();
          this.addToResult(res, port, ipClone, true);
          this.getBracketContext("out", port, ipClone.scope).pop();
        });
      });
    }

    if (res.__bracketContext) {
      // First see if there are any brackets to forward. We need to reverse
      // the keys so that they get added in correct order
      Object.keys(res.__bracketContext)
        .reverse()
        .forEach((inport) => {
          const context = res.__bracketContext[inport];
          if (!context.length) {
            return;
          }
          Object.keys(res).forEach((outport) => {
            let datas;
            let forwardedOpens;
            let unforwarded;
            const ips = res[outport];
            if (outport.indexOf("__") === 0) {
              return;
            }
            if (this.outPorts[outport].isAddressable()) {
              Object.keys(ips).forEach((idx) => {
                // Don't register indexes we're only sending brackets to
                const idxIps = ips[idx];
                datas = idxIps.filter((ip) => ip.type === "data");
                if (!datas.length) {
                  return;
                }
                const portIdentifier = `${outport}[${idx}]`;
                unforwarded = this.getForwardableContexts(
                  inport,
                  portIdentifier,
                  context,
                );
                if (!unforwarded.length) {
                  return;
                }
                forwardedOpens = [];
                unforwarded.forEach((ctx) => {
                  debugBrackets(
                    `${this.nodeId} openBracket from '${inport}' to '${portIdentifier}': '${ctx.ip.data}'`,
                  );
                  const ipClone = ctx.ip.clone();
                  ipClone.index = parseInt(idx, 10);
                  forwardedOpens.push(ipClone);
                  ctx.ports.push(portIdentifier);
                  this.getBracketContext(
                    "out",
                    outport,
                    ctx.ip.scope,
                    ipClone.index,
                  ).push(ctx);
                });
                forwardedOpens.reverse();
                forwardedOpens.forEach((ip) => {
                  this.addToResult(res, outport, ip, true);
                });
              });
              return;
            }
            // Don't register ports we're only sending brackets to
            datas = ips.filter((ip) => ip.type === "data");
            if (!datas.length) {
              return;
            }
            unforwarded = this.getForwardableContexts(inport, outport, context);
            if (!unforwarded.length) {
              return;
            }
            forwardedOpens = [];
            unforwarded.forEach((ctx) => {
              debugBrackets(
                `${this.nodeId} openBracket from '${inport}' to '${outport}': '${ctx.ip.data}'`,
              );
              forwardedOpens.push(ctx.ip.clone());
              ctx.ports.push(outport);
              this.getBracketContext("out", outport, ctx.ip.scope).push(ctx);
            });
            forwardedOpens.reverse();
            forwardedOpens.forEach((ip) => {
              this.addToResult(res, outport, ip, true);
            });
          });
        });
    }

    if (
      res.__bracketClosingAfter != null
        ? res.__bracketClosingAfter.length
        : undefined
    ) {
      res.__bracketClosingAfter.forEach((context) => {
        debugBrackets(
          `${this.nodeId} closeBracket-B from '${context.source}' to ${context.ports}: '${context.closeIp.data}'`,
        );
        if (!context.ports.length) {
          return;
        }
        context.ports.forEach((port) => {
          const ipClone = context.closeIp.clone();
          this.addToResult(res, port, ipClone, false);
          this.getBracketContext("out", port, ipClone.scope).pop();
        });
      });
    }

    delete res.__bracketClosingBefore;
    delete res.__bracketContext;
    delete res.__bracketClosingAfter;
  }

  /**
   * Send all resolved output from the output queue in order. Called whenever
   * an execution context finishes.
   *
   * @private
   * @returns {void}
   */
  processOutputQueue() {
    while (this.outputQ.length > 0) {
      if (!this.outputQ[0].__resolved) {
        break;
      }
      const result = this.outputQ.shift();
      this.addBracketForwards(result);
      Object.keys(result).forEach((port) => {
        let portIdentifier;
        const ips = result[port];
        if (port.indexOf("__") === 0) {
          return;
        }
        if (this.outPorts.ports[port].isAddressable()) {
          Object.keys(ips).forEach((index) => {
            const idxIps = ips[index];
            const idx = parseInt(index, 10);
            if (!this.outPorts.ports[port].isAttached(idx)) {
              return;
            }
            idxIps.forEach((packet) => {
              const ip = packet;
              portIdentifier = `${port}[${ip.index}]`;
              if (ip.type === "openBracket") {
                debugSend(
                  `${this.nodeId} sending ${portIdentifier} < '${ip.data}'`,
                );
              } else if (ip.type === "closeBracket") {
                debugSend(
                  `${this.nodeId} sending ${portIdentifier} > '${ip.data}'`,
                );
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
        if (!this.outPorts.ports[port].isAttached()) {
          return;
        }
        ips.forEach((packet) => {
          const ip = packet;
          portIdentifier = port;
          if (ip.type === "openBracket") {
            debugSend(
              `${this.nodeId} sending ${portIdentifier} < '${ip.data}'`,
            );
          } else if (ip.type === "closeBracket") {
            debugSend(
              `${this.nodeId} sending ${portIdentifier} > '${ip.data}'`,
            );
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
   * Signal that a processing context has activated. There may be multiple
   * activated contexts at the same time.
   *
   * @param {Object} context
   * @param {boolean} context.activated
   * @param {boolean} context.deactivated
   * @param {Object} context.result
   */
  activate(context) {
    if (context.activated) {
      return;
    } // prevent double activation
    context.activated = true;
    context.deactivated = false;
    this.load += 1;
    this.dispatchLifecycleEvent("activate", this.load);
    if (this.ordered || this.autoOrdering) {
      this.outputQ.push(context.result);
    }
  }

  /**
   * Signal that a processing context has deactivated. There may be multiple
   * activated contexts at the same time.
   *
   * @param {Object} context
   * @param {boolean} context.activated
   * @param {boolean} context.deactivated
   */
  deactivate(context) {
    if (context.deactivated) {
      return;
    } // prevent double deactivation
    context.deactivated = true;
    context.activated = false;
    if (this.isOrdered()) {
      this.processOutputQueue();
    }
    this.load -= 1;
    this.dispatchLifecycleEvent("deactivate", this.load);
  }
}
Component.description = "";
Component.icon = null;
