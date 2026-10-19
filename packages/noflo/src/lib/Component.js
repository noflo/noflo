//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2017 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
/* @ts-self-types="./Component.d.ts" */

/* eslint-disable
    class-methods-use-this,
    no-underscore-dangle,
    import/prefer-default-export,
*/
import { EventBase } from "./EventBase.js";
import InPort from "./InPort.js"; // eslint-disable-line no-unused-vars
import IP from "./IP.js"; // eslint-disable-line no-unused-vars
import { createDebug } from "./logger.js";
import OutPort from "./OutPort.js"; // eslint-disable-line no-unused-vars
import { makeAsync } from "./Platform.js";
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
 * The activation-lifecycle context, duck-typed between the engine's
 * `ProcessContext` (which carries the consumption counter the drain pump
 * reads) and the wrapper's plain lifecycle objects (the Subgraph's start
 * and end accounting, which carry none — and pump nothing).
 *
 * @typedef {object} ActivationContext
 * @property {boolean} [activated] Whether the context is currently active.
 * @property {boolean} [deactivated] Whether the context has completed.
 * @property {number} [consumed] How many IPs the activation consumed
 *   (ownership moved); absent for the wrapper's lifecycle contexts.
 * @property {Object<string, any>} [result] The ordered-output result, for
 *   ProcessContext instances.
 */

/**
 * The NoFlo Component base class.
 *
 * The `noflo.Component` interface provides a way to instantiate and extend
 * NoFlo components.
 */
export class Component extends EventBase {
  /** Identity of the built-in forwarding default, when in effect; null once the component declares its own rules
   * @type {Object<string, string[]> | null}
   */
  #defaultForwarding = null;
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
    // Detect case-typo option keys: 1.x-era option names like
    // `forwardbrackets` are silently ignored by the engine, which turns
    // them into invisible behavior changes. Only differing casing is
    // reported, so extension-provided options (e.g. base-class hooks)
    // never trip this
    const knownOptionKeys = [
      "inPorts",
      "outPorts",
      "icon",
      "description",
      "process",
      "ordered",
      "autoOrdering",
      "forwardBrackets",
    ];
    Object.keys(opts).forEach((key) => {
      if (knownOptionKeys.includes(key)) {
        return;
      }
      const caseMatch = knownOptionKeys.find(
        (known) => known.toLowerCase() === key.toLowerCase(),
      );
      if (caseMatch) {
        debugComponent(
          `${this.nodeId ?? "component"} received unknown option '${key}' — did you mean '${caseMatch}'? Unknown options are silently ignored`,
        );
      }
    });
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
    /**
     * Whether the component has closed down: every input is at EOT, no
     * activation is open, and nothing buffered remains to deliver — the
     * sender-side half of drain-based network closing (work document #45).
     * A closed-down component has terminally disconnected its outports.
     * @type {boolean}
     */
    this.closedDown = false;
    /**
     * Whether the component's post-drain closedown event has fired: the
     * flag is set when the terminal disconnects have drained, which is
     * what makes the network-end predicate safe (work document #45)
     * @type {boolean}
     */

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

