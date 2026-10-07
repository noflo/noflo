/**
 * Strict RFC 7159 JSON text scanner.
 *
 * Scans a JSON value out of a string at a given position, mirroring the JSON
 * grammar the reference `fbp` parser uses for IIP literals, including its
 * whitespace handling: optional leading whitespace made of spaces, tabs, and
 * line breaks, and the same whitespace class greedily consumed after the
 * value.
 *
 * @module
 */

/**
 * @typedef {object} JsonScanResult
 * @property {any} value Parsed JSON value.
 * @property {number} end Offset just past the value and its trailing whitespace.
 */

const FAIL = Symbol("json-fail");

const NUMBER_RE = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const HEX_RE = /[0-9a-fA-F]/y;

const ESCAPES = /** @type {const} */ ({
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
});

/**
 * Scans a single JSON value from `input` starting at `start`.
 *
 * Leading and trailing whitespace (`space`, tab, newline, carriage return) is
 * consumed as part of the match, exactly like the reference parser's
 * `JSON_text = ws value ws` rule.
 *
 * @param {string} input
 * @param {number} start
 * @returns {JsonScanResult | null} `null` when no valid JSON value matches.
 */
export function scanJsonText(input, start) {
  const scanner = new JsonScanner(input, start);
  const value = scanner.jsonText();
  if (value === FAIL) {
    return null;
  }
  return { value, end: scanner.pos };
}

class JsonScanner {
  /**
   * @param {string} input
   * @param {number} pos
   */
  constructor(input, pos) {
    this.input = input;
    this.pos = pos;
  }

  /** @returns {void} */
  skipWhitespace() {
    const input = this.input;
    while (this.pos < input.length) {
      const c = input[this.pos];
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
        break;
      }
      this.pos++;
    }
  }

  /** @returns {any} Parsed value, or the internal FAIL sentinel. */
  jsonText() {
    this.skipWhitespace();
    const value = this.value();
    if (value === FAIL) {
      return FAIL;
    }
    this.skipWhitespace();
    return value;
  }

  /** @returns {any} */
  value() {
    const c = this.input[this.pos];
    switch (c) {
      case "{":
        return this.object();
      case "[":
        return this.array();
      case '"':
        return this.string();
      case "t":
        return this.literal("true", true);
      case "f":
        return this.literal("false", false);
      case "n":
        return this.literal("null", null);
      default:
        return this.number();
    }
  }

  /**
   * @param {string} text
   * @param {any} value
   * @returns {any}
   */
  literal(text, value) {
    if (this.input.startsWith(text, this.pos)) {
      this.pos += text.length;
      return value;
    }
    return FAIL;
  }

  /** @returns {any} */
  object() {
    this.pos++; // "{"
    this.skipWhitespace();
    /** @type {Record<string, any>} */
    const result = {};
    if (this.input[this.pos] === "}") {
      this.pos++;
      return result;
    }
    while (true) {
      const key = this.string();
      if (key === FAIL) {
        return FAIL;
      }
      this.skipWhitespace();
      if (this.input[this.pos] !== ":") {
        return FAIL;
      }
      this.pos++;
      this.skipWhitespace();
      const value = this.value();
      if (value === FAIL) {
        return FAIL;
      }
      result[key] = value;
      this.skipWhitespace();
      if (this.input[this.pos] === ",") {
        this.pos++;
        this.skipWhitespace();
        continue;
      }
      if (this.input[this.pos] === "}") {
        this.pos++;
        return result;
      }
      return FAIL;
    }
  }

  /** @returns {any} */
  array() {
    this.pos++; // "["
    this.skipWhitespace();
    /** @type {any[]} */
    const result = [];
    if (this.input[this.pos] === "]") {
      this.pos++;
      return result;
    }
    while (true) {
      const value = this.value();
      if (value === FAIL) {
        return FAIL;
      }
      result.push(value);
      this.skipWhitespace();
      if (this.input[this.pos] === ",") {
        this.pos++;
        this.skipWhitespace();
        continue;
      }
      if (this.input[this.pos] === "]") {
        this.pos++;
        return result;
      }
      return FAIL;
    }
  }

  /** @returns {any} */
  string() {
    if (this.input[this.pos] !== '"') {
      return FAIL;
    }
    this.pos++;
    let result = "";
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (c === '"') {
        this.pos++;
        return result;
      }
      if (c === "\\") {
        this.pos++;
        const escaped = this.input[this.pos];
        if (escaped === "u") {
          this.pos++;
          let code = 0;
          for (let i = 0; i < 4; i++) {
            HEX_RE.lastIndex = this.pos;
            const hex = HEX_RE.exec(this.input);
            if (!hex) {
              return FAIL;
            }
            code = code * 16 + parseInt(hex[0], 16);
            this.pos++;
          }
          result += String.fromCharCode(code);
          continue;
        }
        const mapped = ESCAPES[/** @type {keyof typeof ESCAPES} */ (escaped)];
        if (mapped === undefined) {
          return FAIL;
        }
        result += mapped;
        this.pos++;
        continue;
      }
      const codeUnit = c.charCodeAt(0);
      if (codeUnit < 0x20) {
        return FAIL;
      }
      result += c;
      this.pos++;
    }
    return FAIL;
  }

  /** @returns {any} */
  number() {
    NUMBER_RE.lastIndex = this.pos;
    const match = NUMBER_RE.exec(this.input);
    if (!match) {
      return FAIL;
    }
    this.pos = NUMBER_RE.lastIndex;
    return parseFloat(match[0]);
  }
}
