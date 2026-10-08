//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     (c) 2013-2020 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
/* eslint-disable no-underscore-dangle */
/* @ts-self-types="./ProcessInput.d.ts" */

import IP from "./IP.js"; // eslint-disable-line no-unused-vars
import { createDebug } from "./logger.js";

const debugComponent = createDebug("noflo:component");

export default class ProcessInput {
  /**
   * @param {import("./Ports.js").InPorts} ports - Component inports
   * @param {import("./ProcessContext.js").default} context - Processing context
   */
  constructor(ports, context) {
    this.ports = ports;
    this.context = context;
    this.nodeInstance = this.context.nodeInstance;
    this.ip = this.context.ip;
    this.port = this.context.port;
    this.result = this.context.result;
    this.scope = this.context.scope;
  }

  // When preconditions are met, set component state to `activated`
  activate() {
    if (this.context.activated) {
      return;
    }
    if (this.nodeInstance.isOrdered()) {
      // We're handling packets in order. Set the result as non-resolved
      // so that it can be send when the order comes up
      this.result.__resolved = false;
    }
    this.nodeInstance.activate(this.context);
    if (this.port.isAddressable()) {
      debugComponent(
        `${this.nodeInstance.nodeId} packet on '${this.port.name}[${this.ip.index}]' caused activation ${this.nodeInstance.load}: ${this.ip.type}`,
      );
    } else {
      debugComponent(
        `${this.nodeInstance.nodeId} packet on '${this.port.name}' caused activation ${this.nodeInstance.load}: ${this.ip.type}`,
      );
    }
  }

  // ## Connection listing
  // This allows components to check which input ports are attached. This is
  // useful mainly for addressable ports
  /**
   * @param {...string} params - Port names to check for attachment
   * @returns {Array<number> | Array<Array<number>>}
   */
  attached(...params) {
    let args = params;
    if (!args.length) {
      args = ["in"];
    }
    /** @type {Array<Array<number>>} */
    const res = [];
    args.forEach((port) => {
      if (!this.ports.ports[port]) {
        throw new Error(
          `Node ${this.nodeInstance.nodeId} has no port '${port}'`,
        );
      }
      res.push(this.ports.ports[port].listAttached());
    });
    if (args.length === 1) {
      return res[0];
    }
    return res;
  }

  // ## Input preconditions
  // When the processing function is called, it can check if input buffers
  // contain the packets needed for the process to fire.
  // This precondition handling is done via the `has` and `hasStream` methods.

  // Returns true if a port (or ports joined by logical AND) has a new IP
  // Passing a validation callback as a last argument allows more selective
  // checking of packets.
  /**
   * @typedef {string|Array<string|number>} GetArgument
   * @typedef {import("./InPort.js").HasValidationCallback} HasValidationCallback
   */
  /**
   * @typedef {GetArgument|HasValidationCallback} HasArgument
   */
  /**
   * @param {...HasArgument} params
   */
  has(...params) {
    /** @type {HasValidationCallback} */
    let validate;
    let args = params.filter((p) => typeof p !== "function");
    if (!args.length) {
      args = ["in"];
    }
    if (typeof params[params.length - 1] === "function") {
      validate = /** @type {HasValidationCallback} */ (
        params[params.length - 1]
      );
    } else {
      validate = () => true;
    }
    for (let i = 0; i < args.length; i += 1) {
      const port = args[i];
      if (Array.isArray(port)) {
        const portImpl = /** @type {import("./InPort.js").default} */ (
          this.ports.ports[port[0]]
        );
        if (!portImpl) {
          throw new Error(
            `Node ${this.nodeInstance.nodeId} has no port '${port[0]}'`,
          );
        }
        if (!portImpl.isAddressable()) {
          throw new Error(
            `Non-addressable ports, access must be with string ${port[0]}`,
          );
        }
        const portIdx =
          typeof port[1] === "string" ? parseInt(port[1], 10) : port[1];
        if (!portImpl.has(this.scope, portIdx, validate)) {
          return false;
        }
      } else if (typeof port === "string") {
        const portImpl = /** @type {import("./InPort.js").default} */ (
          this.ports.ports[port]
        );
        if (!portImpl) {
          throw new Error(
            `Node ${this.nodeInstance.nodeId} has no port '${port}'`,
          );
        }
        if (portImpl.isAddressable()) {
          throw new Error(
            `For addressable ports, access must be with array [${port}, idx]`,
          );
        }
        if (!portImpl.has(this.scope, validate)) {
          return false;
        }
      } else {
        throw new Error(`Unknown port type ${typeof port}`);
      }
    }
    return true;
  }

  // Returns true if the ports contain data packets
  /**
   * @param {...string} params - Port names to check for data packets
   * @returns {boolean}
   */
  hasData(...params) {
    let args = params;
    if (!args.length) {
      args = ["in"];
    }
    const hasArgs = [
      ...args,
      /**
       * @param {import("./IP.js").default} ip
       */
      (ip) => ip.type === "data",
    ];
    return this.has(...hasArgs);
  }

