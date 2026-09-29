// @ts-nocheck — vendored bundle, not type-checked
/**
 * @implements {IHooks}
 */
class Hooks {
  /**
   * @callback HookCallback
   * @this {*|Jsep} this
   * @param {Jsep} env
   * @returns: void
   */
  /**
   * Adds the given callback to the list of callbacks for the given hook.
   *
   * The callback will be invoked when the hook it is registered for is run.
   *
   * One callback function can be registered to multiple hooks and the same hook multiple times.
   *
   * @param {string|object} name The name of the hook, or an object of callbacks keyed by name
   * @param {HookCallback|boolean} callback The callback function which is given environment variables.
   * @param {?boolean} [first=false] Will add the hook to the top of the list (defaults to the bottom)
   * @public
   */
  add(name, callback, first) {
    if (typeof arguments[0] != 'string') {
      // Multiple hook callbacks, keyed by name
      for (let name in arguments[0]) {
        this.add(name, arguments[0][name], arguments[1]);
      }
    } else {
      (Array.isArray(name) ? name : [name]).forEach(function (name) {
        this[name] = this[name] || [];
        if (callback) {
          this[name][first ? 'unshift' : 'push'](callback);
        }
      }, this);
    }
  }

  /**
   * Runs a hook invoking all registered callbacks with the given environment variables.
   *
   * Callbacks will be invoked synchronously and in the order in which they were registered.
   *
   * @param {string} name The name of the hook.
   * @param {Object<string, any>} env The environment variables of the hook passed to all callbacks registered.
   * @public
   */
  run(name, env) {
    this[name] = this[name] || [];
    this[name].forEach(function (callback) {
      callback.call(env && env.context ? env.context : env, env);
    });
  }
}

/**
 * @implements {IPlugins}
 */
class Plugins {
  constructor(jsep) {
    this.jsep = jsep;
    this.registered = {};
  }

  /**
   * @callback PluginSetup
   * @this {Jsep} jsep
   * @returns: void
   */
  /**
   * Adds the given plugin(s) to the registry
   *
   * @param {object} plugins
   * @param {string} plugins.name The name of the plugin
   * @param {PluginSetup} plugins.init The init function
   * @public
   */
  register(...plugins) {
    plugins.forEach(plugin => {
      if (typeof plugin !== 'object' || !plugin.name || !plugin.init) {
        throw new Error('Invalid JSEP plugin format');
      }
      if (this.registered[plugin.name]) {
        // already registered. Ignore.
        return;
      }
      plugin.init(this.jsep);
      this.registered[plugin.name] = plugin;
    });
  }
}

//     JavaScript Expression Parser (JSEP) 1.4.0

class Jsep {
  /**
   * @returns {string}
   */
  static get version() {
    // To be filled in by the template
    return '1.4.0';
  }

  /**
   * @returns {string}
   */
  static toString() {
    return 'JavaScript Expression Parser (JSEP) v' + Jsep.version;
  }
  // ==================== CONFIG ================================
  /**
   * @method addUnaryOp
   * @param {string} op_name The name of the unary op to add
   * @returns {Jsep}
   */
  static addUnaryOp(op_name) {
    Jsep.max_unop_len = Math.max(op_name.length, Jsep.max_unop_len);
    Jsep.unary_ops[op_name] = 1;
    return Jsep;
  }

  /**
   * @method jsep.addBinaryOp
   * @param {string} op_name The name of the binary op to add
   * @param {number} precedence The precedence of the binary op (can be a float). Higher number = higher precedence
   * @param {boolean} [isRightAssociative=false] whether operator is right-associative
   * @returns {Jsep}
   */
  static addBinaryOp(op_name, precedence, isRightAssociative) {
    Jsep.max_binop_len = Math.max(op_name.length, Jsep.max_binop_len);
    Jsep.binary_ops[op_name] = precedence;
    if (isRightAssociative) {
      Jsep.right_associative.add(op_name);
    } else {
      Jsep.right_associative.delete(op_name);
    }
    return Jsep;
  }

  /**
   * @method addIdentifierChar
   * @param {string} char The additional character to treat as a valid part of an identifier
   * @returns {Jsep}
   */
  static addIdentifierChar(char) {
    Jsep.additional_identifier_chars.add(char);
    return Jsep;
  }

  /**
   * @method addLiteral
   * @param {string} literal_name The name of the literal to add
   * @param {*} literal_value The value of the literal
   * @returns {Jsep}
   */
  static addLiteral(literal_name, literal_value) {
    Jsep.literals[literal_name] = literal_value;
    return Jsep;
  }

  /**
   * @method removeUnaryOp
   * @param {string} op_name The name of the unary op to remove
   * @returns {Jsep}
   */
  static removeUnaryOp(op_name) {
    delete Jsep.unary_ops[op_name];
    if (op_name.length === Jsep.max_unop_len) {
      Jsep.max_unop_len = Jsep.getMaxKeyLen(Jsep.unary_ops);
    }
    return Jsep;
  }

  /**
   * @method removeAllUnaryOps
   * @returns {Jsep}
   */
  static removeAllUnaryOps() {
    Jsep.unary_ops = {};
    Jsep.max_unop_len = 0;
    return Jsep;
  }

  /**
   * @method removeIdentifierChar
   * @param {string} char The additional character to stop treating as a valid part of an identifier
   * @returns {Jsep}
   */
  static removeIdentifierChar(char) {
    Jsep.additional_identifier_chars.delete(char);
    return Jsep;
  }

  /**
   * @method removeBinaryOp
   * @param {string} op_name The name of the binary op to remove
   * @returns {Jsep}
   */
  static removeBinaryOp(op_name) {
    delete Jsep.binary_ops[op_name];
    if (op_name.length === Jsep.max_binop_len) {
      Jsep.max_binop_len = Jsep.getMaxKeyLen(Jsep.binary_ops);
    }
    Jsep.right_associative.delete(op_name);
    return Jsep;
  }

  /**
   * @method removeAllBinaryOps
   * @returns {Jsep}
   */
  static removeAllBinaryOps() {
    Jsep.binary_ops = {};
    Jsep.max_binop_len = 0;
    return Jsep;
  }

  /**
   * @method removeLiteral
   * @param {string} literal_name The name of the literal to remove
   * @returns {Jsep}
   */
  static removeLiteral(literal_name) {
    delete Jsep.literals[literal_name];
    return Jsep;
  }

  /**
   * @method removeAllLiterals
   * @returns {Jsep}
   */
  static removeAllLiterals() {
    Jsep.literals = {};
    return Jsep;
  }
  // ==================== END CONFIG ============================

  /**
   * @returns {string}
   */
  get char() {
    return this.expr.charAt(this.index);
  }

  /**
   * @returns {number}
   */
  get code() {
    return this.expr.charCodeAt(this.index);
  }
  /**
   * @param {string} expr a string with the passed in express
   * @returns Jsep
   */
  constructor(expr) {
    // `index` stores the character number we are currently at
    // All of the gobbles below will modify `index` as we move along
    this.expr = expr;
    this.index = 0;
  }

  /**
   * static top-level parser
   * @returns {jsep.Expression}
   */
  static parse(expr) {
    return new Jsep(expr).parse();
  }

  /**
   * Get the longest key length of any object
   * @param {object} obj
   * @returns {number}
   */
  static getMaxKeyLen(obj) {
    return Math.max(0, ...Object.keys(obj).map(k => k.length));
  }

  /**
   * `ch` is a character code in the next three functions
   * @param {number} ch
   * @returns {boolean}
   */
  static isDecimalDigit(ch) {
    return ch >= 48 && ch <= 57; // 0...9
  }

  /**
   * Returns the precedence of a binary operator or `0` if it isn't a binary operator. Can be float.
   * @param {string} op_val
   * @returns {number}
   */
  static binaryPrecedence(op_val) {
    return Jsep.binary_ops[op_val] || 0;
  }

  /**
   * Looks for start of identifier
   * @param {number} ch
   * @returns {boolean}
   */
  static isIdentifierStart(ch) {
    return ch >= 65 && ch <= 90 ||
    // A...Z
    ch >= 97 && ch <= 122 ||
    // a...z
    ch >= 128 && !Jsep.binary_ops[String.fromCharCode(ch)] ||
    // any non-ASCII that is not an operator
    Jsep.additional_identifier_chars.has(String.fromCharCode(ch)); // additional characters
  }

  /**
   * @param {number} ch
   * @returns {boolean}
   */
  static isIdentifierPart(ch) {
    return Jsep.isIdentifierStart(ch) || Jsep.isDecimalDigit(ch);
  }

  /**
   * throw error at index of the expression
   * @param {string} message
   * @throws
   */
  throwError(message) {
    const error = new Error(message + ' at character ' + this.index);
    error.index = this.index;
    error.description = message;
    throw error;
  }

  /**
   * Run a given hook
   * @param {string} name
   * @param {jsep.Expression|false} [node]
   * @returns {?jsep.Expression}
   */
  runHook(name, node) {
    if (Jsep.hooks[name]) {
      const env = {
        context: this,
        node
      };
      Jsep.hooks.run(name, env);
      return env.node;
    }
    return node;
  }

  /**
   * Runs a given hook until one returns a node
   * @param {string} name
   * @returns {?jsep.Expression}
   */
  searchHook(name) {
    if (Jsep.hooks[name]) {
      const env = {
        context: this
      };
      Jsep.hooks[name].find(function (callback) {
        callback.call(env.context, env);
        return env.node;
      });
      return env.node;
    }
  }

  /**
   * Push `index` up to the next non-space character
   */
  gobbleSpaces() {
    let ch = this.code;
    // Whitespace
    while (ch === Jsep.SPACE_CODE || ch === Jsep.TAB_CODE || ch === Jsep.LF_CODE || ch === Jsep.CR_CODE) {
      ch = this.expr.charCodeAt(++this.index);
    }
    this.runHook('gobble-spaces');
  }

  /**
   * Top-level method to parse all expressions and returns compound or single node
   * @returns {jsep.Expression}
   */
  parse() {
    this.runHook('before-all');
    const nodes = this.gobbleExpressions();

    // If there's only one expression just try returning the expression
    const node = nodes.length === 1 ? nodes[0] : {
      type: Jsep.COMPOUND,
      body: nodes
    };
    return this.runHook('after-all', node);
  }

  /**
   * top-level parser (but can be reused within as well)
   * @param {number} [untilICode]
   * @returns {jsep.Expression[]}
   */
  gobbleExpressions(untilICode) {
    let nodes = [],
      ch_i,
      node;
    while (this.index < this.expr.length) {
      ch_i = this.code;

      // Expressions can be separated by semicolons, commas, or just inferred without any
      // separators
      if (ch_i === Jsep.SEMCOL_CODE || ch_i === Jsep.COMMA_CODE) {
        this.index++; // ignore separators
      } else {
        // Try to gobble each expression individually
        if (node = this.gobbleExpression()) {
          nodes.push(node);
          // If we weren't able to find a binary expression and are out of room, then
          // the expression passed in probably has too much
        } else if (this.index < this.expr.length) {
          if (ch_i === untilICode) {
            break;
          }
          this.throwError('Unexpected "' + this.char + '"');
        }
      }
    }
    return nodes;
  }

