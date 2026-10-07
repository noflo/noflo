/**
 * Parser for the .fbp flow-based programming language.
 *
 * Hand-written recursive-descent parser producing the FBP graph JSON format.
 * Semantically compatible with the reference `fbp` parser, including its
 * acceptance behavior: the same inputs are accepted and rejected, and accepted
 * inputs yield the same graph JSON.
 *
 * @module
 */

import { scanJsonText } from './json-value.js';
import { validateContents, validateSchema } from './validate.js';

/** Sentinel returned by internal parse helpers when a rule does not match. */
const FAIL = Symbol('parse-fail');

/**
 * @typedef {object} Options
 * @property {boolean} [caseSensitive] Preserve port name casing. Defaults to `true`. When disabled, port names are lowercased, mirroring the reference parser.
 * @property {boolean} [validateContents] Check that all processes have components and all connections reference known processes. Defaults to `true`.
 * @property {boolean} [validateSchema] Run structural graph validation. Defaults to `false`.
 */

/**
 * @typedef {object} GraphPort
 * @property {string} process Process name the port belongs to.
 * @property {string} port Port name.
 * @property {number} [index] Array port index.
 */

/**
 * @typedef {object} GraphConnection
 * @property {GraphPort} [src] Source port of an edge.
 * @property {GraphPort} tgt Target port of an edge or IIP.
 * @property {any} [data] Initial information packet.
 */

/**
 * @typedef {object} GraphProcess
 * @property {string} [component] Component the process is an instance of.
 * @property {Record<string, any>} [metadata] Free-form process metadata.
 */

/**
 * @typedef {object} GraphJson
 * @property {Record<string, GraphPort>} inports Exported inports by public name.
 * @property {Record<string, GraphPort>} outports Exported outports by public name.
 * @property {any[]} groups Port groups. Always empty, kept for format compatibility.
 * @property {Record<string, GraphProcess>} processes Processes by name.
 * @property {GraphConnection[]} connections Edges and IIPs.
 * @property {Record<string, any>} [properties] Graph properties, present when the source declares annotations.
 * @property {boolean | any} caseSensitive Whether port identifiers are case-sensitive. Mirrors the `caseSensitive` option value.
 */

/**
 * @typedef {object} SourceLocation
 * @property {number} line One-based line number.
 * @property {number} column One-based column number.
 * @property {number} offset Zero-based offset in the input.
 */

/**
 * @typedef {object} SyntaxErrorLocation
 * @property {SourceLocation} start
 * @property {SourceLocation} end
 */

/** Error thrown when the input is not valid .fbp. */
export class SyntaxError extends Error {
  /**
   * @param {string} message
   * @param {SyntaxErrorLocation} location
   * @param {string | undefined} found
   */
  constructor(message, location, found) {
    super(message);
    this.name = 'SyntaxError';
    this.location = location;
    this.found = found;
  }
}

const NODE_NAME_RE = /[a-zA-Z_][a-zA-Z0-9_-]*/y;
const PORT_NAME_RE = /[a-zA-Z_][a-zA-Z.0-9_]*/y;
const PORT_INDEX_RE = /\[([0-9]+)\]/y;
const COMPONENT_RE = /\(([a-zA-Z/\-0-9_]*)(?::([a-zA-Z/=_,0-9]+))?\)/y;
const ANNOTATION_KEY_RE = /[a-zA-Z0-9\-_]+/y;
const ANNOTATION_VALUE_RE = /[a-zA-Z0-9\-_ .]+/y;

/**
 * Parse a .fbp program into an FBP graph JSON object.
 *
 * Unlike the reference `fbp` parser, calling without `options` is supported.
 *
 * @param {string} input The .fbp source to parse.
 * @param {Options} [options]
 * @returns {GraphJson}
 * @throws {SyntaxError} When the input is not valid .fbp.
 * @throws {Error} When content or schema validation fails.
 */
export function parse(input, options = {}) {
  const parser = new FbpParser(input, options);
  return parser.parse();
}