    // Bracket forwarding rules. By default we forward
    // brackets from `in` port to `out` and `error` ports.
    if (!opts.forwardBrackets) {
      opts.forwardBrackets = { in: ["out", "error"] };
      // The built-in default adapts silently to the ports the component
      // actually has; forwarding rules declared by the component must
      // name real ports and are validated in prepareForwarding (#540)
      /** @type {Object<string, string[]> | null} */
      this.#defaultForwarding = opts.forwardBrackets;
    } else {
      this.#defaultForwarding = null;
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
   * Check whether the component is a signature-only stub placeholder:
   * a declared interface with no implementation behind it (work document
   * #19). Always false for regular components; the stub component class
   * overrides this. UIs, runtimes, and flowtraces label "not yet
   * implemented" from this authoritative runtime information instead of
   * inferring from registry lookups that can drift.
   *
   * @returns {boolean}
   */
  isStub() {
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
   * outport that is connected, the error is sent there as an IP object. If
   * the port is not connected and not optional, the error is thrown.
   *
   * @param {Error} e
   */
  error(e) {
    const outPort = /** @type {OutPort} */ (this.outPorts.ports.error);
    if (outPort && (outPort.isAttached() || !outPort.isRequired())) {
      outPort.data(e, {});
      return;
    }
    throw e;
  }

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
        this.closedDown = false;
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
        // Diagnostics before clearing: report data a component consumed
        // prematurely or never got around to reading, and bracket
        // contexts that never attached. Both are classic silent-hang
        // and silent-drop shapes that otherwise vanish here without a
        // trace (debug-visible only)
        const inPortsForReport = this.inPorts.ports || this.inPorts;
        Object.keys(inPortsForReport).forEach((portName) => {
          const reportedPort = /** @type {InPort} */ (
            inPortsForReport[portName]
          );
          if (typeof reportedPort.countBuffered !== "function") {
            return;
          }
          const buffered = reportedPort.countBuffered();
          if (buffered > 0) {
            debugComponent(
              `${this.nodeId} port '${portName}' holds ${buffered} unconsumed IPs at shutdown. Either data arrived that no activation consumed, or an activation consumed data it should not have before waiting for more — in that case the pending activation never re-invokes (check the has/get order)`,
            );
          }
        });
        Object.keys(this.bracketContext.out).forEach((portName) => {
          Object.keys(this.bracketContext.out[portName]).forEach((scope) => {
            const opens = this.bracketContext.out[portName][scope];
            if (opens.length > 0) {
              debugBrackets(
                `${this.nodeId} bracket context on '${portName}' discarded at shutdown with ${opens.length} unattached open brackets — forwarded brackets attach to actual sends`,
              );
            }
          });
        });
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
    // Rules the component declared itself must name real ports: silent
    // deletion turned typos into dead config (#540). The built-in default
    // keeps adapting silently — components without `out`/`error` ports
    // are correct usage
    const defaulted =
      this.#defaultForwarding != null &&
      this.forwardBrackets === this.#defaultForwarding;
    Object.keys(this.forwardBrackets).forEach((inPort) => {
      const outPorts = this.forwardBrackets[inPort];
      if (!(inPort in this.inPorts.ports)) {
        if (!defaulted) {
          throw new Error(
            `forwardBrackets references inport '${inPort}' which the component does not have — declared forwarding rules must name existing ports`,
          );
        }
        delete this.forwardBrackets[inPort];
        return;
      }
      /** @type {Array<string>} */
      const tmp = [];
      outPorts.forEach((outPort) => {
        if (outPort in this.outPorts.ports) {
          tmp.push(outPort);
          return;
        }
        if (!defaulted) {
          throw new Error(
            `forwardBrackets rule for inport '${inPort}' references outport '${outPort}' which the component does not have — declared forwarding rules must name existing ports`,
          );
        }
      });
      if (tmp.length === 0) {
        if (defaulted) {
          // The built-in default adapts silently: a component without
          // matching outports carries no forwarding
          delete this.forwardBrackets[inPort];
        } else {
          // An explicitly-declared empty rule terminates framing on this
          // port: brackets are consumed at arrival — they never fire,
          // never buffer, and no output context is mirrored. Reading
          // sees pure data (work document #40 update #13)
          this.forwardBrackets[inPort] = [];
        }
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
      // The port's connect/disconnect lifecycle events carry transmission
      // semantics: disconnect is the sender's terminal close, connect a new
      // transmission re-opening the input (work document #40 update #5)
      port.addEventListener("disconnect", () => this.#handleInputStateChange());
      port.addEventListener("connect", () => this.#handleInputStateChange());
    });
    Object.keys(this.outPorts.ports).forEach((name) => {
      const port = /** @type {import("./OutPort.js").default} */ (
        this.outPorts.ports[name]
      );
      if (!port.name) {
        port.name = name;
      }
      // A socket attaching to a closed-down sender's outport goes terminal
      // immediately: the sender is done, so nothing will ever come from it
      // — a late-attached edge must not leave the receiving port waiting
      // for an EOT that will never fire (work document #45, jekyll #1092
      // bug 3)
      port.addEventListener("attach", () => {
        if (this.closedDown) {
          port.disconnectAll();
        }
      });
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
    // One firing rule for all ports (work document #47; the semantics
    // trustmaster articulated in the noflo/noflo#607 discussion and the
    // maintainer agreed on): an arrival on any port re-fires the process
    // once per scope that holds unprocessed input on any port, with the
    // arriving IP — stamped to the firing scope — as the activation's
    // context. The firing predicate is any buffered IP in the scope:
    // data and brackets both, since a closeBracket completing a
    // hasStream wait is a firing edge and openBracket arrivals engage
    // auto-ordering. Control ports have no firing role: their buffers
    // are standing state — non-consuming reads — not pending work, so
    // the walk skips them and a control arrival with nothing pending
    // buffers silently. Forwarding inports are exempt: their brackets
    // are owned by the forwarding machinery in fireProcess, and their
    // data arrivals keep the direct path.
    if (this.isForwardingInport(port)) {
      this.fireProcess(ip, port);
      return;
    }
    if (port.options.control && port.options.scoped && ip.scope == null) {
      // The one broken arrival: a scoped control port fed an unscoped
      // control IP. The re-fires still happen, but the control value is
      // unreadable at those scopes — warn loudly.
      debugComponent(
        `${this.nodeId} unscoped control IP on scoped control port '${port.name}': the control value cannot be read; declare the port scoped: false`,
      );
    }
    const ready = this.#readyScopes();
    if (!ready.length) {
      return;
    }
    // Fire once per scope: unscoped for the default buffers, and once
    // with the scope stamped on the context for each scoped buffer. The
    // context IP is the wakeup cause, not the consumable: the has-first
    // discipline reads the buffers, and reads resolve to the firing
    // scope.
    ready.forEach((readyScope) => {
      const contextIp =
        readyScope.scope === null
          ? ip
          : new IP(ip.type, ip.data, { scope: readyScope.scope });
      this.fireProcess(contextIp, readyScope.port);
    });
  }

  /**
   * Scan the inport buffers for scopes holding deliverable input: the
   * unscoped default buffers, each scoped buffer, each addressable index,
   * and the IIP buffers. Control buffers are standing state, not pending
   * work, and are never scanned. Each entry carries the scope's head IP
   * as captured during the scan, so the drain pump's offer never
   * re-fetches across buffer shapes. Shared by the arrival walk
   * (handleIP) and the drain pump (the post-completion re-offer, work
   * document #47).
   *
   * @returns {Array<{scope: string|null, port: import("./InPort.js").default, head: import("./IP.js").default}>}
   */
  #readyScopes() {
    /** @type {Array<{scope: string|null, port: import("./InPort.js").default, head: import("./IP.js").default}>} */
    const ready = [];
    Object.keys(this.inPorts.ports).forEach((name) => {
      const port = this.inPorts.ports[name];
      if (port.options.control) {
        // Standing state, not pending work: control buffers are read
        // non-consumingly and never drive firings on their own
        return;
      }
      const mark = (scope, head) => {
        // One firing per scope: the port of the first hit supplies the
        // activation's context, and every leg's buffered work is visible
        // to the has-first discipline regardless
        if (ready.some((entry) => entry.scope === scope)) {
          return;
        }
        ready.push({ scope, port, head });
      };
      if (port.isAddressable()) {
        Object.keys(port.indexedBuffer ?? {}).forEach((index) => {
          const buf = port.indexedBuffer[index] ?? [];
          if (buf.length > 0) {
            mark(null, buf[0]);
          }
        });
        Object.keys(port.indexedIipBuffer ?? {}).forEach((index) => {
          const buf = port.indexedIipBuffer[index] ?? [];
          if (buf.length > 0) {
            mark(null, buf[0]);
          }
        });
        Object.keys(port.indexedScopedBuffer ?? {}).forEach((scope) => {
          Object.keys(port.indexedScopedBuffer[scope] ?? {}).forEach(
            (index) => {
              const buf = port.indexedScopedBuffer[scope][index] ?? [];
              if (buf.length > 0) {
                mark(scope, buf[0]);
              }
            },
          );
        });
        return;
      }
      const regular = port.getBuffer(null, null) ?? [];
      if (regular.length > 0) {
        mark(null, regular[0]);
      }
      if ((port.iipBuffer ?? []).length > 0) {
        mark(null, port.iipBuffer[0]);
      }
      Object.keys(port.scopedBuffer ?? {}).forEach((scope) => {
        const buf = port.scopedBuffer[scope] ?? [];
        if (buf.length > 0) {
          mark(scope, buf[0]);
        }
      });
    });
    return ready;
  }

  /**
   * The drain pump: after a consuming activation completes, re-offer the
   * process for every scope still holding deliverable input. Scheduled,
   * so a multi-pair drain does not recurse; each scheduled offer either
   * consumes (progress) or declines (the buffers unchanged, no further
   * offer) — the pump terminates with the buffers (work document #47).
   *
   * The closedown interaction (work document #48): the closedown
   * predicate runs synchronously inside `deactivate`, and the pump offer
   * scheduled by that same deactivation fires later — the closedown
   * would set `closedDown` first and the pump's guard would cancel the
   * one offer that could drain buffers which became deliverable before
   * end of transmission (the silent-drop race the noflo-jekyll testbed
   * reproduced). The pending flag makes the closedown evaluation defer
   * until the offer has settled, and the offer re-evaluates closedown
   * after its pass: an offer that consumed leaves open activations whose
   * deactivations re-evaluate; an offer that declined declares the
   * residue stranded with the loud diagnostics the #45 contract
   * promises.
   *
   * @returns {void}
   */
  #offerResumption() {
    makeAsync(() => {
      // The offer has settled: the deferred closedown evaluation must
      // follow it whether it offered or was mooted by closedown or load
      this.#pendingOffer = false;
      if (this.closedDown || this.load > 0) {
        this.#evaluateClosedown();
        return;
      }
      const ready = this.#readyScopes();
      for (const readyScope of ready) {
        // The head was captured during the scan: every buffer shape —
        // addressable, IIP, scoped — offers with its own head
        const contextIp =
          readyScope.scope === null
            ? readyScope.head
            : new IP(readyScope.head.type, readyScope.head.data, {
                scope: readyScope.scope,
              });
        this.fireProcess(contextIp, readyScope.port);
      }
      // The offers either consumed (open activations — closedown waits
      // for their deactivations, each re-scheduling the pump) or
      // declined (buffers unchanged): the closedown evaluation follows
      this.#evaluateClosedown();
    });
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
      // An explicitly-declared empty rule terminates framing on the port
      // instead: the bracket is consumed at arrival — it never fires,
      // never buffers, and no output context is mirrored (work document
      // #40 update #13)
      const forwardingTargets = this.forwardBrackets[port.name] ?? [];
      if (
        forwardingTargets.length === 0 &&
        (ip.type === "openBracket" || ip.type === "closeBracket")
      ) {
        const terminating = port.getBuffer(ip.scope, ip.index);
        if (terminating) {
          const at = terminating.indexOf(ip);
          if (at !== -1) {
            terminating.splice(at, 1);
          }
        }
        return;
      }
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
        // Processing function returned a Promise. A void resolution means
        // the process sent its output explicitly; any other resolved value
        // — null included — is the output and is sent as-is
        res.then(
          (data) => {
            if (data === undefined) {
              output.done();
              return;
            }
            output.sendDone(data);
          },
          (err) => output.done(err),
        );
      }
    } catch (e) {
      this.deactivate(context);
      output.sendDone(e);
    }

    if (context.activated) {
      // The activation contract: reads activate the context, and an
      // activated synchronous return must complete — done(), a send, or
      // a promise return. A return that consumed nothing and sent
      // nothing can never complete: the activation leaks, the
      // component's load never reaches zero, and the network never
      // ends. Peek into buffered contents with has()/hasData()/
      // hasStream() validators before reading instead. Diagnosed
      // loudly, not auto-closed: the legal deferred-completion patterns
      // consume data or send before their synchronous return, and
      // auto-closing would break the deferral contract (work document
      // #45 review follow-up)
      if (!context.consumed && !context.sentOutput) {
        debugComponent(
          `${this.nodeId} process function returned without completing the activation it opened (nothing consumed, nothing sent) — the activation will remain open until done() is called`,
        );
      }
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
          const ipClone = context.closeIp.envelope();
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
                  const ipClone = ctx.ip.envelope();
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
              forwardedOpens.push(ctx.ip.envelope());
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
          const ipClone = context.closeIp.envelope();
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
   * @param {ActivationContext} context - The lifecycle context: whether
   *   it is active, completed, and (for ProcessContext instances) the
   *   ordered-output result.
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
   * @param {ActivationContext} context - The lifecycle context: whether
   *   it is active and completed.
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
    // The drain pump (work document #47): an activation that consumed
    // input leaves the buffers holding more deliverable work — the next
    // pairing waits for a wakeup that no arrival may provide (the
    // strand the noflo-jekyll burst investigation verified: one pair
    // consumed per arrival-wakeup, the rest stranded behind the
    // late-arriving standing config). The completion of a consuming
    // activation is a state change, so the model's completeness
    // guarantee re-offers the process for every scope still holding
    // deliverable input. Scheduled, so a multi-pair drain does not
    // recurse; each scheduled offer either consumes (progress) or
    // declines (the buffers unchanged, no further offer) — the pump
    // terminates with the buffers
    if (context.consumed > 0 && !this.closedDown) {
      // The pending flag defers the closedown evaluation until this offer
      // has settled: the closedown predicate would otherwise run before
      // the offer fires and cancel it on `closedDown` — stranding buffers
      // that became deliverable before end of transmission (work
      // document #48)
      this.#pendingOffer = true;
      makeAsync(() => {
        this.#offerResumption();
      });
    }
    this.#evaluateClosedown();
  }

  /**
   * Whether the component has closed down: every input at EOT, no open
   * activation, nothing buffered left to deliver. Its outports have been
   * terminally disconnected — downstream sees EOT.
   *
   * @returns {boolean}
   */
  isClosedDown() {
    return this.closedDown;
  }

  /**
   * Evaluate the classical cascading-closedown rule (work document #45):
   * a component closes down when every input is at EOT, no activation is
   * open, and no buffered deliverable data remains (control ports are
   * excluded — their standing values are legitimate at quiescence). On
   * closedown the outports are terminally disconnected, so downstream
   * ports reach EOT and the rule recurses. Runs on every state
   * transition that can complete the condition: port EOT and activation
   * close.
   *
   * @returns {void}
   */
  /**
   * Whether a drain-pump offer is scheduled but has not run yet. The
   * closedown evaluation defers while one is pending: the offer may
   * drain buffers that would otherwise be declared stranded at end of
   * transmission (work document #48). The flag is set when the offer is
   * scheduled and cleared when the offer's body runs, which then
   * re-evaluates the closedown itself — no evaluation is lost.
   *
   * @type {boolean}
   */
  #pendingOffer = false;

  /**
   * Whether any inport holds buffered packets outside the standing IIP
   * buffers: the data a pending pump offer might drain. Control ports
   * are excluded — their standing values are legitimate at quiescence
   * and never block closing (work document #45).
   *
   * @returns {boolean}
   */
  #inputBuffersHold() {
    const portNames = Object.keys(this.inPorts.ports);
    for (const name of portNames) {
      const port = /** @type {import("./InPort.js").default} */ (
        this.inPorts.ports[name]
      );
      if (port.options.control) {
        continue;
      }
      if ((port.buffer ?? []).length > 0) {
        return true;
      }
      for (const buf of Object.values(port.scopedBuffer ?? {})) {
        if ((buf ?? []).length > 0) {
          return true;
        }
      }
      for (const buf of Object.values(port.indexedBuffer ?? {})) {
        if ((buf ?? []).length > 0) {
          return true;
        }
      }
    }
    return false;
  }

  #handleInputStateChange() {
    // Subgraph wrappers share their inner processes' port objects, so a
    // shared-port EOT reflects the deepest sender's state, not the
    // wrapper's own completion — a wrapper closes down when its inner
    // network ends (see Subgraph#subscribeNetwork)
    if (typeof this.isSubgraph === "function" && this.isSubgraph()) {
      return;
    }
    // An input re-opening (a connect began a new transmission) revives a
    // closed-down component: it is live again and may process
    if (this.closedDown) {
      const reopened = Object.keys(this.inPorts.ports).some(
        (name) => !this.inPorts.ports[name].isEot(),
      );
      if (reopened) {
        this.closedDown = false;
      }
    }
    this.#evaluateClosedown();
  }

  #evaluateClosedown() {
    if (this.closedDown) {
      return;
    }
    if (this.#pendingOffer && this.#inputBuffersHold()) {
      // A pump offer is scheduled and the inport buffers hold packets it
      // may drain: the closedown evaluation defers, because declaring the
      // residue stranded here would cancel the one offer that could
      // drain data which became deliverable before end of transmission
      // (work document #48). The offer's own tail re-evaluates the
      // closedown once it has settled. Empty buffers do not defer — the
      // closedown granularity (one per burst cycle) is preserved
      return;
    }
    if (typeof this.isSubgraph === "function" && this.isSubgraph()) {
      return;
    }
    const portNames = Object.keys(this.inPorts.ports);
    for (const name of portNames) {
      const port = /** @type {InPort} */ (this.inPorts.ports[name]);
      if (!port.isEot()) {
        return;
      }
      // Buffered data on an end of transmission port is stranded by definition —
      // no arrival can complete a waiting context once every input is at
      // EOT — so it does not block closing. It surfaces loudly: the trace
      // shows the last activation, and the shutdown diagnostics report the
      // unconsumed buffers (work document #45)
    }
    if (this.load !== 0) {
      return;
    }
    if (this.isOrdered() && this.outputQ.length > 0) {
      return;
    }
    this.closedDown = true;
    const disconnects = [];
    Object.keys(this.outPorts.ports).forEach((name) => {
      const port = /** @type {import("./OutPort.js").default} */ (
        this.outPorts.ports[name]
      );
      port.sockets.forEach((socket) => {
        if (!socket) {
          return;
        }
        disconnects.push(socket.disconnect());
      });
    });
    // The closedown completes only when the terminal disconnects have
    // drained — in-flight outputs deliver before downstream sees
    // EOT, and the network-end predicate (which this event
    // triggers) must not fire ahead of them
    Promise.all(disconnects)
      .then(() => {
        this.dispatchLifecycleEvent("closedown", this);
      })
      .catch((err) => {
        // A rejected terminal disconnect must not skip the closedown
        // event silently: the network can still end via other triggers,
        // but the failure is diagnosable only if it is logged
        debugComponent(
          `${this.nodeId} terminal disconnect failed during closedown: ${err?.message ?? err}`,
        );
      });
  }
}
Component.description = "";
Component.icon = null;