  /**
   * The main parsing function.
   * @returns {?jsep.Expression}
   */
  gobbleExpression() {
    const node = this.searchHook('gobble-expression') || this.gobbleBinaryExpression();
    this.gobbleSpaces();
    return this.runHook('after-expression', node);
  }

  /**
   * Search for the operation portion of the string (e.g. `+`, `===`)
   * Start by taking the longest possible binary operations (3 characters: `===`, `!==`, `>>>`)
   * and move down from 3 to 2 to 1 character until a matching binary operation is found
   * then, return that binary operation
   * @returns {string|boolean}
   */
  gobbleBinaryOp() {
    this.gobbleSpaces();
    let to_check = this.expr.substr(this.index, Jsep.max_binop_len);
    let tc_len = to_check.length;
    while (tc_len > 0) {
      // Don't accept a binary op when it is an identifier.
      // Binary ops that start with a identifier-valid character must be followed
      // by a non identifier-part valid character
      if (Jsep.binary_ops.hasOwnProperty(to_check) && (!Jsep.isIdentifierStart(this.code) || this.index + to_check.length < this.expr.length && !Jsep.isIdentifierPart(this.expr.charCodeAt(this.index + to_check.length)))) {
        this.index += tc_len;
        return to_check;
      }
      to_check = to_check.substr(0, --tc_len);
    }
    return false;
  }

  /**
   * This function is responsible for gobbling an individual expression,
   * e.g. `1`, `1+2`, `a+(b*2)-Math.sqrt(2)`
   * @returns {?jsep.BinaryExpression}
   */
  gobbleBinaryExpression() {
    let node, biop, prec, stack, biop_info, left, right, i, cur_biop;

    // First, try to get the leftmost thing
    // Then, check to see if there's a binary operator operating on that leftmost thing
    // Don't gobbleBinaryOp without a left-hand-side
    left = this.gobbleToken();
    if (!left) {
      return left;
    }
    biop = this.gobbleBinaryOp();

    // If there wasn't a binary operator, just return the leftmost node
    if (!biop) {
      return left;
    }

    // Otherwise, we need to start a stack to properly place the binary operations in their
    // precedence structure
    biop_info = {
      value: biop,
      prec: Jsep.binaryPrecedence(biop),
      right_a: Jsep.right_associative.has(biop)
    };
    right = this.gobbleToken();
    if (!right) {
      this.throwError("Expected expression after " + biop);
    }
    stack = [left, biop_info, right];

    // Properly deal with precedence using [recursive descent](http://www.engr.mun.ca/~theo/Misc/exp_parsing.htm)
    while (biop = this.gobbleBinaryOp()) {
      prec = Jsep.binaryPrecedence(biop);
      if (prec === 0) {
        this.index -= biop.length;
        break;
      }
      biop_info = {
        value: biop,
        prec,
        right_a: Jsep.right_associative.has(biop)
      };
      cur_biop = biop;

      // Reduce: make a binary expression from the three topmost entries.
      const comparePrev = prev => biop_info.right_a && prev.right_a ? prec > prev.prec : prec <= prev.prec;
      while (stack.length > 2 && comparePrev(stack[stack.length - 2])) {
        right = stack.pop();
        biop = stack.pop().value;
        left = stack.pop();
        node = {
          type: Jsep.BINARY_EXP,
          operator: biop,
          left,
          right
        };
        stack.push(node);
      }
      node = this.gobbleToken();
      if (!node) {
        this.throwError("Expected expression after " + cur_biop);
      }
      stack.push(biop_info, node);
    }
    i = stack.length - 1;
    node = stack[i];
    while (i > 1) {
      node = {
        type: Jsep.BINARY_EXP,
        operator: stack[i - 1].value,
        left: stack[i - 2],
        right: node
      };
      i -= 2;
    }
    return node;
  }

  /**
   * An individual part of a binary expression:
   * e.g. `foo.bar(baz)`, `1`, `"abc"`, `(a % 2)` (because it's in parenthesis)
   * @returns {boolean|jsep.Expression}
   */
  gobbleToken() {
    let ch, to_check, tc_len, node;
    this.gobbleSpaces();
    node = this.searchHook('gobble-token');
    if (node) {
      return this.runHook('after-token', node);
    }
    ch = this.code;
    if (Jsep.isDecimalDigit(ch) || ch === Jsep.PERIOD_CODE) {
      // Char code 46 is a dot `.` which can start off a numeric literal
      return this.gobbleNumericLiteral();
    }
    if (ch === Jsep.SQUOTE_CODE || ch === Jsep.DQUOTE_CODE) {
      // Single or double quotes
      node = this.gobbleStringLiteral();
    } else if (ch === Jsep.OBRACK_CODE) {
      node = this.gobbleArray();
    } else {
      to_check = this.expr.substr(this.index, Jsep.max_unop_len);
      tc_len = to_check.length;
      while (tc_len > 0) {
        // Don't accept an unary op when it is an identifier.
        // Unary ops that start with a identifier-valid character must be followed
        // by a non identifier-part valid character
        if (Jsep.unary_ops.hasOwnProperty(to_check) && (!Jsep.isIdentifierStart(this.code) || this.index + to_check.length < this.expr.length && !Jsep.isIdentifierPart(this.expr.charCodeAt(this.index + to_check.length)))) {
          this.index += tc_len;
          const argument = this.gobbleToken();
          if (!argument) {
            this.throwError('missing unaryOp argument');
          }
          return this.runHook('after-token', {
            type: Jsep.UNARY_EXP,
            operator: to_check,
            argument,
            prefix: true
          });
        }
        to_check = to_check.substr(0, --tc_len);
      }
      if (Jsep.isIdentifierStart(ch)) {
        node = this.gobbleIdentifier();
        if (Jsep.literals.hasOwnProperty(node.name)) {
          node = {
            type: Jsep.LITERAL,
            value: Jsep.literals[node.name],
            raw: node.name
          };
        } else if (node.name === Jsep.this_str) {
          node = {
            type: Jsep.THIS_EXP
          };
        }
      } else if (ch === Jsep.OPAREN_CODE) {
        // open parenthesis
        node = this.gobbleGroup();
      }
    }
    if (!node) {
      return this.runHook('after-token', false);
    }
    node = this.gobbleTokenProperty(node);
    return this.runHook('after-token', node);
  }

  /**
   * Gobble properties of of identifiers/strings/arrays/groups.
   * e.g. `foo`, `bar.baz`, `foo['bar'].baz`
   * It also gobbles function calls:
   * e.g. `Math.acos(obj.angle)`
   * @param {jsep.Expression} node
   * @returns {jsep.Expression}
   */
  gobbleTokenProperty(node) {
    this.gobbleSpaces();
    let ch = this.code;
    while (ch === Jsep.PERIOD_CODE || ch === Jsep.OBRACK_CODE || ch === Jsep.OPAREN_CODE || ch === Jsep.QUMARK_CODE) {
      let optional;
      if (ch === Jsep.QUMARK_CODE) {
        if (this.expr.charCodeAt(this.index + 1) !== Jsep.PERIOD_CODE) {
          break;
        }
        optional = true;
        this.index += 2;
        this.gobbleSpaces();
        ch = this.code;
      }
      this.index++;
      if (ch === Jsep.OBRACK_CODE) {
        node = {
          type: Jsep.MEMBER_EXP,
          computed: true,
          object: node,
          property: this.gobbleExpression()
        };
        if (!node.property) {
          this.throwError('Unexpected "' + this.char + '"');
        }
        this.gobbleSpaces();
        ch = this.code;
        if (ch !== Jsep.CBRACK_CODE) {
          this.throwError('Unclosed [');
        }
        this.index++;
      } else if (ch === Jsep.OPAREN_CODE) {
        // A function call is being made; gobble all the arguments
        node = {
          type: Jsep.CALL_EXP,
          'arguments': this.gobbleArguments(Jsep.CPAREN_CODE),
          callee: node
        };
      } else if (ch === Jsep.PERIOD_CODE || optional) {
        if (optional) {
          this.index--;
        }
        this.gobbleSpaces();
        node = {
          type: Jsep.MEMBER_EXP,
          computed: false,
          object: node,
          property: this.gobbleIdentifier()
        };
      }
      if (optional) {
        node.optional = true;
      } // else leave undefined for compatibility with esprima

      this.gobbleSpaces();
      ch = this.code;
    }
    return node;
  }

  /**
   * Parse simple numeric literals: `12`, `3.4`, `.5`. Do this by using a string to
   * keep track of everything in the numeric literal and then calling `parseFloat` on that string
   * @returns {jsep.Literal}
   */
  gobbleNumericLiteral() {
    let number = '',
      ch,
      chCode;
    while (Jsep.isDecimalDigit(this.code)) {
      number += this.expr.charAt(this.index++);
    }
    if (this.code === Jsep.PERIOD_CODE) {
      // can start with a decimal marker
      number += this.expr.charAt(this.index++);
      while (Jsep.isDecimalDigit(this.code)) {
        number += this.expr.charAt(this.index++);
      }
    }
    ch = this.char;
    if (ch === 'e' || ch === 'E') {
      // exponent marker
      number += this.expr.charAt(this.index++);
      ch = this.char;
      if (ch === '+' || ch === '-') {
        // exponent sign
        number += this.expr.charAt(this.index++);
      }
      while (Jsep.isDecimalDigit(this.code)) {
        // exponent itself
        number += this.expr.charAt(this.index++);
      }
      if (!Jsep.isDecimalDigit(this.expr.charCodeAt(this.index - 1))) {
        this.throwError('Expected exponent (' + number + this.char + ')');
      }
    }
    chCode = this.code;

    // Check to make sure this isn't a variable name that start with a number (123abc)
    if (Jsep.isIdentifierStart(chCode)) {
      this.throwError('Variable names cannot start with a number (' + number + this.char + ')');
    } else if (chCode === Jsep.PERIOD_CODE || number.length === 1 && number.charCodeAt(0) === Jsep.PERIOD_CODE) {
      this.throwError('Unexpected period');
    }
    return {
      type: Jsep.LITERAL,
      value: parseFloat(number),
      raw: number
    };
  }

  /**
   * Parses a string literal, staring with single or double quotes with basic support for escape codes
   * e.g. `"hello world"`, `'this is\nJSEP'`
   * @returns {jsep.Literal}
   */
  gobbleStringLiteral() {
    let str = '';
    const startIndex = this.index;
    const quote = this.expr.charAt(this.index++);
    let closed = false;
    while (this.index < this.expr.length) {
      let ch = this.expr.charAt(this.index++);
      if (ch === quote) {
        closed = true;
        break;
      } else if (ch === '\\') {
        // Check for all of the common escape codes
        ch = this.expr.charAt(this.index++);
        switch (ch) {
          case 'n':
            str += '\n';
            break;
          case 'r':
            str += '\r';
            break;
          case 't':
            str += '\t';
            break;
          case 'b':
            str += '\b';
            break;
          case 'f':
            str += '\f';
            break;
          case 'v':
            str += '\x0B';
            break;
          default:
            str += ch;
        }
      } else {
        str += ch;
      }
    }
    if (!closed) {
      this.throwError('Unclosed quote after "' + str + '"');
    }
    return {
      type: Jsep.LITERAL,
      value: str,
      raw: this.expr.substring(startIndex, this.index)
    };
  }