class FbpParser {
  /**
   * @param {string} input
   * @param {Options} options
   */
  constructor(input, options) {
    this.input = input;
    this.options = options;

    /**
     * Normalized case-sensitivity flag. Unlike the reference parser, which
     * treats an absent option as case-insensitive, this package defaults to
     * `true` per the NoFlo 2.x case-sensitivity policy.
     *
     * @type {any}
     */
    this.caseSensitive = options.caseSensitive ?? true;

    /** @type {number} */
    this.pos = 0;
    /** @type {Record<string, GraphProcess>} */
    this.nodes = {};
    /** @type {Record<string, GraphPort> | null} */
    this.inports = null;
    /** @type {Record<string, GraphPort> | null} */
    this.outports = null;
    /** @type {Record<string, any> | null} */
    this.properties = null;
    /** @type {any[]} */
    this.edges = [];

    /** @type {string} */
    this.defaultInPort = 'IN';
    /** @type {string} */
    this.defaultOutPort = 'OUT';

    /** @type {Record<string, number>} */
    this.anonymousCounters = {};
    /** @type {Record<number, string>} */
    this.anonymousNames = {};

    /** @type {number} */
    this.maxFailPos = 0;
    /** @type {string} */
    this.maxFailExpected = 'valid .fbp';
  }

  /** @returns {GraphJson} */
  parse() {
    while (this.parseLine() !== FAIL) {
      // Parse lines until one fails to match.
    }
    if (this.pos !== this.input.length) {
      this.fail('end of input');
      throw this.syntaxError();
    }
    return this.getResult();
  }

  /** @returns {GraphJson} */
  getResult() {
    /** @type {GraphJson} */
    const result = {
      inports: this.inports || {},
      outports: this.outports || {},
      groups: [],
      processes: this.nodes,
      connections: this.processEdges(),
    };
    if (this.properties) {
      result.properties = this.properties;
    }
    result.caseSensitive = this.caseSensitive || false;

    const validateSchemaOption = this.options.validateSchema ?? false;
    if (validateSchemaOption) {
      validateSchema(result);
    }
    const validateContentsOption =
      this.options.validateContents === undefined ||
      this.options.validateContents;
    if (validateContentsOption) {
      validateContents(result);
    }
    return result;
  }

  /**
   * Pairs flattened edge fragments into connections, mirroring the reference
   * implementation's traversal, including which fragments get dropped.
   *
   * @returns {GraphConnection[]}
   */
  processEdges() {
    const flats = flatten(this.edges);
    /** @type {GraphConnection[]} */
    const grouped = [];
    for (let i = 1; i < flats.length; i++) {
      const previous = flats[i - 1];
      const current = flats[i];
      const previousIsSource =
        previous.src !== undefined || previous.data !== undefined;
      if (previousIsSource && current.tgt !== undefined) {
        previous.tgt = current.tgt;
        grouped.push(previous);
        i++;
      }
    }
    return grouped;
  }

  // ------------------------------------------------------------------
  // Lines
  // ------------------------------------------------------------------

  /** @returns {true | typeof FAIL} */
  parseLine() {
    const start = this.pos;

    this.skipSpaces();
    if (this.matchString('INPORT=')) {
      const node = this.parseNode();
      if (node !== FAIL && this.matchString('.')) {
        const port = this.parsePortName();
        if (port !== FAIL && this.matchString(':')) {
          const publicName = this.parsePortName();
          if (publicName !== FAIL) {
            this.skipSpaces();
            this.lineTerminator();
            this.registerInports(node, port, publicName);
            return true;
          }
        }
      }
    }

    this.pos = start;
    this.skipSpaces();
    if (this.matchString('OUTPORT=')) {
      const node = this.parseNode();
      if (node !== FAIL && this.matchString('.')) {
        const port = this.parsePortName();
        if (port !== FAIL && this.matchString(':')) {
          const publicName = this.parsePortName();
          if (publicName !== FAIL) {
            this.skipSpaces();
            this.lineTerminator();
            this.registerOutports(node, port, publicName);
            return true;
          }
        }
      }
    }

    this.pos = start;
    this.skipSpaces();
    if (this.matchString('DEFAULT_INPORT=')) {
      const name = this.parsePortName();
      if (name !== FAIL) {
        this.skipSpaces();
        this.lineTerminator();
        this.defaultInPort = name;
        return true;
      }
    }

    this.pos = start;
    this.skipSpaces();
    if (this.matchString('DEFAULT_OUTPORT=')) {
      const name = this.parsePortName();
      if (name !== FAIL) {
        this.skipSpaces();
        this.lineTerminator();
        this.defaultOutPort = name;
        return true;
      }
    }

    this.pos = start;
    const annotation = this.parseAnnotation();
    if (annotation !== FAIL) {
      return true;
    }

    this.pos = start;
    this.skipSpaces();
    if (this.peek() === '#') {
      this.skipToEndOfLine();
      this.matchNewline();
      return true;
    }

    this.pos = start;
    this.skipSpaces();
    if (this.matchNewline()) {
      return true;
    }

    this.pos = start;
    this.skipSpaces();
    const connection = this.parseConnection();
    if (connection !== FAIL) {
      this.skipSpaces();
      this.lineTerminator();
      this.registerEdges(connection);
      return true;
    }

    this.pos = start;
    return FAIL;
  }

