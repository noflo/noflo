export var Alias: {
    new (source: any): {
        source: any;
        /**
         * Resolve the value of this alias within `doc`, finding the last
         * instance of the `source` anchor before this node.
         */
        resolve(doc: any, ctx: any): any;
        toJSON(_arg: any, ctx: any): any;
        toString(ctx: any, _onComment: any, _onChompKeep: any): string;
        /** Create a copy of this node.  */
        clone(): any;
        /** A plain JavaScript representation of this node. */
        toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
    };
};
declare var cst_exports: {};
export var Composer: {
    new (options?: {}): {
        doc: {
            commentBefore: any;
            comment: any;
            errors: any[];
            warnings: any[];
            options: any;
            directives: any;
            contents: any;
            /**
             * Create a deep copy of this Document and its contents.
             *
             * Custom Node values that inherit from `Object` still refer to their original instances.
             */
            clone(): any;
            /** Adds a value to the document. */
            add(value: any): void;
            /** Adds a value to the document. */
            addIn(path: any, value: any): void;
            /**
             * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
             *
             * If `node` already has an anchor, `name` is ignored.
             * Otherwise, the `node.anchor` value will be set to `name`,
             * or if an anchor with that name is already present in the document,
             * `name` will be used as a prefix for a new unique anchor.
             * If `name` is undefined, the generated anchor will use 'a' as a prefix.
             */
            createAlias(node: any, name: any): {
                source: any;
                /**
                 * Resolve the value of this alias within `doc`, finding the last
                 * instance of the `source` anchor before this node.
                 */
                resolve(doc: any, ctx: any): any;
                toJSON(_arg: any, ctx: any): any;
                toString(ctx: any, _onComment: any, _onChompKeep: any): string;
                /** Create a copy of this node.  */
                clone(): any;
                /** A plain JavaScript representation of this node. */
                toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                    mapAsMap: any;
                    maxAliasCount: any;
                    onAnchor: any;
                    reviver: any;
                }): any;
            };
            createNode(value: any, replacer: any, options: any): any;
            /**
             * Convert a key and a value into a `Pair` using the current schema,
             * recursively wrapping all values as `Scalar` or `Collection` nodes.
             */
            createPair(key: any, value: any, options?: {}): {
                key: any;
                value: any;
                clone(schema4: any): any;
                toJSON(_: any, ctx: any): any;
                toString(ctx: any, onComment: any, onChompKeep: any): any;
            };
            /**
             * Removes a value from the document.
             * @returns `true` if the item was found and removed.
             */
            delete(key: any): any;
            /**
             * Removes a value from the document.
             * @returns `true` if the item was found and removed.
             */
            deleteIn(path: any): any;
            /**
             * Returns item at `key`, or `undefined` if not found. By default unwraps
             * scalar values from their surrounding node; to disable set `keepScalar` to
             * `true` (collections are always returned intact).
             */
            get(key: any, keepScalar: any): any;
            /**
             * Returns item at `path`, or `undefined` if not found. By default unwraps
             * scalar values from their surrounding node; to disable set `keepScalar` to
             * `true` (collections are always returned intact).
             */
            getIn(path: any, keepScalar: any): any;
            /**
             * Checks if the document includes a value with the key `key`.
             */
            has(key: any): any;
            /**
             * Checks if the document includes a value at `path`.
             */
            hasIn(path: any): any;
            /**
             * Sets a value in this document. For `!!set`, `value` needs to be a
             * boolean to add/remove the item from the set.
             */
            set(key: any, value: any): void;
            /**
             * Sets a value in this document. For `!!set`, `value` needs to be a
             * boolean to add/remove the item from the set.
             */
            setIn(path: any, value: any): void;
            /**
             * Change the YAML version and schema used by the document.
             * A `null` version disables support for directives, explicit tags, anchors, and aliases.
             * It also requires the `schema` option to be given as a `Schema` instance value.
             *
             * Overrides all previously set schema options.
             */
            setSchema(version: any, options?: {}): void;
            schema: any;
            toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                json: any;
                jsonArg: any;
                mapAsMap: any;
                maxAliasCount: any;
                onAnchor: any;
                reviver: any;
            }): any;
            /**
             * A JSON representation of the document `contents`.
             *
             * @param jsonArg Used by `JSON.stringify` to indicate the array index or
             *   property name.
             */
            toJSON(jsonArg: any, onAnchor: any): any;
            /** A YAML representation of the document. */
            toString(options?: {}): string;
        };
        atDirectives: boolean;
        prelude: any[];
        errors: any[];
        warnings: any[];
        onError: (source: any, code: any, message: any, warning: any) => void;
        directives: {
            docStart: any;
            docEnd: boolean;
            yaml: any;
            tags: any;
            clone(): any;
            /**
             * During parsing, get a Directives instance for the current document and
             * update the stream state according to the current version's spec.
             */
            atDocument(): any;
            atNextDocument: boolean;
            /**
             * @param onError - May be called even if the action was successful
             * @returns `true` on success
             */
            add(line: any, onError: any): boolean;
            /**
             * Resolves a tag, matching handles to those defined in %TAG directives.
             *
             * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
             *   `'!local'` tag, or `null` if unresolvable.
             */
            tagName(source: any, onError: any): any;
            /**
             * Given a fully resolved tag, returns its printable string form,
             * taking into account current tag prefixes and defaults.
             */
            tagString(tag: any): any;
            toString(doc: any): string;
        };
        options: {};
        decorate(doc: any, afterDoc: any): void;
        /**
         * Current stream status information.
         *
         * Mostly useful at the end of input for an empty stream.
         */
        streamInfo(): {
            comment: string;
            directives: {
                docStart: any;
                docEnd: boolean;
                yaml: any;
                tags: any;
                clone(): any;
                /**
                 * During parsing, get a Directives instance for the current document and
                 * update the stream state according to the current version's spec.
                 */
                atDocument(): any;
                atNextDocument: boolean;
                /**
                 * @param onError - May be called even if the action was successful
                 * @returns `true` on success
                 */
                add(line: any, onError: any): boolean;
                /**
                 * Resolves a tag, matching handles to those defined in %TAG directives.
                 *
                 * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
                 *   `'!local'` tag, or `null` if unresolvable.
                 */
                tagName(source: any, onError: any): any;
                /**
                 * Given a fully resolved tag, returns its printable string form,
                 * taking into account current tag prefixes and defaults.
                 */
                tagString(tag: any): any;
                toString(doc: any): string;
            };
            errors: any[];
            warnings: any[];
        };
        /**
         * Compose tokens into documents.
         *
         * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
         * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
         */
        compose(tokens: any, forceDoc?: boolean, endOffset?: number): Generator<{
            commentBefore: any;
            comment: any;
            errors: any[];
            warnings: any[];
            options: any;
            directives: any;
            contents: any;
            /**
             * Create a deep copy of this Document and its contents.
             *
             * Custom Node values that inherit from `Object` still refer to their original instances.
             */
            clone(): any;
            /** Adds a value to the document. */
            add(value: any): void;
            /** Adds a value to the document. */
            addIn(path: any, value: any): void;
            /**
             * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
             *
             * If `node` already has an anchor, `name` is ignored.
             * Otherwise, the `node.anchor` value will be set to `name`,
             * or if an anchor with that name is already present in the document,
             * `name` will be used as a prefix for a new unique anchor.
             * If `name` is undefined, the generated anchor will use 'a' as a prefix.
             */
            createAlias(node: any, name: any): {
                source: any;
                /**
                 * Resolve the value of this alias within `doc`, finding the last
                 * instance of the `source` anchor before this node.
                 */
                resolve(doc: any, ctx: any): any;
                toJSON(_arg: any, ctx: any): any;
                toString(ctx: any, _onComment: any, _onChompKeep: any): string;
                /** Create a copy of this node.  */
                clone(): any;
                /** A plain JavaScript representation of this node. */
                toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                    mapAsMap: any;
                    maxAliasCount: any;
                    onAnchor: any;
                    reviver: any;
                }): any;
            };
            createNode(value: any, replacer: any, options: any): any;
            /**
             * Convert a key and a value into a `Pair` using the current schema,
             * recursively wrapping all values as `Scalar` or `Collection` nodes.
             */
            createPair(key: any, value: any, options?: {}): {
                key: any;
                value: any;
                clone(schema4: any): any;
                toJSON(_: any, ctx: any): any;
                toString(ctx: any, onComment: any, onChompKeep: any): any;
            };
            /**
             * Removes a value from the document.
             * @returns `true` if the item was found and removed.
             */
            delete(key: any): any;
            /**
             * Removes a value from the document.
             * @returns `true` if the item was found and removed.
             */
            deleteIn(path: any): any;
            /**
             * Returns item at `key`, or `undefined` if not found. By default unwraps
             * scalar values from their surrounding node; to disable set `keepScalar` to
             * `true` (collections are always returned intact).
             */
            get(key: any, keepScalar: any): any;
            /**
             * Returns item at `path`, or `undefined` if not found. By default unwraps
             * scalar values from their surrounding node; to disable set `keepScalar` to
             * `true` (collections are always returned intact).
             */
            getIn(path: any, keepScalar: any): any;
            /**
             * Checks if the document includes a value with the key `key`.
             */
            has(key: any): any;
            /**
             * Checks if the document includes a value at `path`.
             */
            hasIn(path: any): any;
            /**
             * Sets a value in this document. For `!!set`, `value` needs to be a
             * boolean to add/remove the item from the set.
             */
            set(key: any, value: any): void;
            /**
             * Sets a value in this document. For `!!set`, `value` needs to be a
             * boolean to add/remove the item from the set.
             */
            setIn(path: any, value: any): void;
            /**
             * Change the YAML version and schema used by the document.
             * A `null` version disables support for directives, explicit tags, anchors, and aliases.
             * It also requires the `schema` option to be given as a `Schema` instance value.
             *
             * Overrides all previously set schema options.
             */
            setSchema(version: any, options?: {}): void;
            schema: any;
            toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                json: any;
                jsonArg: any;
                mapAsMap: any;
                maxAliasCount: any;
                onAnchor: any;
                reviver: any;
            }): any;
            /**
             * A JSON representation of the document `contents`.
             *
             * @param jsonArg Used by `JSON.stringify` to indicate the array index or
             *   property name.
             */
            toJSON(jsonArg: any, onAnchor: any): any;
            /** A YAML representation of the document. */
            toString(options?: {}): string;
        }, void, unknown>;
        /** Advance the composer by one CST token. */
        next(token: any): Generator<{
            commentBefore: any;
            comment: any;
            errors: any[];
            warnings: any[];
            options: any;
            directives: any;
            contents: any;
            /**
             * Create a deep copy of this Document and its contents.
             *
             * Custom Node values that inherit from `Object` still refer to their original instances.
             */
            clone(): any;
            /** Adds a value to the document. */
            add(value: any): void;
            /** Adds a value to the document. */
            addIn(path: any, value: any): void;
            /**
             * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
             *
             * If `node` already has an anchor, `name` is ignored.
             * Otherwise, the `node.anchor` value will be set to `name`,
             * or if an anchor with that name is already present in the document,
             * `name` will be used as a prefix for a new unique anchor.
             * If `name` is undefined, the generated anchor will use 'a' as a prefix.
             */
            createAlias(node: any, name: any): {
                source: any;
                /**
                 * Resolve the value of this alias within `doc`, finding the last
                 * instance of the `source` anchor before this node.
                 */
                resolve(doc: any, ctx: any): any;
                toJSON(_arg: any, ctx: any): any;
                toString(ctx: any, _onComment: any, _onChompKeep: any): string;
                /** Create a copy of this node.  */
                clone(): any;
                /** A plain JavaScript representation of this node. */
                toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                    mapAsMap: any;
                    maxAliasCount: any;
                    onAnchor: any;
                    reviver: any;
                }): any;
            };
            createNode(value: any, replacer: any, options: any): any;
            /**
             * Convert a key and a value into a `Pair` using the current schema,
             * recursively wrapping all values as `Scalar` or `Collection` nodes.
             */
            createPair(key: any, value: any, options?: {}): {
                key: any;
                value: any;
                clone(schema4: any): any;
                toJSON(_: any, ctx: any): any;
                toString(ctx: any, onComment: any, onChompKeep: any): any;
            };
            /**
             * Removes a value from the document.
             * @returns `true` if the item was found and removed.
             */
            delete(key: any): any;
            /**
             * Removes a value from the document.
             * @returns `true` if the item was found and removed.
             */
            deleteIn(path: any): any;
            /**
             * Returns item at `key`, or `undefined` if not found. By default unwraps
             * scalar values from their surrounding node; to disable set `keepScalar` to
             * `true` (collections are always returned intact).
             */
            get(key: any, keepScalar: any): any;
            /**
             * Returns item at `path`, or `undefined` if not found. By default unwraps
             * scalar values from their surrounding node; to disable set `keepScalar` to
             * `true` (collections are always returned intact).
             */
            getIn(path: any, keepScalar: any): any;
            /**
             * Checks if the document includes a value with the key `key`.
             */
            has(key: any): any;
            /**
             * Checks if the document includes a value at `path`.
             */
            hasIn(path: any): any;
            /**
             * Sets a value in this document. For `!!set`, `value` needs to be a
             * boolean to add/remove the item from the set.
             */
            set(key: any, value: any): void;
            /**
             * Sets a value in this document. For `!!set`, `value` needs to be a
             * boolean to add/remove the item from the set.
             */
            setIn(path: any, value: any): void;
            /**
             * Change the YAML version and schema used by the document.
             * A `null` version disables support for directives, explicit tags, anchors, and aliases.
             * It also requires the `schema` option to be given as a `Schema` instance value.
             *
             * Overrides all previously set schema options.
             */
            setSchema(version: any, options?: {}): void;
            schema: any;
            toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                json: any;
                jsonArg: any;
                mapAsMap: any;
                maxAliasCount: any;
                onAnchor: any;
                reviver: any;
            }): any;
            /**
             * A JSON representation of the document `contents`.
             *
             * @param jsonArg Used by `JSON.stringify` to indicate the array index or
             *   property name.
             */
            toJSON(jsonArg: any, onAnchor: any): any;
            /** A YAML representation of the document. */
            toString(options?: {}): string;
        }, void, unknown>;
        /**
         * Call at end of input to yield any remaining document.
         *
         * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
         * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
         */
        end(forceDoc?: boolean, endOffset?: number): Generator<{
            commentBefore: any;
            comment: any;
            errors: any[];
            warnings: any[];
            options: any;
            directives: any;
            contents: any;
            /**
             * Create a deep copy of this Document and its contents.
             *
             * Custom Node values that inherit from `Object` still refer to their original instances.
             */
            clone(): any;
            /** Adds a value to the document. */
            add(value: any): void;
            /** Adds a value to the document. */
            addIn(path: any, value: any): void;
            /**
             * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
             *
             * If `node` already has an anchor, `name` is ignored.
             * Otherwise, the `node.anchor` value will be set to `name`,
             * or if an anchor with that name is already present in the document,
             * `name` will be used as a prefix for a new unique anchor.
             * If `name` is undefined, the generated anchor will use 'a' as a prefix.
             */
            createAlias(node: any, name: any): {
                source: any;
                /**
                 * Resolve the value of this alias within `doc`, finding the last
                 * instance of the `source` anchor before this node.
                 */
                resolve(doc: any, ctx: any): any;
                toJSON(_arg: any, ctx: any): any;
                toString(ctx: any, _onComment: any, _onChompKeep: any): string;
                /** Create a copy of this node.  */
                clone(): any;
                /** A plain JavaScript representation of this node. */
                toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                    mapAsMap: any;
                    maxAliasCount: any;
                    onAnchor: any;
                    reviver: any;
                }): any;
            };
            createNode(value: any, replacer: any, options: any): any;
            /**
             * Convert a key and a value into a `Pair` using the current schema,
             * recursively wrapping all values as `Scalar` or `Collection` nodes.
             */
            createPair(key: any, value: any, options?: {}): {
                key: any;
                value: any;
                clone(schema4: any): any;
                toJSON(_: any, ctx: any): any;
                toString(ctx: any, onComment: any, onChompKeep: any): any;
            };
            /**
             * Removes a value from the document.
             * @returns `true` if the item was found and removed.
             */
            delete(key: any): any;
            /**
             * Removes a value from the document.
             * @returns `true` if the item was found and removed.
             */
            deleteIn(path: any): any;
            /**
             * Returns item at `key`, or `undefined` if not found. By default unwraps
             * scalar values from their surrounding node; to disable set `keepScalar` to
             * `true` (collections are always returned intact).
             */
            get(key: any, keepScalar: any): any;
            /**
             * Returns item at `path`, or `undefined` if not found. By default unwraps
             * scalar values from their surrounding node; to disable set `keepScalar` to
             * `true` (collections are always returned intact).
             */
            getIn(path: any, keepScalar: any): any;
            /**
             * Checks if the document includes a value with the key `key`.
             */
            has(key: any): any;
            /**
             * Checks if the document includes a value at `path`.
             */
            hasIn(path: any): any;
            /**
             * Sets a value in this document. For `!!set`, `value` needs to be a
             * boolean to add/remove the item from the set.
             */
            set(key: any, value: any): void;
            /**
             * Sets a value in this document. For `!!set`, `value` needs to be a
             * boolean to add/remove the item from the set.
             */
            setIn(path: any, value: any): void;
            /**
             * Change the YAML version and schema used by the document.
             * A `null` version disables support for directives, explicit tags, anchors, and aliases.
             * It also requires the `schema` option to be given as a `Schema` instance value.
             *
             * Overrides all previously set schema options.
             */
            setSchema(version: any, options?: {}): void;
            schema: any;
            toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                json: any;
                jsonArg: any;
                mapAsMap: any;
                maxAliasCount: any;
                onAnchor: any;
                reviver: any;
            }): any;
            /**
             * A JSON representation of the document `contents`.
             *
             * @param jsonArg Used by `JSON.stringify` to indicate the array index or
             *   property name.
             */
            toJSON(jsonArg: any, onAnchor: any): any;
            /** A YAML representation of the document. */
            toString(options?: {}): string;
        }, void, unknown>;
    };
};
export var Document: {
    new (value: any, replacer: any, options: any): {
        commentBefore: any;
        comment: any;
        errors: any[];
        warnings: any[];
        options: any;
        directives: any;
        contents: any;
        /**
         * Create a deep copy of this Document and its contents.
         *
         * Custom Node values that inherit from `Object` still refer to their original instances.
         */
        clone(): any;
        /** Adds a value to the document. */
        add(value: any): void;
        /** Adds a value to the document. */
        addIn(path: any, value: any): void;
        /**
         * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
         *
         * If `node` already has an anchor, `name` is ignored.
         * Otherwise, the `node.anchor` value will be set to `name`,
         * or if an anchor with that name is already present in the document,
         * `name` will be used as a prefix for a new unique anchor.
         * If `name` is undefined, the generated anchor will use 'a' as a prefix.
         */
        createAlias(node: any, name: any): {
            source: any;
            /**
             * Resolve the value of this alias within `doc`, finding the last
             * instance of the `source` anchor before this node.
             */
            resolve(doc: any, ctx: any): any;
            toJSON(_arg: any, ctx: any): any;
            toString(ctx: any, _onComment: any, _onChompKeep: any): string;
            /** Create a copy of this node.  */
            clone(): any;
            /** A plain JavaScript representation of this node. */
            toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
                mapAsMap: any;
                maxAliasCount: any;
                onAnchor: any;
                reviver: any;
            }): any;
        };
        createNode(value: any, replacer: any, options: any): any;
        /**
         * Convert a key and a value into a `Pair` using the current schema,
         * recursively wrapping all values as `Scalar` or `Collection` nodes.
         */
        createPair(key: any, value: any, options?: {}): {
            key: any;
            value: any;
            clone(schema4: any): any;
            toJSON(_: any, ctx: any): any;
            toString(ctx: any, onComment: any, onChompKeep: any): any;
        };
        /**
         * Removes a value from the document.
         * @returns `true` if the item was found and removed.
         */
        delete(key: any): any;
        /**
         * Removes a value from the document.
         * @returns `true` if the item was found and removed.
         */
        deleteIn(path: any): any;
        /**
         * Returns item at `key`, or `undefined` if not found. By default unwraps
         * scalar values from their surrounding node; to disable set `keepScalar` to
         * `true` (collections are always returned intact).
         */
        get(key: any, keepScalar: any): any;
        /**
         * Returns item at `path`, or `undefined` if not found. By default unwraps
         * scalar values from their surrounding node; to disable set `keepScalar` to
         * `true` (collections are always returned intact).
         */
        getIn(path: any, keepScalar: any): any;
        /**
         * Checks if the document includes a value with the key `key`.
         */
        has(key: any): any;
        /**
         * Checks if the document includes a value at `path`.
         */
        hasIn(path: any): any;
        /**
         * Sets a value in this document. For `!!set`, `value` needs to be a
         * boolean to add/remove the item from the set.
         */
        set(key: any, value: any): void;
        /**
         * Sets a value in this document. For `!!set`, `value` needs to be a
         * boolean to add/remove the item from the set.
         */
        setIn(path: any, value: any): void;
        /**
         * Change the YAML version and schema used by the document.
         * A `null` version disables support for directives, explicit tags, anchors, and aliases.
         * It also requires the `schema` option to be given as a `Schema` instance value.
         *
         * Overrides all previously set schema options.
         */
        setSchema(version: any, options?: {}): void;
        schema: any;
        toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            json: any;
            jsonArg: any;
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
        /**
         * A JSON representation of the document `contents`.
         *
         * @param jsonArg Used by `JSON.stringify` to indicate the array index or
         *   property name.
         */
        toJSON(jsonArg: any, onAnchor: any): any;
        /** A YAML representation of the document. */
        toString(options?: {}): string;
    };
};
export var Lexer: {
    new (): {
        atEnd: boolean;
        blockScalarIndent: number;
        blockScalarKeep: boolean;
        buffer: string;
        flowKey: boolean;
        flowLevel: number;
        indentNext: number;
        indentValue: number;
        lineEndPos: any;
        next: any;
        pos: number;
        /**
         * Generate YAML tokens from the `source` string. If `incomplete`,
         * a part of the last line may be left as a buffer for the next call.
         *
         * @returns A generator of lexical tokens
         */
        lex(source: any, incomplete?: boolean): Generator<string, void, unknown>;
        atLineEnd(): boolean;
        charAt(n: any): string;
        continueScalar(offset: any): any;
        getLine(): string;
        hasChars(n: any): boolean;
        setNext(state: any): any;
        peek(n: any): string;
        parseNext(next: any): Generator<string, any, unknown>;
        parseStream(): Generator<string, any, unknown>;
        parseLineStart(): Generator<string, any, unknown>;
        parseBlockStart(): Generator<string, any, unknown>;
        parseDocument(): Generator<string, any, unknown>;
        parseFlowCollection(): Generator<string, any, unknown>;
        parseQuotedScalar(): Generator<string, any, unknown>;
        parseBlockScalarHeader(): Generator<string, number, unknown>;
        parseBlockScalar(): Generator<string, any, unknown>;
        parsePlainScalar(): Generator<string, any, unknown>;
        pushCount(n: any): Generator<string, any, unknown>;
        pushToIndex(i: any, allowEmpty: any): Generator<string, number, unknown>;
        pushIndicators(): Generator<string, number, unknown>;
        pushTag(): Generator<string, number, unknown>;
        pushNewline(): Generator<string, any, unknown>;
        pushSpaces(allowTabs: any): Generator<string, number, unknown>;
        pushUntil(test: any): Generator<string, number, unknown>;
    };
};
export var LineCounter: {
    new (): {
        lineStarts: any[];
        addNewLine: (offset: any) => number;
        linePos: (offset: any) => {
            line: number;
            col: any;
        };
    };
};
export var Pair: {
    new (key: any, value?: any): {
        key: any;
        value: any;
        clone(schema4: any): any;
        toJSON(_: any, ctx: any): any;
        toString(ctx: any, onComment: any, onChompKeep: any): any;
    };
};
export var Parser: {
    new (onNewLine: any): {
        atNewLine: boolean;
        atScalar: boolean;
        indent: number;
        offset: number;
        onKeyLine: boolean;
        stack: any[];
        source: string;
        type: string;
        lexer: {
            atEnd: boolean;
            blockScalarIndent: number;
            blockScalarKeep: boolean;
            buffer: string;
            flowKey: boolean;
            flowLevel: number;
            indentNext: number;
            indentValue: number;
            lineEndPos: any;
            next: any;
            pos: number;
            /**
             * Generate YAML tokens from the `source` string. If `incomplete`,
             * a part of the last line may be left as a buffer for the next call.
             *
             * @returns A generator of lexical tokens
             */
            lex(source: any, incomplete?: boolean): Generator<string, void, unknown>;
            atLineEnd(): boolean;
            charAt(n: any): string;
            continueScalar(offset: any): any;
            getLine(): string;
            hasChars(n: any): boolean;
            setNext(state: any): any;
            peek(n: any): string;
            parseNext(next: any): Generator<string, any, unknown>;
            parseStream(): Generator<string, any, unknown>;
            parseLineStart(): Generator<string, any, unknown>;
            parseBlockStart(): Generator<string, any, unknown>;
            parseDocument(): Generator<string, any, unknown>;
            parseFlowCollection(): Generator<string, any, unknown>;
            parseQuotedScalar(): Generator<string, any, unknown>;
            parseBlockScalarHeader(): Generator<string, number, unknown>;
            parseBlockScalar(): Generator<string, any, unknown>;
            parsePlainScalar(): Generator<string, any, unknown>;
            pushCount(n: any): Generator<string, any, unknown>;
            pushToIndex(i: any, allowEmpty: any): Generator<string, number, unknown>;
            pushIndicators(): Generator<string, number, unknown>;
            pushTag(): Generator<string, number, unknown>;
            pushNewline(): Generator<string, any, unknown>;
            pushSpaces(allowTabs: any): Generator<string, number, unknown>;
            pushUntil(test: any): Generator<string, number, unknown>;
        };
        onNewLine: any;
        /**
         * Parse `source` as a YAML stream.
         * If `incomplete`, a part of the last line may be left as a buffer for the next call.
         *
         * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
         *
         * @returns A generator of tokens representing each directive, document, and other structure.
         */
        parse(source: any, incomplete?: boolean): Generator<any, void, any>;
        /**
         * Advance the parser by the `source` of one lexical token.
         */
        next(source: any): Generator<any, void, any>;
        /** Call at end of input to push out any remaining constructions */
        end(): Generator<any, void, any>;
        readonly sourceToken: {
            type: string;
            offset: number;
            indent: number;
            source: string;
        };
        step(): any;
        peek(n: any): any;
        pop(error: any): any;
        stream(): Generator<{
            type: string;
            offset: number;
            indent: number;
            source: string;
        } | {
            type: string;
            offset: number;
            source: string;
            message?: undefined;
        } | {
            type: string;
            offset: number;
            message: string;
            source: string;
        }, void, unknown>;
        document(doc: any): any;
        scalar(scalar: any): Generator<any, void, any>;
        blockScalar(scalar: any): any;
        blockMap(map2: any): any;
        blockSequence(seq2: any): any;
        flowCollection(fc: any): any;
        flowScalar(type: any): {
            type: any;
            offset: number;
            indent: number;
            source: string;
        };
        startBlockValue(parent: any): {
            type: any;
            offset: number;
            indent: number;
            source: string;
        } | {
            type: string;
            offset: number;
            indent: number;
            start: {
                type: string;
                offset: number;
                indent: number;
                source: string;
            };
            items: any[];
            end: any[];
        } | {
            type: string;
            offset: number;
            indent: number;
            items: {
                start: {
                    type: string;
                    offset: number;
                    indent: number;
                    source: string;
                }[];
            }[];
            start?: undefined;
            end?: undefined;
        } | {
            type: string;
            offset: number;
            indent: number;
            items: {
                start: any;
                explicitKey: boolean;
            }[];
            start?: undefined;
            end?: undefined;
        } | {
            type: string;
            offset: number;
            indent: number;
            items: {
                start: any;
                key: any;
                sep: {
                    type: string;
                    offset: number;
                    indent: number;
                    source: string;
                }[];
            }[];
            start?: undefined;
            end?: undefined;
        };
        atIndentedComment(start: any, indent: any): any;
        documentEnd(docEnd: any): Generator<any, void, any>;
        lineEnd(token: any): any;
    };
};
export var Scalar: {
    new (value: any): {
        value: any;
        toJSON(arg: any, ctx: any): any;
        toString(): string;
        /** Create a copy of this node.  */
        clone(): any;
        /** A plain JavaScript representation of this node. */
        toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
    };
    BLOCK_FOLDED: string;
    BLOCK_LITERAL: string;
    PLAIN: string;
    QUOTE_DOUBLE: string;
    QUOTE_SINGLE: string;
};
export var Schema: {
    new ({ compat, customTags, merge: merge2, resolveKnownTags, schema: schema4, sortMapEntries, toStringDefaults }: {
        compat: any;
        customTags: any;
        merge: any;
        resolveKnownTags: any;
        schema: any;
        sortMapEntries: any;
        toStringDefaults: any;
    }): {
        compat: any[];
        name: string;
        knownTags: {};
        tags: any[];
        toStringOptions: any;
        sortMapEntries: any;
        clone(): any;
    };
};
export var YAMLError: {
    new (name: any, pos: any, code: any, message: any): {
        name: any;
        code: any;
        message: any;
        pos: any;
        stack?: string;
        cause?: unknown;
    };
    captureStackTrace(targetObject: object, constructorOpt?: Function): void;
    prepareStackTrace(err: Error, stackTraces: NodeJS.CallSite[]): any;
    stackTraceLimit: number;
};
export var YAMLMap: {
    new (schema4: any): {
        items: any[];
        /**
         * Adds a value to the collection.
         *
         * @param overwrite - If not set `true`, using a key that is already in the
         *   collection will throw. Otherwise, overwrites the previous value.
         */
        add(pair: any, overwrite: any): void;
        delete(key: any): boolean;
        get(key: any, keepScalar: any): any;
        has(key: any): boolean;
        set(key: any, value: any): void;
        /**
         * @param ctx - Conversion context, originally set in Document#toJS()
         * @param {Class} Type - If set, forces the returned collection type
         * @returns Instance of Type, Map, or Object
         */
        toJSON(_: any, ctx: any, Type: Class): any;
        toString(ctx: any, onComment: any, onChompKeep: any): any;
        /**
         * Create a copy of this collection.
         *
         * @param schema - If defined, overwrites the original's schema
         */
        clone(schema4: any): any;
        /**
         * Adds a value to the collection. For `!!map` and `!!omap` the value must
         * be a Pair instance or a `{ key, value }` object, which may not have a key
         * that already exists in the map.
         */
        addIn(path: any, value: any): void;
        /**
         * Removes a value from the collection.
         * @returns `true` if the item was found and removed.
         */
        deleteIn(path: any): any;
        /**
         * Returns item at `key`, or `undefined` if not found. By default unwraps
         * scalar values from their surrounding node; to disable set `keepScalar` to
         * `true` (collections are always returned intact).
         */
        getIn(path: any, keepScalar: any): any;
        hasAllNullValues(allowScalar: any): any;
        /**
         * Checks if the collection includes a value with the key `key`.
         */
        hasIn(path: any): any;
        /**
         * Sets a value in this collection. For `!!set`, `value` needs to be a
         * boolean to add/remove the item from the set.
         */
        setIn(path: any, value: any): void;
        /** A plain JavaScript representation of this node. */
        toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
    };
    readonly tagName: string;
    /**
     * A generic collection parsing method that can be extended
     * to other node classes that inherit from YAMLMap
     */
    from(schema4: any, obj: any, ctx: any): {
        items: any[];
        /**
         * Adds a value to the collection.
         *
         * @param overwrite - If not set `true`, using a key that is already in the
         *   collection will throw. Otherwise, overwrites the previous value.
         */
        add(pair: any, overwrite: any): void;
        delete(key: any): boolean;
        get(key: any, keepScalar: any): any;
        has(key: any): boolean;
        set(key: any, value: any): void;
        /**
         * @param ctx - Conversion context, originally set in Document#toJS()
         * @param {Class} Type - If set, forces the returned collection type
         * @returns Instance of Type, Map, or Object
         */
        toJSON(_: any, ctx: any, Type: Class): any;
        toString(ctx: any, onComment: any, onChompKeep: any): any;
        /**
         * Create a copy of this collection.
         *
         * @param schema - If defined, overwrites the original's schema
         */
        clone(schema4: any): any;
        /**
         * Adds a value to the collection. For `!!map` and `!!omap` the value must
         * be a Pair instance or a `{ key, value }` object, which may not have a key
         * that already exists in the map.
         */
        addIn(path: any, value: any): void;
        /**
         * Removes a value from the collection.
         * @returns `true` if the item was found and removed.
         */
        deleteIn(path: any): any;
        /**
         * Returns item at `key`, or `undefined` if not found. By default unwraps
         * scalar values from their surrounding node; to disable set `keepScalar` to
         * `true` (collections are always returned intact).
         */
        getIn(path: any, keepScalar: any): any;
        hasAllNullValues(allowScalar: any): any;
        /**
         * Checks if the collection includes a value with the key `key`.
         */
        hasIn(path: any): any;
        /**
         * Sets a value in this collection. For `!!set`, `value` needs to be a
         * boolean to add/remove the item from the set.
         */
        setIn(path: any, value: any): void;
        /** A plain JavaScript representation of this node. */
        toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
    };
};
export var YAMLParseError: {
    new (pos: any, code: any, message: any): {
        name: any;
        code: any;
        message: any;
        pos: any;
        stack?: string;
        cause?: unknown;
    };
    captureStackTrace(targetObject: object, constructorOpt?: Function): void;
    prepareStackTrace(err: Error, stackTraces: NodeJS.CallSite[]): any;
    stackTraceLimit: number;
};
export var YAMLSeq: {
    new (schema4: any): {
        items: any[];
        add(value: any): void;
        /**
         * Removes a value from the collection.
         *
         * `key` must contain a representation of an integer for this to succeed.
         * It may be wrapped in a `Scalar`.
         *
         * @returns `true` if the item was found and removed.
         */
        delete(key: any): boolean;
        get(key: any, keepScalar: any): any;
        /**
         * Checks if the collection includes a value with the key `key`.
         *
         * `key` must contain a representation of an integer for this to succeed.
         * It may be wrapped in a `Scalar`.
         */
        has(key: any): boolean;
        /**
         * Sets a value in this collection. For `!!set`, `value` needs to be a
         * boolean to add/remove the item from the set.
         *
         * If `key` does not contain a representation of an integer, this will throw.
         * It may be wrapped in a `Scalar`.
         */
        set(key: any, value: any): void;
        toJSON(_: any, ctx: any): any[];
        toString(ctx: any, onComment: any, onChompKeep: any): any;
        /**
         * Create a copy of this collection.
         *
         * @param schema - If defined, overwrites the original's schema
         */
        clone(schema4: any): any;
        /**
         * Adds a value to the collection. For `!!map` and `!!omap` the value must
         * be a Pair instance or a `{ key, value }` object, which may not have a key
         * that already exists in the map.
         */
        addIn(path: any, value: any): void;
        /**
         * Removes a value from the collection.
         * @returns `true` if the item was found and removed.
         */
        deleteIn(path: any): any;
        /**
         * Returns item at `key`, or `undefined` if not found. By default unwraps
         * scalar values from their surrounding node; to disable set `keepScalar` to
         * `true` (collections are always returned intact).
         */
        getIn(path: any, keepScalar: any): any;
        hasAllNullValues(allowScalar: any): any;
        /**
         * Checks if the collection includes a value with the key `key`.
         */
        hasIn(path: any): any;
        /**
         * Sets a value in this collection. For `!!set`, `value` needs to be a
         * boolean to add/remove the item from the set.
         */
        setIn(path: any, value: any): void;
        /** A plain JavaScript representation of this node. */
        toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
    };
    readonly tagName: string;
    from(schema4: any, obj: any, ctx: any): {
        items: any[];
        add(value: any): void;
        /**
         * Removes a value from the collection.
         *
         * `key` must contain a representation of an integer for this to succeed.
         * It may be wrapped in a `Scalar`.
         *
         * @returns `true` if the item was found and removed.
         */
        delete(key: any): boolean;
        get(key: any, keepScalar: any): any;
        /**
         * Checks if the collection includes a value with the key `key`.
         *
         * `key` must contain a representation of an integer for this to succeed.
         * It may be wrapped in a `Scalar`.
         */
        has(key: any): boolean;
        /**
         * Sets a value in this collection. For `!!set`, `value` needs to be a
         * boolean to add/remove the item from the set.
         *
         * If `key` does not contain a representation of an integer, this will throw.
         * It may be wrapped in a `Scalar`.
         */
        set(key: any, value: any): void;
        toJSON(_: any, ctx: any): any[];
        toString(ctx: any, onComment: any, onChompKeep: any): any;
        /**
         * Create a copy of this collection.
         *
         * @param schema - If defined, overwrites the original's schema
         */
        clone(schema4: any): any;
        /**
         * Adds a value to the collection. For `!!map` and `!!omap` the value must
         * be a Pair instance or a `{ key, value }` object, which may not have a key
         * that already exists in the map.
         */
        addIn(path: any, value: any): void;
        /**
         * Removes a value from the collection.
         * @returns `true` if the item was found and removed.
         */
        deleteIn(path: any): any;
        /**
         * Returns item at `key`, or `undefined` if not found. By default unwraps
         * scalar values from their surrounding node; to disable set `keepScalar` to
         * `true` (collections are always returned intact).
         */
        getIn(path: any, keepScalar: any): any;
        hasAllNullValues(allowScalar: any): any;
        /**
         * Checks if the collection includes a value with the key `key`.
         */
        hasIn(path: any): any;
        /**
         * Sets a value in this collection. For `!!set`, `value` needs to be a
         * boolean to add/remove the item from the set.
         */
        setIn(path: any, value: any): void;
        /** A plain JavaScript representation of this node. */
        toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
    };
};
export var YAMLWarning: {
    new (pos: any, code: any, message: any): {
        name: any;
        code: any;
        message: any;
        pos: any;
        stack?: string;
        cause?: unknown;
    };
    captureStackTrace(targetObject: object, constructorOpt?: Function): void;
    prepareStackTrace(err: Error, stackTraces: NodeJS.CallSite[]): any;
    stackTraceLimit: number;
};
declare var index_default: {};
export function isAlias(node: any): boolean;
export function isCollection(node: any): boolean;
export function isDocument(node: any): boolean;
export function isMap(node: any): boolean;
export function isNode(node: any): boolean;
export function isPair(node: any): boolean;
export function isScalar(node: any): boolean;
export function isSeq(node: any): boolean;
export function parse(src: any, reviver: any, options: any): any;
export function parseAllDocuments(source: any, options?: {}): {
    commentBefore: any;
    comment: any;
    errors: any[];
    warnings: any[];
    options: any;
    directives: any;
    contents: any;
    /**
     * Create a deep copy of this Document and its contents.
     *
     * Custom Node values that inherit from `Object` still refer to their original instances.
     */
    clone(): any;
    /** Adds a value to the document. */
    add(value: any): void;
    /** Adds a value to the document. */
    addIn(path: any, value: any): void;
    /**
     * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
     *
     * If `node` already has an anchor, `name` is ignored.
     * Otherwise, the `node.anchor` value will be set to `name`,
     * or if an anchor with that name is already present in the document,
     * `name` will be used as a prefix for a new unique anchor.
     * If `name` is undefined, the generated anchor will use 'a' as a prefix.
     */
    createAlias(node: any, name: any): {
        source: any;
        /**
         * Resolve the value of this alias within `doc`, finding the last
         * instance of the `source` anchor before this node.
         */
        resolve(doc: any, ctx: any): any;
        toJSON(_arg: any, ctx: any): any;
        toString(ctx: any, _onComment: any, _onChompKeep: any): string;
        /** Create a copy of this node.  */
        clone(): any;
        /** A plain JavaScript representation of this node. */
        toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
    };
    createNode(value: any, replacer: any, options: any): any;
    /**
     * Convert a key and a value into a `Pair` using the current schema,
     * recursively wrapping all values as `Scalar` or `Collection` nodes.
     */
    createPair(key: any, value: any, options?: {}): {
        key: any;
        value: any;
        clone(schema4: any): any;
        toJSON(_: any, ctx: any): any;
        toString(ctx: any, onComment: any, onChompKeep: any): any;
    };
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    delete(key: any): any;
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    deleteIn(path: any): any;
    /**
     * Returns item at `key`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    get(key: any, keepScalar: any): any;
    /**
     * Returns item at `path`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    getIn(path: any, keepScalar: any): any;
    /**
     * Checks if the document includes a value with the key `key`.
     */
    has(key: any): any;
    /**
     * Checks if the document includes a value at `path`.
     */
    hasIn(path: any): any;
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    set(key: any, value: any): void;
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    setIn(path: any, value: any): void;
    /**
     * Change the YAML version and schema used by the document.
     * A `null` version disables support for directives, explicit tags, anchors, and aliases.
     * It also requires the `schema` option to be given as a `Schema` instance value.
     *
     * Overrides all previously set schema options.
     */
    setSchema(version: any, options?: {}): void;
    schema: any;
    toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver }?: {
        json: any;
        jsonArg: any;
        mapAsMap: any;
        maxAliasCount: any;
        onAnchor: any;
        reviver: any;
    }): any;
    /**
     * A JSON representation of the document `contents`.
     *
     * @param jsonArg Used by `JSON.stringify` to indicate the array index or
     *   property name.
     */
    toJSON(jsonArg: any, onAnchor: any): any;
    /** A YAML representation of the document. */
    toString(options?: {}): string;
}[] | (any[] & {
    empty: boolean;
} & {
    comment: string;
    directives: {
        docStart: any;
        docEnd: boolean;
        yaml: any;
        tags: any;
        clone(): any;
        /**
         * During parsing, get a Directives instance for the current document and
         * update the stream state according to the current version's spec.
         */
        atDocument(): any;
        atNextDocument: boolean;
        /**
         * @param onError - May be called even if the action was successful
         * @returns `true` on success
         */
        add(line: any, onError: any): boolean;
        /**
         * Resolves a tag, matching handles to those defined in %TAG directives.
         *
         * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
         *   `'!local'` tag, or `null` if unresolvable.
         */
        tagName(source: any, onError: any): any;
        /**
         * Given a fully resolved tag, returns its printable string form,
         * taking into account current tag prefixes and defaults.
         */
        tagString(tag: any): any;
        toString(doc: any): string;
    };
    errors: any[];
    warnings: any[];
});
export function parseDocument(source: any, options?: {}): {
    commentBefore: any;
    comment: any;
    errors: any[];
    warnings: any[];
    options: any;
    directives: any;
    contents: any;
    /**
     * Create a deep copy of this Document and its contents.
     *
     * Custom Node values that inherit from `Object` still refer to their original instances.
     */
    clone(): any;
    /** Adds a value to the document. */
    add(value: any): void;
    /** Adds a value to the document. */
    addIn(path: any, value: any): void;
    /**
     * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
     *
     * If `node` already has an anchor, `name` is ignored.
     * Otherwise, the `node.anchor` value will be set to `name`,
     * or if an anchor with that name is already present in the document,
     * `name` will be used as a prefix for a new unique anchor.
     * If `name` is undefined, the generated anchor will use 'a' as a prefix.
     */
    createAlias(node: any, name: any): {
        source: any;
        /**
         * Resolve the value of this alias within `doc`, finding the last
         * instance of the `source` anchor before this node.
         */
        resolve(doc: any, ctx: any): any;
        toJSON(_arg: any, ctx: any): any;
        toString(ctx: any, _onComment: any, _onChompKeep: any): string;
        /** Create a copy of this node.  */
        clone(): any;
        /** A plain JavaScript representation of this node. */
        toJS(doc: any, { mapAsMap, maxAliasCount, onAnchor, reviver }?: {
            mapAsMap: any;
            maxAliasCount: any;
            onAnchor: any;
            reviver: any;
        }): any;
    };
    createNode(value: any, replacer: any, options: any): any;
    /**
     * Convert a key and a value into a `Pair` using the current schema,
     * recursively wrapping all values as `Scalar` or `Collection` nodes.
     */
    createPair(key: any, value: any, options?: {}): {
        key: any;
        value: any;
        clone(schema4: any): any;
        toJSON(_: any, ctx: any): any;
        toString(ctx: any, onComment: any, onChompKeep: any): any;
    };
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    delete(key: any): any;
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    deleteIn(path: any): any;
    /**
     * Returns item at `key`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    get(key: any, keepScalar: any): any;
    /**
     * Returns item at `path`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    getIn(path: any, keepScalar: any): any;
    /**
     * Checks if the document includes a value with the key `key`.
     */
    has(key: any): any;
    /**
     * Checks if the document includes a value at `path`.
     */
    hasIn(path: any): any;
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    set(key: any, value: any): void;
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    setIn(path: any, value: any): void;
    /**
     * Change the YAML version and schema used by the document.
     * A `null` version disables support for directives, explicit tags, anchors, and aliases.
     * It also requires the `schema` option to be given as a `Schema` instance value.
     *
     * Overrides all previously set schema options.
     */
    setSchema(version: any, options?: {}): void;
    schema: any;
    toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver }?: {
        json: any;
        jsonArg: any;
        mapAsMap: any;
        maxAliasCount: any;
        onAnchor: any;
        reviver: any;
    }): any;
    /**
     * A JSON representation of the document `contents`.
     *
     * @param jsonArg Used by `JSON.stringify` to indicate the array index or
     *   property name.
     */
    toJSON(jsonArg: any, onAnchor: any): any;
    /** A YAML representation of the document. */
    toString(options?: {}): string;
};
declare function stringify3(value: any, replacer: any, options: any): any;
export function visit(node: any, visitor: any): void;
export namespace visit {
    export { BREAK };
    export { SKIP };
    export { REMOVE };
}
export function visitAsync(node: any, visitor: any): Promise<void>;
export namespace visitAsync {
    export { BREAK };
    export { SKIP };
    export { REMOVE };
}
declare var BREAK: symbol;
declare var SKIP: symbol;
declare var REMOVE: symbol;
export { cst_exports as CST, index_default as default, stringify3 as stringify };