  /**
   * Gobbles only identifiers
   * e.g.: `foo`, `_value`, `$x1`
   * Also, this function checks if that identifier is a literal:
   * (e.g. `true`, `false`, `null`) or `this`
   * @returns {jsep.Identifier}
   */
  gobbleIdentifier() {
    let ch = this.code,
      start = this.index;
    if (Jsep.isIdentifierStart(ch)) {
      this.index++;
    } else {
      this.throwError('Unexpected ' + this.char);
    }
    while (this.index < this.expr.length) {
      ch = this.code;
      if (Jsep.isIdentifierPart(ch)) {
        this.index++;
      } else {
        break;
      }
    }
    return {
      type: Jsep.IDENTIFIER,
      name: this.expr.slice(start, this.index)
    };
  }

  /**
   * Gobbles a list of arguments within the context of a function call
   * or array literal. This function also assumes that the opening character
   * `(` or `[` has already been gobbled, and gobbles expressions and commas
   * until the terminator character `)` or `]` is encountered.
   * e.g. `foo(bar, baz)`, `my_func()`, or `[bar, baz]`
   * @param {number} termination
   * @returns {jsep.Expression[]}
   */
  gobbleArguments(termination) {
    const args = [];
    let closed = false;
    let separator_count = 0;
    while (this.index < this.expr.length) {
      this.gobbleSpaces();
      let ch_i = this.code;
      if (ch_i === termination) {
        // done parsing
        closed = true;
        this.index++;
        if (termination === Jsep.CPAREN_CODE && separator_count && separator_count >= args.length) {
          this.throwError('Unexpected token ' + String.fromCharCode(termination));
        }
        break;
      } else if (ch_i === Jsep.COMMA_CODE) {
        // between expressions
        this.index++;
        separator_count++;
        if (separator_count !== args.length) {
          // missing argument
          if (termination === Jsep.CPAREN_CODE) {
            this.throwError('Unexpected token ,');
          } else if (termination === Jsep.CBRACK_CODE) {
            for (let arg = args.length; arg < separator_count; arg++) {
              args.push(null);
            }
          }
        }
      } else if (args.length !== separator_count && separator_count !== 0) {
        // NOTE: `&& separator_count !== 0` allows for either all commas, or all spaces as arguments
        this.throwError('Expected comma');
      } else {
        const node = this.gobbleExpression();
        if (!node || node.type === Jsep.COMPOUND) {
          this.throwError('Expected comma');
        }
        args.push(node);
      }
    }
    if (!closed) {
      this.throwError('Expected ' + String.fromCharCode(termination));
    }
    return args;
  }

  /**
   * Responsible for parsing a group of things within parentheses `()`
   * that have no identifier in front (so not a function call)
   * This function assumes that it needs to gobble the opening parenthesis
   * and then tries to gobble everything within that parenthesis, assuming
   * that the next thing it should see is the close parenthesis. If not,
   * then the expression probably doesn't have a `)`
   * @returns {boolean|jsep.Expression}
   */
  gobbleGroup() {
    this.index++;
    let nodes = this.gobbleExpressions(Jsep.CPAREN_CODE);
    if (this.code === Jsep.CPAREN_CODE) {
      this.index++;
      if (nodes.length === 1) {
        return nodes[0];
      } else if (!nodes.length) {
        return false;
      } else {
        return {
          type: Jsep.SEQUENCE_EXP,
          expressions: nodes
        };
      }
    } else {
      this.throwError('Unclosed (');
    }
  }

  /**
   * Responsible for parsing Array literals `[1, 2, 3]`
   * This function assumes that it needs to gobble the opening bracket
   * and then tries to gobble the expressions as arguments.
   * @returns {jsep.ArrayExpression}
   */
  gobbleArray() {
    this.index++;
    return {
      type: Jsep.ARRAY_EXP,
      elements: this.gobbleArguments(Jsep.CBRACK_CODE)
    };
  }
}

// Static fields:
const hooks = new Hooks();
Object.assign(Jsep, {
  hooks,
  plugins: new Plugins(Jsep),
  // Node Types
  // ----------
  // This is the full set of types that any JSEP node can be.
  // Store them here to save space when minified
  COMPOUND: 'Compound',
  SEQUENCE_EXP: 'SequenceExpression',
  IDENTIFIER: 'Identifier',
  MEMBER_EXP: 'MemberExpression',
  LITERAL: 'Literal',
  THIS_EXP: 'ThisExpression',
  CALL_EXP: 'CallExpression',
  UNARY_EXP: 'UnaryExpression',
  BINARY_EXP: 'BinaryExpression',
  ARRAY_EXP: 'ArrayExpression',
  TAB_CODE: 9,
  LF_CODE: 10,
  CR_CODE: 13,
  SPACE_CODE: 32,
  PERIOD_CODE: 46,
  // '.'
  COMMA_CODE: 44,
  // ','
  SQUOTE_CODE: 39,
  // single quote
  DQUOTE_CODE: 34,
  // double quotes
  OPAREN_CODE: 40,
  // (
  CPAREN_CODE: 41,
  // )
  OBRACK_CODE: 91,
  // [
  CBRACK_CODE: 93,
  // ]
  QUMARK_CODE: 63,
  // ?
  SEMCOL_CODE: 59,
  // ;
  COLON_CODE: 58,
  // :

  // Operations
  // ----------
  // Use a quickly-accessible map to store all of the unary operators
  // Values are set to `1` (it really doesn't matter)
  unary_ops: {
    '-': 1,
    '!': 1,
    '~': 1,
    '+': 1
  },
  // Also use a map for the binary operations but set their values to their
  // binary precedence for quick reference (higher number = higher precedence)
  // see [Order of operations](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence)
  binary_ops: {
    '||': 1,
    '??': 1,
    '&&': 2,
    '|': 3,
    '^': 4,
    '&': 5,
    '==': 6,
    '!=': 6,
    '===': 6,
    '!==': 6,
    '<': 7,
    '>': 7,
    '<=': 7,
    '>=': 7,
    '<<': 8,
    '>>': 8,
    '>>>': 8,
    '+': 9,
    '-': 9,
    '*': 10,
    '/': 10,
    '%': 10,
    '**': 11
  },
  // sets specific binary_ops as right-associative
  right_associative: new Set(['**']),
  // Additional valid identifier chars, apart from a-z, A-Z and 0-9 (except on the starting char)
  additional_identifier_chars: new Set(['$', '_']),
  // Literals
  // ----------
  // Store the values to return for the various literals we may encounter
  literals: {
    'true': true,
    'false': false,
    'null': null
  },
  // Except for `this`, which is special. This could be changed to something like `'self'` as well
  this_str: 'this'
});
Jsep.max_unop_len = Jsep.getMaxKeyLen(Jsep.unary_ops);
Jsep.max_binop_len = Jsep.getMaxKeyLen(Jsep.binary_ops);

// Backward Compatibility:
const jsep = expr => new Jsep(expr).parse();
const stdClassProps = Object.getOwnPropertyNames(class Test {});
Object.getOwnPropertyNames(Jsep).filter(prop => !stdClassProps.includes(prop) && jsep[prop] === undefined).forEach(m => {
  jsep[m] = Jsep[m];
});
jsep.Jsep = Jsep; // allows for const { Jsep } = require('jsep');

const CONDITIONAL_EXP = 'ConditionalExpression';
var ternary = {
  name: 'ternary',
  init(jsep) {
    // Ternary expression: test ? consequent : alternate
    jsep.hooks.add('after-expression', function gobbleTernary(env) {
      if (env.node && this.code === jsep.QUMARK_CODE) {
        this.index++;
        const test = env.node;
        const consequent = this.gobbleExpression();
        if (!consequent) {
          this.throwError('Expected expression');
        }
        this.gobbleSpaces();
        if (this.code === jsep.COLON_CODE) {
          this.index++;
          const alternate = this.gobbleExpression();
          if (!alternate) {
            this.throwError('Expected expression');
          }
          env.node = {
            type: CONDITIONAL_EXP,
            test,
            consequent,
            alternate
          };

          // check for operators of higher priority than ternary (i.e. assignment)
          // jsep sets || at 1, and assignment at 0.9, and conditional should be between them
          if (test.operator && jsep.binary_ops[test.operator] <= 0.9) {
            let newTest = test;
            while (newTest.right.operator && jsep.binary_ops[newTest.right.operator] <= 0.9) {
              newTest = newTest.right;
            }
            env.node.test = newTest.right;
            newTest.right = env.node;
            env.node = test;
          }
        } else {
          this.throwError('Expected :');
        }
      }
    });
  }
};

// Add default plugins:

jsep.plugins.register(ternary);

const FSLASH_CODE = 47; // '/'
const BSLASH_CODE = 92; // '\\'

var index = {
  name: 'regex',
  init(jsep) {
    // Regex literal: /abc123/ig
    jsep.hooks.add('gobble-token', function gobbleRegexLiteral(env) {
      if (this.code === FSLASH_CODE) {
        const patternIndex = ++this.index;
        let inCharSet = false;
        while (this.index < this.expr.length) {
          if (this.code === FSLASH_CODE && !inCharSet) {
            const pattern = this.expr.slice(patternIndex, this.index);
            let flags = '';
            while (++this.index < this.expr.length) {
              const code = this.code;
              if (code >= 97 && code <= 122 // a...z
              || code >= 65 && code <= 90 // A...Z
              || code >= 48 && code <= 57) {
                // 0-9
                flags += this.char;
              } else {
                break;
              }
            }
            let value;
            try {
              value = new RegExp(pattern, flags);
            } catch (e) {
              this.throwError(e.message);
            }
            env.node = {
              type: jsep.LITERAL,
              value,
              raw: this.expr.slice(patternIndex - 1, this.index)
            };

            // allow . [] and () after regex: /regex/.test(a)
            env.node = this.gobbleTokenProperty(env.node);
            return env.node;
          }
          if (this.code === jsep.OBRACK_CODE) {
            inCharSet = true;
          } else if (inCharSet && this.code === jsep.CBRACK_CODE) {
            inCharSet = false;
          }
          this.index += this.code === BSLASH_CODE ? 2 : 1;
        }
        this.throwError('Unclosed Regex');
      }
    });
  }
};

const PLUS_CODE = 43; // +
const MINUS_CODE = 45; // -