  /**
   * Annotation line: `# @key value` followed by a required line break. A
   * failing annotation falls through to the plain comment alternative, so an
   * annotation on the last line without a trailing newline is ignored.
   *
   * @returns {true | typeof FAIL}
   */
  parseAnnotation() {
    if (this.peek() !== '#') {
      this.fail("'#'");
      return FAIL;
    }
    this.pos++;
    if (!this.matchSpaces()) {
      this.fail('whitespace');
      return FAIL;
    }
    if (!this.matchString('@')) {
      this.fail("'@'");
      return FAIL;
    }
    const keyMatch = this.matchRegex(ANNOTATION_KEY_RE);
    if (keyMatch === null) {
      this.fail('annotation key');
      return FAIL;
    }
    if (!this.matchSpaces()) {
      this.fail('whitespace');
      return FAIL;
    }
    const valueMatch = this.matchRegex(ANNOTATION_VALUE_RE);
    if (valueMatch === null) {
      this.fail('annotation value');
      return FAIL;
    }
    const key = keyMatch[0];
    const value = valueMatch[0];
    if (!this.matchNewline()) {
      this.fail('line break');
      return FAIL;
    }
    this.registerAnnotation(key, value);
    return true;
  }

  /** Consumes optional spaces, an optional comma, an optional comment, and an optional line break. @returns {void} */
  lineTerminator() {
    this.skipSpaces();
    this.matchString(',');
    this.skipSpaces();
    if (this.peek() === '#') {
      this.skipToEndOfLine();
    }
    this.matchNewline();
  }

  // ------------------------------------------------------------------
  // Connections
  // ------------------------------------------------------------------

  /** `connection = source "->" connection / destination`. @returns {any | typeof FAIL} */
  parseConnection() {
    const start = this.pos;
    const source = this.parseSource();
    if (source !== FAIL) {
      this.skipSpaces();
      if (this.matchString('->')) {
        this.skipSpaces();
        const rest = this.parseConnection();
        if (rest !== FAIL) {
          return [source, rest];
        }
      }
    }
    this.pos = start;
    return this.parseDestination();
  }

  /** `source = bridge / outport / iip`. @returns {any | typeof FAIL} */
  parseSource() {
    const start = this.pos;
    const bridge = this.parseBridge();
    if (bridge !== FAIL) {
      return bridge;
    }
    this.pos = start;
    const outport = this.parseOutport();
    if (outport !== FAIL) {
      return outport;
    }
    this.pos = start;
    return this.parseIip();
  }

  /** `destination = inport / bridge`. @returns {any | typeof FAIL} */
  parseDestination() {
    const start = this.pos;
    const inport = this.parseInport();
    if (inport !== FAIL) {
      return inport;
    }
    this.pos = start;
    return this.parseBridge();
  }

  /**
   * A chain node in the middle of a connection, producing both a target and a
   * source fragment. The first alternative requires ports on both sides of a
   * plain node name; the second allows a component declaration with optional
   * ports.
   *
   * @returns {any | typeof FAIL}
   */
  parseBridge() {
    const start = this.pos;

    const leftPort = this.parsePortBeforeSpace();
    if (leftPort !== FAIL) {
      const node = this.parseNode();
      if (node !== FAIL) {
        const rightPort = this.parseSpaceBeforePort();
        if (rightPort !== FAIL) {
          return [
            { tgt: this.makeInPort(node, leftPort) },
            { src: this.makeOutPort(node, rightPort) },
          ];
        }
      }
    }

    this.pos = start;
    const optionalLeft = this.parsePortBeforeSpaceOptional();
    const nodeWithComponent = this.parseNodeWithComponent();
    if (nodeWithComponent === FAIL) {
      return FAIL;
    }
    const optionalRight = this.parseSpaceBeforePortOptional();
    return [
      { tgt: this.makeInPort(nodeWithComponent, optionalLeft) },
      { src: this.makeOutPort(nodeWithComponent, optionalRight) },
    ];
  }