  // Returns true if a port has a complete stream in its input buffer.
  /**
   * @param {...HasArgument} params - Port names to check for streams
   * @returns {boolean}
   */
  hasStream(...params) {
    let args = params;
    /** @type {Function} */
    let validateStream;
    if (!args.length) {
      args = ["in"];
    }

    if (typeof args[args.length - 1] === "function") {
      validateStream = /** @type {Function} */ (args.pop());
    } else {
      validateStream = () => true;
    }

    for (let i = 0; i < args.length; i += 1) {
      const port = args[i];
      /** @type Array<string> */
      const portBrackets = [];
      let hasData = false;
      /** @type {HasValidationCallback} */
      const validate = (ip) => {
        if (ip.type === "openBracket") {
          portBrackets.push(ip.data);
          return false;
        }
        if (ip.type === "data") {
          // Run the stream validation callback
          hasData = validateStream(ip, portBrackets);
          // Data IP on its own is a valid stream
          if (!portBrackets.length) {
            return hasData;
          }
          // Otherwise we need to check for complete stream
          return false;
        }
        if (ip.type === "closeBracket") {
          portBrackets.pop();
          if (portBrackets.length) {
            return false;
          }
          if (!hasData) {
            return false;
          }
          return true;
        }
        return false;
      };
      if (!this.has(port, validate)) {
        return false;
      }
    }
    return true;
  }

  // ## Input processing
  //
  // Once preconditions have been met, the processing function can read from
  // the input buffers. Reading packets sets the component as "activated".
  //
  // Fetches IP object(s) for port(s)
  /**
   * @param {...GetArgument} params
   * @returns {void|IP|Array<IP|void>}
   */
  get(...params) {
    this.activate();
    let args = params;
    if (!args.length) {
      args = ["in"];
    }
    /** @type {Array<IP|void>} */
    const res = [];
    for (let i = 0; i < args.length; i += 1) {
      const port = args[i];
      let idx;
      let ip;
      let portname;
      if (Array.isArray(port)) {
        [portname, idx] = Array.from(port);
        if (!this.ports.ports[portname].isAddressable()) {
          throw new Error(
            "Non-addressable ports, access must be with string portname",
          );
        }
      } else {
        portname = port;
        if (this.ports.ports[portname].isAddressable()) {
          throw new Error(
            "For addressable ports, access must be with array [portname, idx]",
          );
        }
      }
      const name = /** @type {string} */ (portname);
      const idxName = /** @type {number} */ (idx);
      if (this.nodeInstance.isForwardingInport(name)) {
        ip = this.__getForForwarding(name, idxName);
        res.push(ip);
      } else {
        const portImpl = /** @type {import("./InPort.js").default} */ (
          this.ports.ports[name]
        );
        ip = portImpl.get(this.scope, idxName);
        res.push(ip);
      }
    }

    if (args.length === 1) {
      return res[0];
    }
    return res;
  }

  /**
   * @private
   * @param {string} port
   * @param {number} [idx]
   * @returns {IP|void}
   */
  __getForForwarding(port, idx) {
    const prefix = [];
    let dataIp;
    // Read IPs until we hit data
    let ok = true;
    while (ok) {
      // Read next packet
      const portImpl = /** @type {import("./InPort.js").default} */ (
        this.ports.ports[port]
      );
      const ip = portImpl.get(this.scope, idx);
      // Stop at the end of the buffer
      if (!ip) {
        break;
      }
      if (ip.type === "data") {
        // Hit the data IP, stop here
        dataIp = ip;
        ok = false;
        break;
      }
      // Keep track of bracket closings and openings before
      prefix.push(ip);
    }

    // Forwarding brackets that came before data packet need to manipulate context
    // and be added to result so they can be forwarded correctly to ports that
    // need them
    for (let i = 0; i < prefix.length; i += 1) {
      const ip = prefix[i];
      if (ip.type === "closeBracket") {
        // Bracket closings before data should remove bracket context
        if (!this.result.__bracketClosingBefore) {
          this.result.__bracketClosingBefore = [];
        }
        const context = this.nodeInstance
          .getBracketContext("in", port, this.scope, idx)
          .pop();
        context.closeIp = ip;
        this.result.__bracketClosingBefore.push(context);
      } else if (ip.type === "openBracket") {
        // Bracket openings need to go to bracket context
        this.nodeInstance.getBracketContext("in", port, this.scope, idx).push({
          ip,
          ports: [],
          source: port,
        });
      }
    }

    // Add current bracket context to the result so that when we send
    // to ports we can also add the surrounding brackets
    if (!this.result.__bracketContext) {
      this.result.__bracketContext = {};
    }
    this.result.__bracketContext[port] = this.nodeInstance
      .getBracketContext("in", port, this.scope, idx)
      .slice(0);
    // Bracket closings that were in buffer after the data packet need to
    // be added to result for done() to read them from
    return dataIp;
  }