const plugin = {
  name: 'assignment',
  assignmentOperators: new Set(['=', '*=', '**=', '/=', '%=', '+=', '-=', '<<=', '>>=', '>>>=', '&=', '^=', '|=', '||=', '&&=', '??=']),
  updateOperators: [PLUS_CODE, MINUS_CODE],
  assignmentPrecedence: 0.9,
  init(jsep) {
    const updateNodeTypes = [jsep.IDENTIFIER, jsep.MEMBER_EXP];
    plugin.assignmentOperators.forEach(op => jsep.addBinaryOp(op, plugin.assignmentPrecedence, true));
    jsep.hooks.add('gobble-token', function gobbleUpdatePrefix(env) {
      const code = this.code;
      if (plugin.updateOperators.some(c => c === code && c === this.expr.charCodeAt(this.index + 1))) {
        this.index += 2;
        env.node = {
          type: 'UpdateExpression',
          operator: code === PLUS_CODE ? '++' : '--',
          argument: this.gobbleTokenProperty(this.gobbleIdentifier()),
          prefix: true
        };
        if (!env.node.argument || !updateNodeTypes.includes(env.node.argument.type)) {
          this.throwError(`Unexpected ${env.node.operator}`);
        }
      }
    });
    jsep.hooks.add('after-token', function gobbleUpdatePostfix(env) {
      if (env.node) {
        const code = this.code;
        if (plugin.updateOperators.some(c => c === code && c === this.expr.charCodeAt(this.index + 1))) {
          if (!updateNodeTypes.includes(env.node.type)) {
            this.throwError(`Unexpected ${env.node.operator}`);
          }
          this.index += 2;
          env.node = {
            type: 'UpdateExpression',
            operator: code === PLUS_CODE ? '++' : '--',
            argument: env.node,
            prefix: false
          };
        }
      }
    });
    jsep.hooks.add('after-expression', function gobbleAssignment(env) {
      if (env.node) {
        // Note: Binaries can be chained in a single expression to respect
        // operator precedence (i.e. a = b = 1 + 2 + 3)
        // Update all binary assignment nodes in the tree
        updateBinariesToAssignments(env.node);
      }
    });
    function updateBinariesToAssignments(node) {
      if (plugin.assignmentOperators.has(node.operator)) {
        node.type = 'AssignmentExpression';
        updateBinariesToAssignments(node.left);
        updateBinariesToAssignments(node.right);
      } else if (!node.operator) {
        Object.values(node).forEach(val => {
          if (val && typeof val === 'object') {
            updateBinariesToAssignments(val);
          }
        });
      }
    }
  }
};

/* eslint-disable unicorn/no-top-level-side-effects -- Temporary? */
/* eslint-disable no-bitwise -- Convenient */

/**
 * @import {EvaluatedResult, UnknownResult} from './jsonpath.js';
 */

/**
 * @typedef {any} AssignmentExpression
 */

/**
 * @typedef {any} Substitution
 */

/**
 * @typedef {any} AnyParameter
 */

/**
 * @typedef {Record<string, Substitution>} Substitutions
 */

// register plugins
jsep.plugins.register(index, plugin);
jsep.addUnaryOp('typeof');
jsep.addUnaryOp('void');
jsep.addLiteral('null', null);
jsep.addLiteral('undefined', undefined);
const BLOCKED_PROTO_PROPERTIES = new Set(['constructor', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);

// Every function-constructor variant, along with the invocation helpers which
//   could otherwise reach them indirectly, e.g., `Function.call(0, 'code')()`,
//   plus whichever BLOCKED_PROTO_PROPERTIES names resolve to an own method on
//   Object.prototype (e.g. `__defineGetter__`) - an own-property access on a
//   shared prototype (`@.prototype.__defineGetter__`) bypasses the
//   inherited-only name check below, so those methods need blocking by value.
/** @type {WeakSet<object>} */
const BLOCKED_FUNCTIONS = new WeakSet([Function,
// eslint-disable-next-line no-empty-function -- Only need the constructor
function* () {}.constructor,
// eslint-disable-next-line no-empty-function -- Only need the constructor
async function () {}.constructor,
// eslint-disable-next-line no-empty-function -- Only need the constructor
async function* () {}.constructor, Function.prototype.call, Function.prototype.apply, Function.prototype.bind, Reflect.apply, Reflect.construct, ...[...BLOCKED_PROTO_PROPERTIES].map(name => Reflect.get(Object.prototype, name)).filter(value => typeof value === 'function')]);

/**
 * @param {UnknownResult} value
 * @returns {boolean}
 */
const isBlockedFunction = value => {
  return typeof value === 'function' && BLOCKED_FUNCTIONS.has(value);
};

/**
 * Guarded `obj[prop]`, applying the same restrictions as a MemberExpression.
 * @param {UnknownResult} obj
 * @param {string} prop
 * @returns {UnknownResult}
 */
const getSafeProperty = (obj, prop) => {
  if (obj === undefined || obj === null) {
    throw new TypeError(`Cannot read properties of ${obj} (reading '${prop}')`);
  }
  if (!Object.hasOwn(obj, prop) && BLOCKED_PROTO_PROPERTIES.has(prop)) {
    throw new TypeError(`Cannot read properties of ${obj} (reading '${prop}')`);
  }
  const result = /** @type {Record<string, UnknownResult>} */obj[prop];
  if (isBlockedFunction(result)) {
    throw new TypeError('Function constructor is disabled');
  }
  return result;
};

/**
 * @typedef {Record<
 *   string,
 *   (a: AnyParameter, b: AnyParameter) => UnknownResult
 * >} OperatorTable
 */

// eslint-disable-next-line @stylistic/max-len -- Long
const BINOPS = Object.assign(Object.create(null), /** @type {OperatorTable} */{
  '||': (a, b) => a || b(),
  '&&': (a, b) => a && b(),
  '|': (a, b) => a | b(),
  '^': (a, b) => a ^ b(),
  '&': (a, b) => a & b(),
  // eslint-disable-next-line eqeqeq -- API
  '==': (a, b) => a == b(),
  // eslint-disable-next-line eqeqeq -- API
  '!=': (a, b) => a != b(),
  '===': (a, b) => a === b(),
  '!==': (a, b) => a !== b(),
  '<': (a, b) => a < b(),
  '>': (a, b) => a > b(),
  '<=': (a, b) => a <= b(),
  '>=': (a, b) => a >= b(),
  '<<': (a, b) => a << b(),
  '>>': (a, b) => a >> b(),
  '>>>': (a, b) => a >>> b(),
  '+': (a, b) => a + b(),
  '-': (a, b) => a - b(),
  '*': (a, b) => a * b(),
  '/': (a, b) => a / b(),
  '%': (a, b) => a % b()
});

/**
 * @typedef {{
 *   [key: string]: (a: AnyParameter) => UnknownResult
 * }} UnaryOperatorTable
 */

// eslint-disable-next-line @stylistic/max-len -- Long
const UNOPS = Object.assign(Object.create(null), /** @type {UnaryOperatorTable} */{
  '-': a => -(/** @type {EvaluatedResult} */a),
  '!': a => !a,
  '~': a => ~(/** @type {EvaluatedResult} */a),
  // eslint-disable-next-line no-implicit-coercion -- API
  '+': a => +(/** @type {EvaluatedResult} */a),
  typeof: a => typeof a,
  void: () => undefined
});
const SafeEval = {
  /**
   * @param {jsep.Expression} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalAst(ast, subs) {
    switch (ast.type) {
      case 'BinaryExpression':
      case 'LogicalExpression':
        return SafeEval.evalBinaryExpression(/** @type {jsep.BinaryExpression} */ast, subs);
      case 'Compound':
        return SafeEval.evalCompound(/** @type {jsep.Compound} */ast, subs);
      case 'ConditionalExpression':
        return SafeEval.evalConditionalExpression(/** @type {jsep.ConditionalExpression} */ast, subs);
      case 'Identifier':
        return SafeEval.evalIdentifier(/** @type {jsep.Identifier} */ast, subs);
      case 'Literal':
        return SafeEval.evalLiteral(/** @type {jsep.Literal} */ast);
      case 'MemberExpression':
        return SafeEval.evalMemberExpression(/** @type {jsep.MemberExpression} */ast, subs);
      case 'UnaryExpression':
        return SafeEval.evalUnaryExpression(/** @type {jsep.UnaryExpression} */ast, subs);
      case 'ArrayExpression':
        return SafeEval.evalArrayExpression(/** @type {jsep.ArrayExpression} */ast, subs);
      case 'CallExpression':
        return SafeEval.evalCallExpression(/** @type {jsep.CallExpression} */ast, subs);
      case 'AssignmentExpression':
        return SafeEval.evalAssignmentExpression(/** @type {AssignmentExpression} */ast, subs);
      default:
        throw new SyntaxError('Unexpected expression', {
          cause: ast
        });
    }
  },
  /**
   * @param {jsep.BinaryExpression} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalBinaryExpression(ast, subs) {
    /* c8 ignore next 3 -- Defensive guard for malformed ASTs */
    if (!Object.hasOwn(BINOPS, ast.operator)) {
      throw new SyntaxError(`Unknown binary operator: ${ast.operator}`);
    }
    const result = BINOPS[ast.operator](SafeEval.evalAst(ast.left, subs), () => SafeEval.evalAst(ast.right, subs));
    return result;
  },
  /**
   * @param {jsep.Compound} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalCompound(ast, subs) {
    let last;
    for (let i = 0; i < ast.body.length; i++) {
      if (ast.body[i].type === 'Identifier' && ['var', 'let', 'const'].includes(/** @type {jsep.Identifier} */
      ast.body[i].name) && Object.hasOwn(ast.body, i + 1) && ast.body[i + 1].type === 'AssignmentExpression') {
        // var x=2; is detected as
        // [{Identifier var}, {AssignmentExpression x=2}]
        i += 1;
      }
      const expr = ast.body[i];
      last = SafeEval.evalAst(expr, subs);
    }
    return last;
  },
  /**
   * @param {jsep.ConditionalExpression} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalConditionalExpression(ast, subs) {
    return SafeEval.evalAst(ast.test, subs) ? SafeEval.evalAst(ast.consequent, subs) : SafeEval.evalAst(ast.alternate, subs);
  },
  /**
   * @param {jsep.Identifier} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalIdentifier(ast, subs) {
    if (Object.hasOwn(subs, ast.name)) {
      return subs[ast.name];
    }
    throw new ReferenceError(`${ast.name} is not defined`);
  },
  /**
   * @param {jsep.Literal} ast
   * @returns {UnknownResult}
   */
  evalLiteral(ast) {
    return ast.value;
  },
  /**
   * @param {jsep.MemberExpression} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalMemberExpression(ast, subs) {
    const prop = String(
    // NOTE: `String(value)` throws error when
    // value has overwritten the toString method to return non-string
    // i.e. `value = {toString: () => []}`
    ast.computed ? SafeEval.evalAst(ast.property, subs) // `object[property]`
    : ast.property.name // `object.property` property is Identifier
    );
    const obj = SafeEval.evalAst(ast.object, subs);
    const result = getSafeProperty(obj, prop);
    if (typeof result === 'function') {
      return result.bind(obj); // arrow functions aren't affected by bind.
    }
    return result;
  },
  /**
   * @param {jsep.UnaryExpression} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalUnaryExpression(ast, subs) {
    /* c8 ignore next 3 -- Defensive guard for malformed ASTs */
    if (!Object.hasOwn(UNOPS, ast.operator)) {
      throw new SyntaxError(`Unknown unary operator: ${ast.operator}`);
    }
    const operand = SafeEval.evalAst(ast.argument, subs);
    return UNOPS[ast.operator](operand);
  },
  /**
   * @param {jsep.ArrayExpression} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalArrayExpression(ast, subs) {
    return ast.elements.map(el => SafeEval.evalAst(/** @type {jsep.Expression} */
    el, subs));
  },
  /**
   * @param {jsep.CallExpression} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalCallExpression(ast, subs) {
    const args = ast.arguments.map(arg => SafeEval.evalAst(arg, subs));
    const func = SafeEval.evalAst(ast.callee, subs);
    if (isBlockedFunction(func) || args.some(arg => isBlockedFunction(arg))) {
      throw new Error('Function constructor is disabled');
    }
    return (/** @type {(...args: AnyParameter[]) => UnknownResult} */
    func)(...args);
  },
  /**
   * @param {AssignmentExpression} ast
   * @param {Substitutions} subs
   * @returns {UnknownResult}
   */
  evalAssignmentExpression(ast, subs) {
    if (ast.left.type !== 'Identifier') {
      throw new SyntaxError('Invalid left-hand side in assignment');
    }
    const id = /** @type {jsep.Identifier} */ast.left.name;
    const value = SafeEval.evalAst(ast.right, subs);
    subs[id] = value;
    return subs[id];
  }
};