  /** A node with an optional outbound port: `node port?`. @returns {any | typeof FAIL} */
  parseOutport() {
    const node = this.parseNode();
    if (node === FAIL) {
      return FAIL;
    }
    const port = this.parseSpaceBeforePortOptional();
    return { src: this.makeOutPort(node, port) };
  }

  /** A node with an optional inbound port: `port? node`. @returns {any | typeof FAIL} */
  parseInport() {
    const port = this.parsePortBeforeSpaceOptional();
    const node = this.parseNode();
    if (node === FAIL) {
      return FAIL;
    }
    return { tgt: this.makeInPort(node, port) };
  }

  /** A quoted string or JSON literal IIP. @returns {any | typeof FAIL} */
  parseIip() {
    if (this.peek() === "'") {
      return this.parseQuotedIip();
    }
    const scanned = scanJsonText(this.input, this.pos);
    if (scanned === null) {
      this.fail('number, string, "{", or "["');
      return FAIL;
    }
    this.pos = scanned.end;
    return { data: scanned.value };
  }

  /** Single-quoted IIP where only `\'` is escaped. @returns {any | typeof FAIL} */
  parseQuotedIip() {
    this.pos++; // opening quote
    let value = '';
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (c === '\\' && this.input[this.pos + 1] === "'") {
        value += "'";
        this.pos += 2;
        continue;
      }
      if (c === "'") {
        this.pos++;
        return { data: value };
      }
      value += c;
      this.pos++;
    }
    this.fail("closing \"'\"");
    return FAIL;
  }

  // ------------------------------------------------------------------
  // Nodes and ports
  // ------------------------------------------------------------------

  /** `node = nodeNameAndComponent / nodeName / nodeComponent`. @returns {string | typeof FAIL} */
  parseNode() {
    const start = this.pos;
    const named = this.parseNodeName();
    if (named !== FAIL) {
      const component = this.parseComponent();
      if (component !== FAIL) {
        this.addNode(named, component);
        return named;
      }
    }

    this.pos = start;
    const bare = this.parseNodeName();
    if (bare !== FAIL) {
      return bare;
    }

    this.pos = start;
    return this.parseNodeComponent();
  }

  /** `nodeWithComponent = nodeNameAndComponent / nodeComponent`. @returns {string | typeof FAIL} */
  parseNodeWithComponent() {
    const start = this.pos;
    const name = this.parseNodeName();
    if (name !== FAIL) {
      const component = this.parseComponent();
      if (component !== FAIL) {
        this.addNode(name, component);
        return name;
      }
    }
    this.pos = start;
    return this.parseNodeComponent();
  }

  /** An anonymous node: a bare component declaration. @returns {string | typeof FAIL} */
  parseNodeComponent() {
    const start = this.pos;
    const component = this.parseComponent();
    if (component === FAIL) {
      return FAIL;
    }
    return this.addAnonymousNode(component, start);
  }

  /** @returns {string | typeof FAIL} */
  parseNodeName() {
    const match = this.matchRegex(NODE_NAME_RE);
    if (match === null) {
      this.fail('process name');
      return FAIL;
    }
    return match[0];
  }

  /**
   * A component declaration in parentheses, with optional metadata.
   *
   * @returns {{ comp: string, meta: string[] | null } | typeof FAIL}
   */
  parseComponent() {
    const match = this.matchRegex(COMPONENT_RE);
    if (match === null) {
      this.fail('component in parentheses');
      return FAIL;
    }
    return {
      comp: match[1] ?? '',
      meta: match[2] !== undefined ? match[2].split(',') : null,
    };
  }

  /** A port name with optional array index. @returns {{ port: string, index: number | undefined } | typeof FAIL} */
  parsePort() {
    const name = this.parsePortName();
    if (name === FAIL) {
      return FAIL;
    }
    const indexMatch = this.matchRegex(PORT_INDEX_RE);
    const index =
      indexMatch === null ? undefined : parseInt(indexMatch[1], 10);
    return {
      port: this.caseSensitive ? name : name.toLowerCase(),
      index,
    };
  }

  /** @returns {string | typeof FAIL} */
  parsePortName() {
    const match = this.matchRegex(PORT_NAME_RE);
    if (match === null) {
      this.fail('port name');
      return FAIL;
    }
    return match[0];
  }

  /** A port followed by one or more spaces; both must match. @returns {any | typeof FAIL} */
  parsePortBeforeSpace() {
    const start = this.pos;
    const port = this.parsePort();
    if (port === FAIL) {
      return FAIL;
    }
    if (!this.matchSpaces()) {
      this.pos = start;
      this.fail('whitespace');
      return FAIL;
    }
    return port;
  }

  /** One or more spaces followed by a port; both must match. @returns {any | typeof FAIL} */
  parseSpaceBeforePort() {
    const start = this.pos;
    if (!this.matchSpaces()) {
      this.fail('whitespace');
      return FAIL;
    }
    const port = this.parsePort();
    if (port === FAIL) {
      this.pos = start;
      return FAIL;
    }
    return port;
  }

  /** All-or-nothing optional `parsePortBeforeSpace`. @returns {any | null} */
  parsePortBeforeSpaceOptional() {
    const start = this.pos;
    const port = this.parsePortBeforeSpace();
    if (port === FAIL) {
      this.pos = start;
      return null;
    }
    return port;
  }

  /** All-or-nothing optional `parseSpaceBeforePort`. @returns {any | null} */
  parseSpaceBeforePortOptional() {
    const start = this.pos;
    const port = this.parseSpaceBeforePort();
    if (port === FAIL) {
      this.pos = start;
      return null;
    }
    return port;
  }

  // ------------------------------------------------------------------
  // Graph assembly
  // ------------------------------------------------------------------

  /**
   * @param {string} nodeName
   * @param {{ comp: string, meta: string[] | null }} component
   * @returns {void}
   */
  addNode(nodeName, component) {
    if (!this.nodes[nodeName]) {
      this.nodes[nodeName] = {};
    }
    if (component.comp) {
      this.nodes[nodeName].component = component.comp;
    }
    if (component.meta) {
      /** @type {Record<string, any>} */
      const metadata = {};
      for (const entry of component.meta) {
        const parts = entry.split('=');
        let key = parts[0];
        let value = parts[1];
        if (parts.length === 1) {
          key = 'routes';
          value = parts[0];
        }
        if (key === 'x' || key === 'y') {
          value = parseFloat(/** @type {string} */ (value));
        }
        metadata[key] = value;
      }
      this.nodes[nodeName].metadata = metadata;
    }
  }

  /**
   * @param {{ comp: string, meta: string[] | null }} component
   * @param {number} offset
   * @returns {string}
   */
  addAnonymousNode(component, offset) {
    if (!this.anonymousNames[offset]) {
      const componentName = component.comp.replace(/[^a-zA-Z0-9]+/, '_');
      this.anonymousCounters[componentName] =
        (this.anonymousCounters[componentName] || 0) + 1;
      this.anonymousNames[offset] =
        '_' + componentName + '_' + this.anonymousCounters[componentName];
      this.addNode(this.anonymousNames[offset], component);
    }
    return this.anonymousNames[offset];
  }

  /**
   * @param {string} processName
   * @param {any} port
   * @returns {GraphPort}
   */
  makeInPort(processName, port) {
    return this.makePort(processName, port, this.defaultInPort);
  }

  /**
   * @param {string} processName
   * @param {any} port
   * @returns {GraphPort}
   */
  makeOutPort(processName, port) {
    return this.makePort(processName, port, this.defaultOutPort);
  }

  /**
   * @param {string} processName
   * @param {any} port
   * @param {string} defaultPort
   * @returns {GraphPort}
   */
  makePort(processName, port, defaultPort) {
    if (!this.caseSensitive) {
      defaultPort = defaultPort.toLowerCase();
    }
    /** @type {GraphPort} */
    const portDefinition = {
      process: processName,
      port: port ? port.port : defaultPort,
    };
    if (port && port.index != null) {
      portDefinition.index = port.index;
    }
    return portDefinition;
  }

  /**
   * @param {string} nodeName
   * @param {string} port
   * @param {string} publicName
   * @returns {void}
   */
  registerInports(nodeName, port, publicName) {
    if (!this.inports) {
      this.inports = {};
    }
    let portName = port;
    let name = publicName;
    if (!this.caseSensitive) {
      name = name.toLowerCase();
      portName = portName.toLowerCase();
    }
    this.inports[name] = { process: nodeName, port: portName };
  }

  /**
   * @param {string} nodeName
   * @param {string} port
   * @param {string} publicName
   * @returns {void}
   */
  registerOutports(nodeName, port, publicName) {
    if (!this.outports) {
      this.outports = {};
    }
    let portName = port;
    let name = publicName;
    if (!this.caseSensitive) {
      name = name.toLowerCase();
      portName = portName.toLowerCase();
    }
    this.outports[name] = { process: nodeName, port: portName };
  }

  /**
   * @param {string} key
   * @param {string} value
   * @returns {void}
   */
  registerAnnotation(key, value) {
    if (!this.properties) {
      this.properties = {};
    }
    if (key === 'runtime') {
      this.properties.environment = {};
      this.properties.environment.type = value;
      return;
    }
    this.properties[key] = value;
  }

  /**
   * @param {any} edges
   * @returns {void}
   */
  registerEdges(edges) {
    if (Array.isArray(edges)) {
      for (const edge of edges) {
        this.edges.push(edge);
      }
    }
  }

  // ------------------------------------------------------------------
  // Lexing helpers
  // ------------------------------------------------------------------

  /** Zero or more ASCII spaces (`_` in the reference grammar). @returns {void} */
  skipSpaces() {
    while (this.input[this.pos] === ' ') {
      this.pos++;
    }
  }

  /** One or more ASCII spaces (`__` in the reference grammar). @returns {boolean} */
  matchSpaces() {
    const start = this.pos;
    while (this.input[this.pos] === ' ') {
      this.pos++;
    }
    if (this.pos === start) {
      this.fail('whitespace');
      return false;
    }
    return true;
  }

  /**
   * @param {string} text
   * @returns {boolean}
   */
  matchString(text) {
    if (this.input.startsWith(text, this.pos)) {
      this.pos += text.length;
      return true;
    }
    this.fail(`"${text}"`);
    return false;
  }

  /** @returns {boolean} */
  matchNewline() {
    const c = this.input[this.pos];
    if (c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029') {
      this.pos++;
      return true;
    }
    this.fail('line break');
    return false;
  }

  /** @returns {string} */
  peek() {
    return this.input[this.pos];
  }

  /**
   * @param {RegExp} regex A sticky regex.
   * @returns {RegExpExecArray | null}
   */
  matchRegex(regex) {
    regex.lastIndex = this.pos;
    const match = regex.exec(this.input);
    if (!match) {
      this.fail(regex.source);
      return null;
    }
    this.pos = regex.lastIndex;
    return match;
  }

  /** @returns {void} */
  skipToEndOfLine() {
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029') {
        break;
      }
      this.pos++;
    }
  }

  /**
   * @param {string} expected
   * @returns {void}
   */
  fail(expected) {
    if (this.pos > this.maxFailPos) {
      this.maxFailPos = this.pos;
      this.maxFailExpected = expected;
    }
  }

  /** @returns {SyntaxError} */
  syntaxError() {
    const location = this.computeLocation(this.maxFailPos);
    const found = this.input[this.maxFailPos];
    const foundDescription =
      found === undefined ? 'end of input' : `"${found}"`;
    return new SyntaxError(
      `Expected ${this.maxFailExpected} but ${foundDescription} found at line ${location.start.line}, column ${location.start.column}.`,
      location,
      found,
    );
  }

  /**
   * @param {number} offset
   * @returns {SyntaxErrorLocation}
   */
  computeLocation(offset) {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < offset; i++) {
      const c = this.input[i];
      if (c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029') {
        if (c === '\r' && this.input[i + 1] === '\n') {
          i++;
        }
        line++;
        lineStart = i + 1;
      }
    }
    return {
      start: { line, column: offset - lineStart + 1, offset },
      end: { line, column: offset - lineStart + 1, offset },
    };
  }
}

/**
 * @param {any[]} array
 * @returns {any[]}
 */
function flatten(array) {
  /** @type {any[]} */
  const result = [];
  for (const value of array) {
    if (Array.isArray(value)) {
      result.push(...flatten(value));
    } else {
      result.push(value);
    }
  }
  return result;
}