  // Fetches `data` property of IP object(s) for given port(s)
  /**
   * @param {...GetArgument} params
   * @returns {any|Array<any>}
   */
  getData(...params) {
    let args = params;
    if (!args.length) {
      args = ["in"];
    }

    /** @type {Array<any>} */
    const datas = [];
    args.forEach((port) => {
      let packet = /** @type {IP} */ (this.get(port));
      if (packet == null) {
        // we add the null packet to the array so when getting
        // multiple ports, if one is null we still return it
        // so the indexes are correct.
        datas.push(packet);
        return;
      }

      while (packet.type !== "data") {
        packet = /** @type {IP} */ (this.get(port));
        if (!packet) {
          break;
        }
      }

      datas.push(packet.data);
    });

    if (args.length === 1) {
      return datas.pop();
    }
    return datas;
  }

  // Fetches a complete data stream from the buffer.
  /**
   * @param {...GetArgument} params
   * @returns {void|Array<IP>|Array<void|Array<IP>>}
   */
  getStream(...params) {
    let args = params;
    if (!args.length) {
      args = ["in"];
    }
    /** @type {Array<Array<IP>|void>} */
    const datas = [];
    for (let i = 0; i < args.length; i += 1) {
      const port = args[i];
      const portname = /** @type {string} */ (
        Array.isArray(port) ? port[0] : port
      );
      const idx = Array.isArray(port)
        ? /** @type {number|undefined} */ (port[1])
        : undefined;
      if (this.nodeInstance.isForwardingInport(portname)) {
        // Forwarding inports keep the full bracketed stream in the
        // buffer until it is read, so collect it in one go
        datas.push(this.__getStreamForForwarding(portname, idx));
        continue;
      }
      const portBrackets = [];
      const portImpl = /** @type {import("./InPort.js").default} */ (
        this.ports.ports[portname]
      );
      if (portImpl?.options?.control) {
        // Control ports are read non-consumingly, so the consuming
        // shift-loop below cannot be used. Scan the buffered latest
        // stream instead, without consuming anything
        const buffered = portImpl.getBuffer(this.scope, idx);
        const scanned = [];
        for (const ip of buffered) {
          if (ip.type === "openBracket") {
            portBrackets.push(ip.data);
          }
          if (ip.type === "closeBracket") {
            portBrackets.pop();
          }
          if (ip.type === "data") {
            scanned.push(ip);
          }
        }
        datas.push(scanned);
        continue;
      }
      /** @type {Array<IP>} */
      let portPackets = [];
      let hasData = false;
      let ip = /** @type {IP} */ (this.get(port));
      if (!ip) {
        datas.push(undefined);
      }
      while (ip) {
        if (ip.type === "openBracket") {
          if (!portBrackets.length) {
            // First openBracket in stream, drop previous
            portPackets = [];
            hasData = false;
          }
          portBrackets.push(ip.data);
          portPackets.push(ip);
        }
        if (ip.type === "data") {
          portPackets.push(ip);
          hasData = true;
          // Unbracketed data packet is a valid stream
          if (!portBrackets.length) {
            break;
          }
        }
        if (ip.type === "closeBracket") {
          portPackets.push(ip);
          portBrackets.pop();
          if (hasData && !portBrackets.length) {
            // Last close bracket finishes stream if there was data inside
            break;
          }
        }
        ip = /** @type {IP} */ (this.get(port));
      }
      datas.push(portPackets);
    }

    if (args.length === 1) {
      return datas[0];
    }
    return datas;
  }

  /**
   * Collect the complete stream buffered for a forwarding inport,
   * consuming it including its brackets (issue #545). Bracket openings
   * and closings are mirrored into the bracket forwarding context so
   * that output forwarding keeps working.
   *
   * @private
   * @param {string} port
   * @param {number|null} [idx]
   * @returns {Array<IP>}
   */
  __getStreamForForwarding(port, idx) {
    const portImpl = /** @type {import("./InPort.js").default} */ (
      this.ports.ports[port]
    );
    /** @type {Array<IP>} */
    const stream = [];
    /** @type {Array<any>} */
    const portBrackets = [];
    let hasData = false;
    for (;;) {
      const buffer = portImpl.getBuffer(this.scope, idx);
      if (!buffer.length) {
        break;
      }
      const ip = /** @type {IP} */ (portImpl.get(this.scope, idx));
      stream.push(ip);
      if (ip.type === "openBracket") {
        portBrackets.push(ip.data);
        this.nodeInstance
          .getBracketContext("in", port, this.scope, idx)
          .push({ ip, ports: [], source: port });
        continue;
      }
      if (ip.type === "data") {
        hasData = true;
        if (!portBrackets.length) {
          // Unbracketed data packet is a complete stream
          break;
        }
        continue;
      }
      if (ip.type === "closeBracket") {
        portBrackets.pop();
        const context = this.nodeInstance
          .getBracketContext("in", port, this.scope, idx)
          .pop();
        if (context) {
          context.closeIp = ip;
        }
        if (hasData && !portBrackets.length) {
          // Last close bracket finishes stream if there was data inside
          break;
        }
      }
    }
    // Expose the surrounding bracket contexts so that output sent by
    // the process is wrapped in them, like __getForForwarding does
    if (!this.result.__bracketContext) {
      this.result.__bracketContext = {};
    }
    this.result.__bracketContext[port] = this.nodeInstance
      .getBracketContext("in", port, this.scope, idx)
      .slice(0);
    return stream;
  }
}