/**
 * A replacement for NodeJS' VM.Script which is also {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP | Content Security Policy} friendly.
 */
class SafeScript {
  /**
   * @param {string} expr Expression to evaluate
   */
  constructor(expr) {
    this.code = expr;
    this.ast = /** @type {unknown} */jsep(this.code);
  }

  /**
   * @param {object} context Object whose items will be added
   *   to evaluation
   * @returns {EvaluatedResult} Result of evaluated code
   */
  runInNewContext(context) {
    // `Object.create(null)` creates a prototypeless object
    const keyMap = Object.assign(Object.create(null), context);
    return SafeEval.evalAst(/** @type {jsep.Expression} */this.ast, keyMap);
  }
}

/* eslint-disable camelcase -- Convenient for escaping */
/* eslint-disable class-methods-use-this -- Consistent monkey-patching */
/* eslint-disable unicorn/prefer-private-class-fields -- Allow
    monkey-patching */
const scriptCache = new Map();
const pathCache = new Map();

/**
 * @typedef {any} AnyInput
 */

/**
 * @typedef {((...args: any[]) => any)} SandboxCallback
 */

/**
 * @typedef {any|SandboxCallback} SandboxPropertyValue
 */

/**
 * @typedef {(string|number)[]} ExpressionArray
 */

/**
 * @typedef {"scalar"|"boolean"|"string"|"undefined"
 *   |"function"|"integer"|"number"|"nonFinite"|"object"
 *   |"array"|"other"|"null"} ValueType
 */

/**
 * @typedef {unknown} ParentValue
 */

/**
 * @typedef {unknown} UnknownResult
 */

/**
 * @typedef {string|number|null} ParentProperty
 */

/**
 * @typedef {ReturnObject|string|number|boolean|null|unknown[]
 *   |Record<string, unknown>} PreferredOutput
 */

/**
 * Copies array and then pushes item into it.
 * @param {ExpressionArray} arr Array to copy and into which to push
 * @param {string|number} item Array item to add (to end)
 * @returns {ExpressionArray} Copy of the original array
 */
function push(arr, item) {
  arr = arr.slice();
  arr.push(item);
  return arr;
}
/**
 * Copies array and then unshifts item into it.
 * @param {string|number} item Array item to add (to beginning)
 * @param {ExpressionArray} arr Array to copy and into which to unshift
 * @returns {ExpressionArray} Copy of the original array
 */
function unshift(item, arr) {
  arr = arr.slice();
  arr.unshift(item);
  return arr;
}

/**
 * @typedef {object} ReturnObject
 * @property {ExpressionArray|string} path
 * @property {unknown} value
 * @property {ParentValue} parent
 * @property {ParentProperty} parentProperty
 * @property {boolean} [isParentSelector]
 * @property {boolean} [hasArrExpr]
 * @property {ExpressionArray} [expr]
 * @property {string} [pointer]
 */

/**
 * @callback JSONPathCallback
 * @param {any} preferredOutput Using `any` type instead of `PreferredOutput` so
 *    that user can supply flexible type
 * @param {"value"|"property"} type
 * @param {ReturnObject} fullRetObj
 * @returns {void}
 */

/**
 * @callback OtherTypeCallback
 * @param {unknown} val
 * @param {ExpressionArray} path
 * @param {ParentValue} parent
 * @param {string|number|null} parentPropName
 * @returns {boolean|null}
 */

/**
 * @typedef {any} ContextItem
 */

/**
 * @typedef {any} EvaluatedResult
 */

/**
 * @callback EvalCallback
 * @param {string} code
 * @param {ContextItem} context
 * @returns {EvaluatedResult}
 */

/**
 * @typedef {new (expr: string) => {
 *   runInNewContext: (context: object) => EvaluatedResult
 * }} ScriptConstructor
 */

/**
 * @typedef {ScriptConstructor} EvalClass
 */

/**
 * @typedef {"value"|"path"|"pointer"|"parent"|"parentProperty"
 *   |"all"} ResultType
 */

/**
 * @typedef {EvalCallback|EvalClass|'safe'|'native'|boolean} EvalValue
 */

/**
 * @typedef {string|string[]} PathType
 */

/**
 * @typedef {{Script: ScriptConstructor}} SafeScriptType
 */

/**
 * @typedef {{Script: ScriptConstructor}} ScriptType
 */

/**
 * @typedef {{
 *   _$_path?: string,
 *   _$_parentProperty?: ParentProperty,
 *   _$_parent?: ParentValue,
 *   _$_property?: string|number,
 *   _$_root?: AnyInput,
 *   _$_v?: unknown,
 *   [key: string]: SandboxPropertyValue
 * }} SandboxType
 */

/**
 * @typedef {object} JSONPathOptions
 * @property {AnyInput} [json]
 * @property {PathType} [path]
 * @property {ResultType} [resultType="value"]
 * @property {boolean} [flatten=false]
 * @property {boolean} [wrap=true]
 * @property {SandboxType} [sandbox={}]
 * @property {EvalValue} [eval='safe']
 * @property {any|null} [parent=null]
 * @property {ParentProperty} [parentProperty=null]
 * @property {JSONPathCallback} [callback]
 * @property {OtherTypeCallback} [otherTypeCallback] Defaults to
 *   function which throws on encountering `@other`
 * @property {Record<string, OtherTypeCallback>} [customTypes] Map of custom
 *   type operator names to their evaluation callbacks
 * @property {boolean} [autostart=true]
 * @property {boolean} [ignoreEvalErrors=false]
 */

/**
 * @overload
 * @param {string} opts JSON path to evaluate
 * @param {AnyInput} [expr] JSON object to evaluate against
 * @param {JSONPathCallback} [obj] Passed 3 arguments: 1) desired
 *     payload per `resultType`, 2) `"value"|"property"`, 3) Full returned
 *     object with all payloads
 * @param {OtherTypeCallback} [callback] If `@other()` is at the
 *   end of one's query, this will be invoked with the value of the item,
 *   its path, its parent, and its parent's property name, and it should
 *   return a boolean indicating whether the supplied value belongs to the
 *   "other" type or not (or it may handle transformations and return
 *   `false`).
 * @param {undefined} [otherTypeCallback]
 * @returns {unknown} The string form always has `autostart` implicitly
 *   `true`, so the result is the evaluated value, not a `JSONPathClass`
 */
/**
 * @overload
 * @param {JSONPathOptions & {autostart: false}} opts An options object
 *   with `autostart` explicitly set to `false` defers evaluation and
 *   returns the `JSONPathClass` instance instead
 * @returns {JSONPathClass}
 */
/**
 * @overload
 * @param {JSONPathOptions} opts If a string, will be treated as
 *   `expr`
 * @returns {unknown}
 */
/**
 * @param {JSONPathOptions|string} opts If a string, will be treated as `expr`
 * @param {string|AnyInput} [expr] JSON path to evaluate
 * @param {AnyInput|JSONPathCallback} [obj] JSON object to evaluate against
 * @param {JSONPathCallback|OtherTypeCallback} [callback] Passed 3
 *     arguments: 1) desired payload per `resultType`,
 *     2) `"value"|"property"`, 3) Full returned object with
 *     all payloads
 * @param {OtherTypeCallback} [otherTypeCallback] If `@other()` is at the end
 *   of one's query, this will be invoked with the value of the item, its
 *   path, its parent, and its parent's property name, and it should return
 *   a boolean indicating whether the supplied value belongs to the "other"
 *   type or not (or it may handle transformations and return `false`).
 * @throws {Error}
 * @returns {unknown|JSONPathClass}
 */
function JSONPath(opts, expr, obj, callback, otherTypeCallback) {
  try {
    if (opts && typeof opts === 'object') {
      return new JSONPathClass(opts);
    }
    return new JSONPathClass(opts, expr, /** @type {JSONPathCallback|undefined} */obj, /** @type {OtherTypeCallback|undefined} */callback, /** @type {undefined} */otherTypeCallback);
  } catch (e) {
    if (new.target) {
      throw e;
    }
    if (e && typeof e === 'object' && 'value' in e) {
      return /** @type {{value: UnknownResult}} */e.value;
    }
    throw e;
  }
}

/**
 *
 */
class JSONPathClass {
  /**
   * @overload
   * @param {string} opts JSON path to evaluate
   * @param {AnyInput} [expr] JSON object to evaluate against
   * @param {JSONPathCallback} [obj] Passed 3 arguments: 1) desired
   *     payload per `resultType`, 2) `"value"|"property"`, 3) Full returned
   *     object with all payloads
   * @param {OtherTypeCallback} [callback] If `@other()` is at the
   *   end of one's query, this will be invoked with the value of the item,
   *   its path, its parent, and its parent's property name, and it should
   *   return a boolean indicating whether the supplied value belongs to the
   *   "other" type or not (or it may handle transformations and return
   *   `false`).
   * @param {undefined} [otherTypeCallback]
   */
  /**
   * @overload
   * @param {JSONPathOptions} opts If a string, will be treated as
   *   `expr`
   */
  /**
   * @param {null|string|JSONPathOptions} opts If a string, will be treated as
   *   `expr`
   * @param {string|AnyInput} [expr] JSON path to evaluate
   * @param {AnyInput|JSONPathCallback} [obj] JSON object to evaluate against
   * @param {JSONPathCallback|OtherTypeCallback} [callback] Passed 3
   *     arguments: 1) desired payload per `resultType`,
   *     2) `"value"|"property"`, 3) Full returned
   *     object with all payloads
   * @param {OtherTypeCallback} [otherTypeCallback] If `@other()` is at the
   *   end of one's query, this will be invoked with the value of the item,
   *   its path, its parent, and its parent's property name, and it should
   *   return a boolean indicating whether the supplied value belongs to the
   *   "other" type or not (or it may handle transformations and return
   *   `false`).
   */
  constructor(opts, expr, obj, callback, otherTypeCallback) {
    if (typeof opts === 'string') {
      otherTypeCallback = /** @type {OtherTypeCallback} */
      callback;
      callback = /** @type {JSONPathCallback} */
      obj;
      obj = expr;
      expr = opts;
      opts = null;
    }
    const optObj = opts && typeof opts === 'object';
    opts ||= /** @type {JSONPathOptions} */{};
    /** @type {ResultType|undefined} */
    this.currResultType = undefined;

    /** @type {EvalValue|undefined} */
    this.currEval = undefined;

    /** @type {OtherTypeCallback|undefined} */
    this.currOtherTypeCallback = undefined;

    /** @type {Record<string, OtherTypeCallback>|undefined} */
    this.currCustomTypes = undefined;

    /** @type {SandboxType|undefined} */
    this.currSandbox = undefined;
    this._hasParentSelector = false;
    this.json = opts.json || obj;
    this.path = opts.path || expr;
    this.resultType = opts.resultType || 'value';
    this.flatten = Object.hasOwn(opts, 'flatten') && opts.flatten;
    this.wrap = !Object.hasOwn(opts, 'wrap') || opts.wrap;
    this.sandbox = opts.sandbox || {};
    this.eval = opts.eval === undefined ? 'safe' : opts.eval;
    this.ignoreEvalErrors = typeof opts.ignoreEvalErrors !== 'undefined' && opts.ignoreEvalErrors;
    this.parent = Object.hasOwn(opts, 'parent') ? opts.parent : null;
    this.parentProperty = Object.hasOwn(opts, 'parentProperty') ? opts.parentProperty : null;
    this.callback = opts.callback || (/** @type {JSONPathCallback} */
    callback) || null;
    this.otherTypeCallback = opts.otherTypeCallback || otherTypeCallback || function () {
      throw new TypeError('You must supply an otherTypeCallback callback option ' + 'with the @other() operator.');
    };
    this.customTypes = opts.customTypes || {};
    if (opts.autostart === false) {
      return;
    }
    const args = /** @type {JSONPathOptions} */{
      path: optObj ? opts.path : expr
    };
    if (!optObj && obj !== undefined) {
      args.json = obj;
    } else if ('json' in opts) {
      args.json = opts.json;
    }
    const ret = this.evaluate(args);
    if (!ret || typeof ret !== 'object') {
      const err = /** @type {Error & {value: UnknownResult}} */
      new Error('JSONPath should not be called with "new" (it ' + 'prevents return of (unwrapped) scalar values)');
      err.value = ret;
      throw err;
    }

    // @ts-expect-error - Constructor returns evaluate result for legacy API
    // eslint-disable-next-line @stylistic/max-len -- Long
    // eslint-disable-next-line consistent-return, no-constructor-return -- Legacy API
    return ret;
  }

