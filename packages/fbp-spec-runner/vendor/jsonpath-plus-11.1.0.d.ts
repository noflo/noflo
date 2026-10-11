export type AnyInput = any;
export type SandboxCallback = (...args: any[]) => any;
export type SandboxPropertyValue = any | SandboxCallback;
export type ExpressionArray = (string | number)[];
export type ValueType = "scalar" | "boolean" | "string" | "undefined" | "function" | "integer" | "number" | "nonFinite" | "object" | "array" | "other" | "null";
export type ParentValue = unknown;
export type UnknownResult = unknown;
export type ParentProperty = string | number | null;
export type PreferredOutput = ReturnObject | string | number | boolean | null | unknown[] | Record<string, unknown>;
export type ReturnObject = {
    path: ExpressionArray | string;
    value: unknown;
    parent: ParentValue;
    parentProperty: ParentProperty;
    isParentSelector?: boolean;
    hasArrExpr?: boolean;
    expr?: ExpressionArray;
    pointer?: string;
};
export type JSONPathCallback = (preferredOutput: any, type: "value" | "property", fullRetObj: ReturnObject) => void;
export type OtherTypeCallback = (val: unknown, path: ExpressionArray, parent: ParentValue, parentPropName: string | number | null) => boolean | null;
export type ContextItem = any;
export type EvaluatedResult = any;
export type EvalCallback = (code: string, context: ContextItem) => EvaluatedResult;
export type ScriptConstructor = new (expr: string) => {
    runInNewContext: (context: object) => EvaluatedResult;
};
export type EvalClass = ScriptConstructor;
export type ResultType = "value" | "path" | "pointer" | "parent" | "parentProperty" | "all";
export type EvalValue = EvalCallback | EvalClass | 'safe' | 'native' | boolean;
export type PathType = string | string[];
export type SafeScriptType = {
    Script: ScriptConstructor;
};
export type ScriptType = {
    Script: ScriptConstructor;
};
export type SandboxType = {
    [key: string]: any;
    _$_path?: string;
    _$_parentProperty?: ParentProperty;
    _$_parent?: ParentValue;
    _$_property?: string | number;
    _$_root?: AnyInput;
    _$_v?: unknown;
};
export type JSONPathOptions = {
    json?: AnyInput;
    path?: PathType;
    resultType?: ResultType;
    flatten?: boolean;
    wrap?: boolean;
    sandbox?: SandboxType;
    eval?: EvalValue;
    parent?: any | null;
    parentProperty?: ParentProperty;
    callback?: JSONPathCallback;
    /**
     * Defaults to
     * function which throws on encountering `@other`
     */
    otherTypeCallback?: OtherTypeCallback;
    /**
     * Map of custom
     * type operator names to their evaluation callbacks
     */
    customTypes?: Record<string, OtherTypeCallback>;
    autostart?: boolean;
    ignoreEvalErrors?: boolean;
};
export type AssignmentExpression = any;
export type Substitution = any;
export type AnyParameter = any;
export type Substitutions = Record<string, Substitution>;
export type OperatorTable = {
    [x: string]: (a: AnyParameter, b: AnyParameter) => UnknownResult;
};
export type UnaryOperatorTable = {
    [key: string]: (a: AnyParameter) => UnknownResult;
};
export type ConditionCallback<T> = (item: T) => boolean;
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
export function JSONPath(opts: JSONPathOptions | string, expr?: string | AnyInput, obj?: AnyInput | JSONPathCallback, callback?: JSONPathCallback | OtherTypeCallback, otherTypeCallback?: OtherTypeCallback): unknown | JSONPathClass;
export namespace JSONPath {
    /**
     * Clears cached parsed paths and compiled scripts.
     * @returns {void}
     */
    function clearCache(): void;
    /**
     * @param {string[]} pathArr Array to convert
     * @returns {string} The path string
     */
    function toPathString(pathArr: string[]): string;
    /**
     * @param {string[]} pointer JSON Path array
     * @returns {string} JSON Pointer
     */
    function toPointer(pointer: string[]): string;
    /**
     * @param {string} expr Expression to convert
     * @returns {string[]}
     */
    function toPathArray(expr: string): string[];
}
/**
 *
 */
export class JSONPathClass {
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
    constructor(opts: null | string | JSONPathOptions, expr?: string | AnyInput, obj?: AnyInput | JSONPathCallback, callback?: JSONPathCallback | OtherTypeCallback, otherTypeCallback?: OtherTypeCallback);
    /** @type {ResultType|undefined} */
    currResultType: ResultType | undefined;
    /** @type {EvalValue|undefined} */
    currEval: EvalValue | undefined;
    /** @type {OtherTypeCallback|undefined} */
    currOtherTypeCallback: OtherTypeCallback | undefined;
    /** @type {Record<string, OtherTypeCallback>|undefined} */
    currCustomTypes: Record<string, OtherTypeCallback> | undefined;
    /** @type {SandboxType|undefined} */
    currSandbox: SandboxType | undefined;
    _hasParentSelector: boolean;
    json: any;
    path: any;
    resultType: any;
    flatten: any;
    wrap: any;
    sandbox: any;
    eval: any;
    ignoreEvalErrors: any;
    parent: any;
    parentProperty: any;
    callback: any;
    otherTypeCallback: any;
    customTypes: any;
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
    evaluate(expr?: PathType | JSONPathOptions | undefined, json?: AnyInput, callback?: JSONPathCallback | null, otherTypeCallback?: OtherTypeCallback): ReturnObject | ReturnObject[] | undefined | unknown;
    /**
     * @param {ReturnObject} ea
     * @returns {PreferredOutput}
     */
    _getPreferredOutput(ea: ReturnObject): PreferredOutput;
    /**
     * @param {ReturnObject} fullRetObj
     * @param {JSONPathCallback|undefined} callback
     * @param {"value"|"property"} type
     * @returns {void}
     */
    _handleCallback(fullRetObj: ReturnObject, callback: JSONPathCallback | undefined, type: "value" | "property"): void;
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
    _trace(expr: ExpressionArray, val: unknown, path: ExpressionArray, parent: ParentValue, parentPropName: ParentProperty, callback: JSONPathCallback | undefined, hasArrExpr: boolean | undefined, literalPriority?: boolean): ReturnObject | ReturnObject[];
    /**
     * @param {unknown} val
     * @param {(prop: string|number) => void} f
     * @returns {void}
     */
    _walk(val: unknown, f: (prop: string | number) => void): void;
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
    _slice(loc: string, expr: ExpressionArray, val: unknown, path: ExpressionArray, parent: ParentValue, parentPropName: ParentProperty, callback: JSONPathCallback | undefined): ReturnObject[] | undefined;
    /**
     * @param {string} code
     * @param {unknown} _v
     * @param {string|number} _vname
     * @param {ExpressionArray} path
     * @param {ParentValue} parent
     * @param {ParentProperty} parentPropName
     * @returns {UnknownResult}
     */
    _eval(code: string, _v: unknown, _vname: string | number, path: ExpressionArray, parent: ParentValue, parentPropName: ParentProperty): UnknownResult;
}
/**
 * In-browser replacement for NodeJS' VM.Script.
 */
export class Script {
    /**
     * @param {string} expr Expression to evaluate
     */
    constructor(expr: string);
    code: string;
    /**
     * @param {SandboxType} context Object whose items will be added
     *   to evaluation
     * @returns {EvaluatedResult} Result of evaluated code
     */
    runInNewContext(context: SandboxType): EvaluatedResult;
}