  // PUBLIC METHODS

  /**
   * @overload
   * @param {JSONPathOptions} [expr]
   * @returns {ReturnObject|ReturnObject[]|undefined|unknown}
   */

  /**
   * @overload
   * @param {PathType|undefined} [expr]
   * @param {AnyInput} [json]
   * @param {JSONPathCallback|null} [callback]
   * @param {OtherTypeCallback} [otherTypeCallback]
   * @returns {ReturnObject|ReturnObject[]|undefined|unknown}
   */

  /**
   * @param {PathType|JSONPathOptions|undefined} [expr]
   * @param {AnyInput} [json]
   * @param {JSONPathCallback|null} [callback]
   * @param {OtherTypeCallback} [otherTypeCallback]
   * @returns {ReturnObject|ReturnObject[]|undefined|unknown}
   */
  evaluate(expr, json, callback, otherTypeCallback) {
    let currParent = this.parent,
      currParentProperty = this.parentProperty;
    let {
      flatten,
      wrap
    } = this;
    this.currResultType = this.resultType;
    this.currEval = this.eval;
    this.currSandbox = this.sandbox;
    callback ||= this.callback;
    this.currOtherTypeCallback = otherTypeCallback || this.otherTypeCallback;
    this.currCustomTypes = this.customTypes;
    if (expr && typeof expr === 'object' && !Array.isArray(expr)) {
      const exprObj = expr;
      if (!exprObj.path && exprObj.path !== '') {
        throw new TypeError('You must supply a "path" property when providing an ' + 'object argument to JSONPath.evaluate().');
      }
      if (!Object.hasOwn(exprObj, 'json')) {
        throw new TypeError('You must supply a "json" property when providing an ' + 'object argument to JSONPath.evaluate().');
      }
      ({
        json
      } = exprObj);
      flatten = Object.hasOwn(exprObj, 'flatten') ? exprObj.flatten : flatten;
      this.currResultType = Object.hasOwn(exprObj, 'resultType') ? exprObj.resultType : this.currResultType;
      this.currSandbox = Object.hasOwn(exprObj, 'sandbox') ? exprObj.sandbox : this.currSandbox;
      wrap = Object.hasOwn(exprObj, 'wrap') ? exprObj.wrap : wrap;
      this.currEval = Object.hasOwn(exprObj, 'eval') ? exprObj.eval : this.currEval;
      callback = Object.hasOwn(exprObj, 'callback') ? exprObj.callback : callback;
      this.currOtherTypeCallback = Object.hasOwn(exprObj, 'otherTypeCallback') ? exprObj.otherTypeCallback : this.currOtherTypeCallback;
      this.currCustomTypes = Object.hasOwn(exprObj, 'customTypes') ? exprObj.customTypes : this.currCustomTypes;
      currParent = Object.hasOwn(exprObj, 'parent') ? exprObj.parent : currParent;
      currParentProperty = Object.hasOwn(exprObj, 'parentProperty') ? exprObj.parentProperty : currParentProperty;
      expr = exprObj.path;
    } else {
      json ||= this.json;
      expr ||= this.path;
    }
    currParent ||= null;
    currParentProperty ||= null;
    if (Array.isArray(expr)) {
      expr = JSONPath.toPathString(expr);
    }
    if (!json || !expr && expr !== '') {
      return undefined;
    }
    const exprList = JSONPath.toPathArray(/** @type {string} */
    expr);
    if (exprList[0] === '$' && exprList.length > 1) {
      exprList.shift();
    }
    this._hasParentSelector = false;
    const traceResult = this._trace(exprList, json, ['$'], currParent, currParentProperty, callback ?? undefined, undefined);

    // eslint-disable-next-line @stylistic/max-len -- Long
    /* c8 ignore next 2 -- Unreachable: _trace returns array when hasArrExpr set */
    const result = (Array.isArray(traceResult) ? traceResult : [traceResult]).filter(ea => {
      return ea && !ea.isParentSelector;
    });
    if (!result.length) {
      // eslint-disable-next-line @stylistic/max-len -- Long
      /* c8 ignore next -- Unreachable: valid queries always produce results */
      return wrap ? [] : undefined;
    }
    if (!wrap && result.length === 1 && !result[0].hasArrExpr) {
      const preferredOutput = this._getPreferredOutput(result[0]);
      return preferredOutput;
    }
    const reduced = result.reduce((rslt, ea) => {
      const valOrPath = this._getPreferredOutput(ea);
      if (flatten && Array.isArray(valOrPath)) {
        rslt = rslt.concat(valOrPath);
      } else {
        rslt.push(valOrPath);
      }
      return rslt;
    }, /** @type {UnknownResult[]} */
    []);
    return reduced;
  }

  // PRIVATE METHODS

  /**
   * @param {ReturnObject} ea
   * @returns {PreferredOutput}
   */
  _getPreferredOutput(ea) {
    const resultType = this.currResultType;
    switch (resultType) {
      case 'all':
        {
          const path = Array.isArray(ea.path) ? ea.path : JSONPath.toPathArray(ea.path);
          ea.pointer = JSONPath.toPointer(/** @type {string[]} */path);
          ea.path = typeof ea.path === 'string' ? ea.path : JSONPath.toPathString(/** @type {string[]} */ea.path);
          return ea;
        }
      case 'value':
      case 'parent':
      case 'parentProperty':
        return /** @type {PreferredOutput} */ea[resultType];
      case 'path':
        if (typeof ea.path === 'string') {
          return ea.path;
        }
        return JSONPath.toPathString(/** @type {string[]} */ea.path);
      case 'pointer':
        {
          const pathArray = Array.isArray(ea.path) ? ea.path : JSONPath.toPathArray(ea.path);
          return JSONPath.toPointer(/** @type {string[]} */pathArray);
        }
      default:
        throw new TypeError('Unknown result type');
    }
  }

  /**
   * @param {ReturnObject} fullRetObj
   * @param {JSONPathCallback|undefined} callback
   * @param {"value"|"property"} type
   * @returns {void}
   */
  _handleCallback(fullRetObj, callback, type) {
    // Early return if no callback provided (defensive
    //   check for internal calls)
    if (!callback) {
      return;
    }
    const preferredOutput = this._getPreferredOutput(fullRetObj);
    if (Array.isArray(fullRetObj.path)) {
      fullRetObj.path = JSONPath.toPathString(/** @type {string[]} */fullRetObj.path);
    }
    callback(preferredOutput, type, fullRetObj);
  }

  /**
   *
   * @param {ExpressionArray} expr
   * @param {unknown} val
   * @param {ExpressionArray} path
   * @param {ParentValue} parent
   * @param {ParentProperty} parentPropName
   * @param {JSONPathCallback|undefined} callback
   * @param {boolean|undefined} hasArrExpr
   * @param {boolean} [literalPriority]
   * @returns {ReturnObject|ReturnObject[]}
   */
  _trace(expr, val, path, parent, parentPropName, callback, hasArrExpr, literalPriority) {
    // No expr to follow? return path and value as the result of
    //  this trace branch
    let retObj;
    if (!expr.length) {
      retObj = {
        path,
        value: val,
        parent,
        parentProperty: parentPropName,
        hasArrExpr
      };
      this._handleCallback(retObj, callback, 'value');
      return retObj;
    }
    const loc = /** @type {string} */expr[0],
      x = expr.slice(1);

    // We need to gather the return value of recursive trace calls in order
    //  to do the parent sel computation.
    /** @type {ReturnObject[]} */
    const ret = [];
    /**
     *
     * @param {ReturnObject|ReturnObject[]} elems
     * @returns {void}
     */
    function addRet(elems) {
      if (Array.isArray(elems)) {
        // This was causing excessive stack size in Node (with or
        //  without Babel) against our performance test:
        //  `ret.push(...elems);`
        elems.forEach(t => {
          ret.push(t);
        });
      } else {
        ret.push(elems);
      }
    }
    if (val && (typeof loc !== 'string' || literalPriority) && Object.hasOwn(val, /** @type {PropertyKey} */loc)) {
      // simple case--directly follow property
      const valObj = /** @type {Record<string, unknown>} */val;
      addRet(this._trace(x, valObj[(/** @type {string} */loc)], push(path, loc), val, /** @type {string|number} */loc, callback, hasArrExpr));
      // eslint-disable-next-line unicorn/prefer-switch -- Part of larger `if`
    } else if (loc === '*') {
      // all child properties
      this._walk(val, m => {
        const valObj = /** @type {Record<string, unknown>} */val;
        addRet(this._trace(x, valObj[m], push(path, m), val, m, callback, true, true));
      });
    } else if (loc === '..') {
      // all descendent parent properties
      // Check remaining expression with val's immediate children
      addRet(this._trace(x, val, path, parent, parentPropName, callback, hasArrExpr));
      this._walk(val, m => {
        // We don't join m and x here because we only want parents,
        //   not scalar values
        const valObj = /** @type {Record<string, unknown>} */val;
        if (typeof valObj[m] === 'object') {
          // Keep going with recursive descent on val's
          //   object children
          addRet(this._trace(expr.slice(), valObj[m], push(path, m), val, m, callback, true));
        }
      });
      // The parent sel computation is handled in the frame above using the
      // ancestor object of val
    } else if (loc === '^') {
      // This is not a final endpoint, so we do not invoke the
      //   callback here
      this._hasParentSelector = true;
      return /** @type {ReturnObject} */{
        path: path.slice(0, -1),
        expr: x,
        isParentSelector: true,
        value: undefined,
        parent: undefined,
        parentProperty: null
      };
    } else if (loc === '~') {
      // property name
      retObj = {
        path: push(path, loc),
        value: parentPropName,
        parent,
        parentProperty: null
      };
      this._handleCallback(retObj, callback, 'property');
      return retObj;
    } else if (loc === '$') {
      // root only
      addRet(this._trace(x, val, path, null, null, callback, hasArrExpr));
    } else if (/^(-?\d*):(-?\d*):?(\d*)$/v.test(loc)) {
      // [start:end:step]  Python slice syntax
      const sliceResult = this._slice(loc, x, val, path, parent, parentPropName, callback);
      if (sliceResult) {
        addRet(sliceResult);
      }
    } else if (loc.indexOf('?(') === 0) {
      // [?(expr)] (filtering)
      if (this.currEval === false) {
        throw new Error('Eval [?(expr)] prevented in JSONPath expression.');
      }
      const safeLoc = loc.replace(/^\?\((.*?)\)$/v, '$1');
      // check for a nested filter expression

      const nested = /@.?([^?]*)[\['](\??\(.*?\))(?!.\)\])[\]']/gv.exec(safeLoc);
      if (nested) {
        // find if there are matches in the nested expression
        // add them to the result set if there is at least one match
        this._walk(val, m => {
          const npath = [nested[2]];
          const valObj2 = /** @type {Record<string, unknown>} */
          val;
          // guard against nested[1] resolving to `constructor`
          const nvalue = /** @type {ValueType} */nested[1] ? getSafeProperty(/** @type {Record<string, unknown>} */
          valObj2[m], nested[1]) : valObj2[m];
          const filterResults = this._trace(npath, nvalue, path, parent, parentPropName, callback, true);
          // eslint-disable-next-line @stylistic/max-len -- Long
          /* c8 ignore next 3 -- Unreachable: _trace always returns array for nested filters */
          const filterArray = Array.isArray(filterResults) ? filterResults : [filterResults];
          if (filterArray.length > 0) {
            addRet(this._trace(x, valObj2[m], push(path, m), val, m, callback, true));
          }
        });
      } else {
        const valObj3 = /** @type {Record<string, unknown>} */val;
        this._walk(val, m => {
          if (this._eval(safeLoc, valObj3[m], m, path, parent, parentPropName)) {
            addRet(this._trace(x, valObj3[m], push(path, m), val, m, callback, true));
          }
        });
      }
    } else if (loc[0] === '(') {
      // [(expr)] (dynamic property/index)
      if (this.currEval === false) {
        throw new Error('Eval [(expr)] prevented in JSONPath expression.');
      }
      // As this will resolve to a property name (but we don't know it
      //  yet), property and parent information is relative to the
      const evalResult = this._eval(/** @type {string} */loc, val, /** @type {string|number} */path.at(-1), path.slice(0, -1), parent, parentPropName);
      const exprToUse = /** @type {string|number} */
      evalResult !== undefined ? evalResult : '';
      addRet(this._trace(unshift(exprToUse, x), val, path, parent, parentPropName, callback, hasArrExpr));
    } else if (loc[0] === '@') {
      // value type: @boolean(), etc.
      let addType = false;
      const valueType = /** @type {ValueType|string} */loc.slice(1, -2);
      switch (valueType) {
        case 'scalar':
          if (!val || !['object', 'function'].includes(typeof val)) {
            addType = true;
          }
          break;
        case 'boolean':
        case 'string':
        case 'undefined':
        case 'function':
          if (typeof val === valueType) {
            addType = true;
          }
          break;
        case 'integer':
          if (Number.isFinite(val) && !(/** @type {number} */val % 1)) {
            addType = true;
          }
          break;
        case 'number':
          if (Number.isFinite(val)) {
            addType = true;
          }
          break;
        case 'nonFinite':
          if (typeof val === 'number' && !Number.isFinite(val)) {
            addType = true;
          }
          break;
        case 'object':
          if (val && typeof val === valueType) {
            addType = true;
          }
          break;
        case 'array':
          if (Array.isArray(val)) {
            addType = true;
          }
          break;
        case 'other':
          addType = /** @type {OtherTypeCallback} */this.currOtherTypeCallback(val, path, parent, parentPropName) || false;
          break;
        case 'null':
          if (val === null) {
            addType = true;
          }
          break;
        default:
          if (this.currCustomTypes && Object.hasOwn(this.currCustomTypes, valueType)) {
            addType = this.currCustomTypes[valueType](val, path, parent, parentPropName) || false;
          } else {
            throw new TypeError('Unknown value type ' + valueType);
          }
      }
      if (addType) {
        retObj = {
          path,
          value: val,
          parent,
          parentProperty: parentPropName
        };
        this._handleCallback(retObj, callback, 'value');
        return retObj;
      }
      // `-escaped property
    } else if (val && loc[0] === '`' && Object.hasOwn(val, loc.slice(1))) {
      const locProp = loc.slice(1);
      const valObj = /** @type {Record<string, unknown>} */val;
      addRet(this._trace(x, valObj[locProp], push(path, locProp), val, locProp, callback, hasArrExpr, true));
    } else if (loc[0] === "'" || loc[0] === '"') {
      // ['name1','name2',...]
      // Quoted members are literal property names
      for (const [, single, double] of loc.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/gv)) {
        const prop = (single ?? double).replaceAll(/\\(['"\\])/gv, '$1');
        if (!val || !Object.hasOwn(val, prop)) {
          continue;
        }
        const valObj = /** @type {Record<string, unknown>} */val;
        addRet(this._trace(x, valObj[prop], push(path, prop), val, prop, callback, true));
      }
    } else if (loc.includes(',')) {
      // [name1,name2,...]
      const parts = loc.split(',');
      for (const part of parts) {
        addRet(this._trace(unshift(part, x), val, path, parent, parentPropName, callback, true));
      }
      // simple case--directly follow property
    } else if (!literalPriority && val && Object.hasOwn(val, loc)) {
      const valObj = /** @type {Record<string, unknown>} */val;
      addRet(this._trace(x, valObj[loc], push(path, loc), val, loc, callback, hasArrExpr, true));
    }

    // We check the resulting values for parent selections. For parent
    // selections we discard the value object and continue the trace with
    // the current val object
    if (this._hasParentSelector) {
      for (let t = 0; t < ret.length; t++) {
        const rett = ret[t];
        if (!rett || !rett.isParentSelector) {
          continue;
        }
        const exprToUse = /** @type {ExpressionArray} */
        rett.expr;
        const pathToUse = /** @type {ExpressionArray} */
        rett.path;
        const tmp = this._trace(exprToUse, val, pathToUse, parent, parentPropName, callback, hasArrExpr);
        if (Array.isArray(tmp)) {
          ret[t] = tmp[0];
          const tl = tmp.length;
          for (let tt = 1; tt < tl; tt++) {
            t++;
            ret.splice(t, 0, tmp[tt]);
          }
        } else {
          ret[t] = tmp;
        }
      }
    }
    return ret;
  }

  /**
   * @param {unknown} val
   * @param {(prop: string|number) => void} f
   * @returns {void}
   */
  _walk(val, f) {
    if (Array.isArray(val)) {
      const n = val.length;
      for (let i = 0; i < n; i++) {
        f(i);
      }
    } else if (val && typeof val === 'object') {
      Object.keys(val).forEach(m => {
        f(m);
      });
    }
  }

  /**
   * @param {string} loc
   * @param {ExpressionArray} expr
   * @param {unknown} val
   * @param {ExpressionArray} path
   * @param {ParentValue} parent
   * @param {ParentProperty} parentPropName
   * @param {JSONPathCallback|undefined} callback
   * @returns {ReturnObject[]|undefined}
   */
  _slice(loc, expr, val, path, parent, parentPropName, callback) {
    if (!Array.isArray(val)) {
      return undefined;
    }
    const len = val.length,
      parts = loc.split(':'),
      step = parts[2] && Number(parts[2]) || 1;
    let start = parts[0] && Number(parts[0]) || 0,
      end = parts[1] ? Number(parts[1]) : len;
    start = start < 0 ? Math.max(0, start + len) : Math.min(len, start);
    end = end < 0 ? Math.max(0, end + len) : Math.min(len, end);
    /** @type {ReturnObject[]} */
    const ret = [];
    for (let i = start; i < end; i += step) {
      const tmp = this._trace(unshift(i, expr), val, path, parent, parentPropName, callback, true);
      // Should only be possible to be an array here since first part of
      //   ``unshift(i, expr)` passed in above would not be empty,
      //     nor `~`, nor begin with `@` (as could return objects)
      // This was causing excessive stack size in Node (with or
      //  without Babel) against our performance test: `ret.push(...tmp);`
      // eslint-disable-next-line @stylistic/max-len -- Long
      /* c8 ignore next -- Unreachable: _trace returns array when expr non-empty */
      const tmpArray = Array.isArray(tmp) ? tmp : [tmp];
      tmpArray.forEach(t => {
        ret.push(t);
      });
    }
    return ret;
  }

  /**
   * @param {string} code
   * @param {unknown} _v
   * @param {string|number} _vname
   * @param {ExpressionArray} path
   * @param {ParentValue} parent
   * @param {ParentProperty} parentPropName
   * @returns {UnknownResult}
   */
  _eval(code, _v, _vname, path, parent, parentPropName) {
    if (this.currSandbox) {
      this.currSandbox._$_parentProperty = parentPropName;
      this.currSandbox._$_parent = parent;
      this.currSandbox._$_property = _vname;
      this.currSandbox._$_root = this.json;
      this.currSandbox._$_v = _v;
    }
    const containsPath = code.includes('@path');
    if (containsPath) {
      // eslint-disable-next-line @stylistic/max-len -- Long
      /* c8 ignore next -- Unreachable: currSandbox set in evaluate() before _eval */
      const currSandbox = this.currSandbox ?? {};
      currSandbox._$_path = JSONPath.toPathString(/** @type {string[]} */path.concat([_vname]));
    }
    const scriptCacheKey = this.currEval + 'Script:' + code;
    if (!scriptCache.has(scriptCacheKey)) {
      let script = code.replaceAll('@parentProperty', '_$_parentProperty').replaceAll('@parent', '_$_parent').replaceAll('@property', '_$_property').replaceAll('@root', '_$_root')
      // Replace a bare `@` (not followed by an identifier
      //   character) while leaving quoted string literals intact
      .replaceAll(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|@(?![\w$])/gv, (_, str) => str ?? '_$_v');
      if (containsPath) {
        script = script.replaceAll('@path', '_$_path');
      }
      const evalType = /** @type {string|boolean|undefined} */
      this.currEval;
      if (['safe', true, undefined].includes(evalType)) {
        // eslint-disable-next-line @stylistic/max-len -- Long
        /* eslint-disable unicorn/no-undeclared-class-members -- Prototype members */
        scriptCache.set(scriptCacheKey, new (
        /**
         * @type {JSONPathClass & {
         *   safeVm: SafeScriptType,
         *   vm: ScriptType
         * }}
         */ /** @type {unknown} */
        this).safeVm.Script(script));
        // eslint-disable-next-line @stylistic/max-len -- Long
        /* eslint-enable unicorn/no-undeclared-class-members -- End prototype member scope */
      } else if (this.currEval === 'native') {
        // eslint-disable-next-line @stylistic/max-len -- Long
        /* eslint-disable unicorn/no-undeclared-class-members -- Prototype members */
        scriptCache.set(scriptCacheKey, new (
        /**
         * @type {JSONPathClass & {
         *   safeVm: SafeScriptType,
         *   vm: ScriptType
         * }}
         */ /** @type {unknown} */
        this).vm.Script(script));
        // eslint-disable-next-line @stylistic/max-len -- Long
        /* eslint-enable unicorn/no-undeclared-class-members -- End prototype member scope */
      } else if (typeof this.currEval === 'function' && this.currEval.prototype && Object.hasOwn(this.currEval.prototype, 'runInNewContext')) {
        const CurrEval = this.currEval;
        // eslint-disable-next-line @stylistic/max-len -- Long
        // @ts-expect-error - Type checked above to have proper constructor
        scriptCache.set(scriptCacheKey, new CurrEval(script));
      } else if (typeof this.currEval === 'function') {
        // Type narrowing: at this point currEval is a function
        //   but not a constructor
        const evalFunc = /** @type {EvalCallback} */this.currEval;
        scriptCache.set(scriptCacheKey, {
          runInNewContext: (/** @type {ContextItem} */context) => evalFunc(script, context)
        });
      } else {
        throw new TypeError(`Unknown "eval" property "${this.currEval}"`);
      }
    }
    try {
      /**
       * @typedef {{
       *   runInNewContext: (
       *     ctx: SandboxType|undefined
       *   ) => EvaluatedResult
       * }} RunInNewContext
       */

      return /** @type {RunInNewContext} */scriptCache.get(scriptCacheKey).runInNewContext(this.currSandbox);
    } catch (e) {
      if (this.ignoreEvalErrors) {
        return false;
      }
      const error = /** @type {Error} */e;
      throw new Error('jsonPath: ' + error.message + ': ' + code, {
        cause: e
      });
    }
  }
}

/** @type {{safeVm: SafeScriptType}} */
(/** @type {unknown} */JSONPathClass.prototype).safeVm = {
  Script: SafeScript
};
JSONPath.prototype = JSONPathClass.prototype;

// PUBLIC CLASS PROPERTIES AND METHODS

/**
 * Clears cached parsed paths and compiled scripts.
 * @returns {void}
 */
JSONPath.clearCache = function () {
  pathCache.clear();
  scriptCache.clear();
};

/**
 * @param {string[]} pathArr Array to convert
 * @returns {string} The path string
 */
JSONPath.toPathString = function (pathArr) {
  const x = pathArr,
    n = x.length;
  let p = '$';
  for (let i = 1; i < n; i++) {
    if (!/^(~|\^|@.*?\(\))$/v.test(x[i])) {
      p += /^[0-9*]+$/v.test(x[i]) ? '[' + x[i] + ']' : "['" + String(x[i]).replaceAll(/['\\]/gv, String.raw`\$&`) + "']";
    }
  }
  return p;
};

/**
 * @param {string[]} pointer JSON Path array
 * @returns {string} JSON Pointer
 */
JSONPath.toPointer = function (pointer) {
  const x = pointer,
    n = x.length;
  let p = '';
  for (let i = 1; i < n; i++) {
    if (!/^(~|\^|@.*?\(\))$/v.test(x[i])) {
      p += '/' + x[i].toString().replaceAll('~', '~0').replaceAll('/', '~1');
    }
  }
  return p;
};

/**
 * @param {string} expr Expression to convert
 * @returns {string[]}
 */
JSONPath.toPathArray = function (expr) {
  if (pathCache.has(expr)) {
    return /** @type {string[]} */pathCache.get(expr).concat();
  }
  /** @type {string[]} */
  const subx = [];
  const normalized = expr
  // Properties
  .replaceAll(/@[\w$\-]+\(\)/gv, ';$&;')
  // Parenthetical evaluations (filtering and otherwise), directly
  //   within brackets or single quotes
  .replaceAll(/[\['](\??\(.*?\))[\]'](?!.\])/gv, function ($0, $1) {
    return '[#' + (
    // eslint-disable-next-line @stylistic/max-len -- Long
    // eslint-disable-next-line unicorn/no-return-array-push -- Optimization
    subx.push($1) - 1) + ']';
  })
  // Unions of quoted property names (e.g., `['x','y']`) and quoted
  //   names with commas or backslash escapes, kept intact (with
  //   quotes) so their members survive tokenization
  .replaceAll(/\[\s*((?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")(?:\s*,\s*(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"))*)\s*\]/gv, function ($0, $1) {
    if (!/[,\\]/v.test($1)) {
      return $0;
    }
    // eslint-disable-next-line @stylistic/max-len -- Long
    // eslint-disable-next-line unicorn/no-return-array-push -- Optimization
    return '[#' + (subx.push($1) - 1) + ']';
  })
  // Escape periods and tildes within properties
  .replaceAll(/\[['"]([^'\]]*)['"]\]/gv, function ($0, prop) {
    return "['" + prop.replaceAll('.', '%@%').replaceAll('~', '%%@@%%') + "']";
  })
  // Properties operator
  .replaceAll('~', ';~;')
  // Split by property boundaries
  .replaceAll(/['"]?\.['"]?(?![^\[]*\])|\[['"]?/gv, ';')
  // Reinsert periods within properties
  .replaceAll('%@%', '.')
  // Reinsert tildes within properties
  .replaceAll('%%@@%%', '~')
  // Parent
  .replaceAll(/(?:;)?(\^+)(?:;)?/gv, function ($0, ups) {
    return ';' + ups.split('').join(';') + ';';
  })
  // Descendents
  .replaceAll(/;;;|;;/gv, ';..;')
  // Remove trailing
  .replaceAll(/;$|'?\]|'$/gv, '');
  const exprList = normalized.split(';').map(function (exp) {
    const match = exp.match(/#(\d+)/v);
    return !match || !match[1] ? exp : subx[Number(match[1])];
  });
  pathCache.set(expr, exprList);
  return /** @type {string[]} */pathCache.get(expr).concat();
};

/**
 * @typedef {import('./jsonpath.js').AnyInput} AnyInput
 */
/**
 * @typedef {import('./jsonpath.js').SandboxCallback} SandboxCallback
 */
/**
 * @typedef {import('./jsonpath.js').SandboxPropertyValue} SandboxPropertyValue
 */
/**
 * @typedef {import('./jsonpath.js').ExpressionArray} ExpressionArray
 */
/**
 * @typedef {import('./jsonpath.js').ValueType} ValueType
 */
/**
 * @typedef {import('./jsonpath.js').ParentValue} ParentValue
 */
/**
 * @typedef {import('./jsonpath.js').UnknownResult} UnknownResult
 */
/**
 * @typedef {import('./jsonpath.js').ParentProperty} ParentProperty
 */
/**
 * @typedef {import('./jsonpath.js').PreferredOutput} PreferredOutput
 */
/**
 * @typedef {import('./jsonpath.js').ReturnObject} ReturnObject
 */
/**
 * @typedef {import('./jsonpath.js').JSONPathCallback} JSONPathCallback
 */
/**
 * @typedef {import('./jsonpath.js').OtherTypeCallback} OtherTypeCallback
 */
/**
 * @typedef {import('./jsonpath.js').ContextItem} ContextItem
 */
/**
 * @typedef {import('./jsonpath.js').EvaluatedResult} EvaluatedResult
 */
/**
 * @typedef {import('./jsonpath.js').EvalCallback} EvalCallback
 */
/**
 * @typedef {import('./jsonpath.js').EvalClass} EvalClass
 */
/**
 * @typedef {import('./jsonpath.js').ResultType} ResultType
 */
/**
 * @typedef {import('./jsonpath.js').EvalValue} EvalValue
 */
/**
 * @typedef {import('./jsonpath.js').PathType} PathType
 */
/**
 * @typedef {import('./jsonpath.js').SafeScriptType} SafeScriptType
 */
/**
 * @typedef {import('./jsonpath.js').ScriptType} ScriptType
 */
/**
 * @typedef {import('./jsonpath.js').SandboxType} SandboxType
 */
/**
 * @typedef {import('./jsonpath.js').JSONPathOptions} JSONPathOptions
 */

/**
 * @template T
 * @callback ConditionCallback
 * @param {T} item
 * @returns {boolean}
 */

/**
 * Copy items out of one array into another.
 * @template T
 * @param {T[]} source Array with items to copy
 * @param {T[]} target Array to which to copy
 * @param {ConditionCallback<T>} conditionCb Callback passed the current item;
 *     will move item if evaluates to `true`
 * @returns {void}
 */
const moveToAnotherArray = function (source, target, conditionCb) {
  const il = source.length;
  for (let i = 0; i < il; i++) {
    const item = source[i];
    if (conditionCb(item)) {
      target.push(source.splice(i--, 1)[0]);
    }
  }
};

/**
 * In-browser replacement for NodeJS' VM.Script.
 */
class Script {
  /**
   * @param {string} expr Expression to evaluate
   */
  constructor(expr) {
    this.code = expr;
  }

  /**
   * @param {SandboxType} context Object whose items will be added
   *   to evaluation
   * @returns {EvaluatedResult} Result of evaluated code
   */
  runInNewContext(context) {
    let expr = this.code;
    const keys = Object.keys(context);
    const funcs = /** @type {string[]} */[];
    moveToAnotherArray(keys, funcs, key => {
      return typeof context[key] === 'function';
    });
    const values = keys.map(vr => {
      return context[vr];
    });
    const funcString = funcs.reduce((s, func) => {
      let fString = context[func].toString();
      if (!/function/v.test(fString)) {
        fString = 'function ' + fString;
      }
      return 'var ' + func + '=' + fString + ';' + s;
    }, '');
    expr = funcString + expr;

    // Mitigate https://perfectionkills.com/global-eval-what-are-the-options/#new_function
    if (!/(['"])use strict\1/v.test(expr) && !keys.includes('arguments')) {
      expr = 'var arguments = undefined;' + expr;
    }

    // Remove last semi so `return` will be inserted before
    //  the previous one instead, allowing for the return
    //  of a bare ending expression
    expr = expr.replace(/;\s*$/v, '');

    // Insert `return`
    const lastStatementEnd = expr.lastIndexOf(';');
    const code = lastStatementEnd !== -1 ? expr.slice(0, lastStatementEnd + 1) + ' return ' + expr.slice(lastStatementEnd + 1) : ' return ' + expr;

    // eslint-disable-next-line no-new-func -- User's choice
    return new Function(...keys, code)(...values);
  }
}

/** @type {{vm: ScriptType}} */
(/** @type {unknown} */JSONPathClass.prototype).vm = {
  Script
};

export { JSONPath, JSONPathClass, Script };
