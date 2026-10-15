//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @module schema-identity
 * @description Identity and canonicalization for schema artifacts (work
 *   document #37 §2). A schema artifact is a JSON Schema 2020-12 document
 *   with a durable namespaced id (`ns/name`); revisions are pinned by a
 *   SHA-256 content digest over RFC 8785 (JCS) canonicalization of the
 *   document with `$id` normalized to the bare `ns/name` (or omitted for
 *   anonymous entries). Published references carry digests
 *   (`urn:noflo:ns/name@<digest>`), so every document's digest transitively
 *   covers everything it references — refs are Merkle edges.
 *
 *   Digests are never computed over MsgPack bytes: verification is
 *   decode → RFC 8785 canonicalize → SHA-256. MsgPack distinguishes `1`
 *   from `1.0` while JCS does not, so both decode to the same canonical
 *   form and the same digest.
 */

/* @ts-self-types="./schema-identity.d.ts" */

/**
 * URN prefix for published schema references. The `urn:noflo:` namespace is
 * unregistered — a conscious deviation recorded in work document #37 §1.
 *
 * @type {string}
 */
export const SCHEMA_URN_PREFIX = "urn:noflo:";

/**
 * Number of hex characters in a SHA-256 digest.
 *
 * @type {number}
 */
export const SCHEMA_DIGEST_HEX_LENGTH = 64;

/**
 * A parsed schema reference.
 *
 * @typedef {object} ParsedSchemaRef
 * @property {string} id The bare `ns/name` id.
 * @property {string|null} digest SHA-256 hex digest, when the reference
 *   carries one (published form). Authoring sugar references are digest-less.
 * @property {string|null} fragment JSON Pointer fragment (`#/$defs/name`),
 *   when the reference targets a `$defs` entry.
 */

/**
 * Validate a bare schema id: `ns/name`, lowercase namespace segment, one
 * slash, no URL/URN/MIME sugar. Ids are durable across versions; revisions
 * are pinned by content digest, not by id changes.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isValidSchemaId(id) {
  return (
    typeof id === "string" &&
    /^[a-z][a-z0-9_-]*\/[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(id)
  );
}

/**
 * Parse a schema reference in any accepted form: authoring sugar
 * (`ns/name`, optionally with a `#/$defs/…` fragment), the digest-pinned
 * form (`ns/name@<digest>`), or the published absolute URN form
 * (`urn:noflo:ns/name@<digest>`). Anything else — URLs, MIME types, opaque
 * strings — is rejected: URL-based schema resolution is dead (work
 * document #37 §3.5).
 *
 * @param {string} ref
 * @returns {ParsedSchemaRef}
 * @throws {TypeError} When the reference is not an accepted form.
 */
export function parseSchemaRef(ref) {
  if (typeof ref !== "string" || ref.length === 0) {
    throw new TypeError("schema reference must be a non-empty string");
  }
  let rest = ref;
  if (rest.startsWith(SCHEMA_URN_PREFIX)) {
    rest = rest.slice(SCHEMA_URN_PREFIX.length);
  } else if (ref.includes("://") || ref.startsWith("urn:")) {
    throw new TypeError(
      `unsupported schema reference '${ref}': only ns/name authoring sugar and urn:noflo:… published form are accepted`,
    );
  }
  const hashIndex = rest.indexOf("#");
  const fragment = hashIndex === -1 ? null : rest.slice(hashIndex + 1);
  if (hashIndex !== -1) rest = rest.slice(0, hashIndex);
  const atSign = rest.lastIndexOf("@");
  let digest = null;
  if (atSign !== -1) {
    digest = rest.slice(atSign + 1);
    rest = rest.slice(0, atSign);
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new TypeError(
        `schema reference '${ref}' carries a malformed digest`,
      );
    }
  }
  if (!isValidSchemaId(rest)) {
    throw new TypeError(`schema reference '${ref}' is not a valid ns/name id`);
  }
  if (fragment !== null && !fragment.startsWith("/")) {
    throw new TypeError(
      `schema reference '${ref}' carries a non-JSON-Pointer fragment`,
    );
  }
  return { id: rest, digest, fragment };
}

/**
 * Serialize the published absolute URN form of a schema reference.
 *
 * @param {string} id Bare `ns/name` id.
 * @param {string} digest SHA-256 hex digest.
 * @param {string|null} [fragment] Optional JSON Pointer fragment.
 * @returns {string}
 */
export function schemaUrn(id, digest, fragment = null) {
  if (!isValidSchemaId(id)) {
    throw new TypeError(`'${id}' is not a valid ns/name id`);
  }
  if (
    typeof digest !== "string" ||
    digest.length !== SCHEMA_DIGEST_HEX_LENGTH
  ) {
    throw new TypeError("schema digest must be a 64-character hex string");
  }
  return `${SCHEMA_URN_PREFIX}${id}@${digest}${fragment === null ? "" : `#${fragment}`}`;
}

/**
 * Normalize a schema body for digesting: the `$id` is reduced to the bare
 * `ns/name` (authoring sugar and published URN forms both normalize to the
 * same bytes), or removed entirely for anonymous entries. The input is not
 * mutated.
 *
 * @param {Record<string, any>} body
 * @returns {Record<string, any>} Shallow-normalized copy with a canonical `$id`.
 * @throws {TypeError} When the body is not an object or carries an unsupported `$id`.
 */
export function normalizeSchemaBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("schema body must be an object");
  }
  if (body.$id === undefined) {
    return { ...body };
  }
  if (typeof body.$id !== "string") {
    throw new TypeError("schema $id must be a string");
  }
  const parsed = parseSchemaRef(body.$id);
  if (parsed.digest !== null || parsed.fragment !== null) {
    throw new TypeError(
      `schema $id '${body.$id}' must be a bare ns/name id: a document cannot name a revision of itself`,
    );
  }
  return { ...body, $id: parsed.id };
}

/**
 * Compute the content digest of a schema body: SHA-256 (hex) over the RFC
 * 8785 canonicalization of the normalized body. Async because WebCrypto is;
 * available on every runtime the protocol targets.
 *
 * @param {Record<string, any>} body
 * @returns {Promise<string>} SHA-256 hex digest.
 */
export async function digestSchema(body) {
  const canonical = canonicalizeJson(normalizeSchemaBody(body));
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Collect every cross-document `$ref` in a schema body. Same-document
 * recursion (`#/…`) is fine — a Merkle DAG cannot contain cycles, but it
 * may recurse within one document — so only refs naming another artifact
 * are collected.
 *
 * @param {Record<string, any>} body
 * @returns {string[]} Reference strings in document order, deduplicated.
 */
export function collectSchemaRefs(body) {
  /** @type {string[]} */
  const refs = [];
  /** @type {Set<string>} */
  const seen = new Set();
  walk(body, (value) => {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof value.$ref === "string" &&
      !value.$ref.startsWith("#")
    ) {
      if (!seen.has(value.$ref)) {
        seen.add(value.$ref);
        refs.push(value.$ref);
      }
    }
  });
  return refs;
}

/**
 * Rewrite every cross-document `$ref` in a body into the published absolute
 * URN form, resolving digests through the given resolver. The document's
 * own `$id` stays the bare `ns/name`: a body cannot name a revision of
 * itself, and the digest normalization treats bare and published forms
 * identically. The input is not mutated.
 *
 * @param {Record<string, any>} body
 * @param {(ref: string) => Promise<string|null>} resolveDigest Authoring-sugar
 *   reference → SHA-256 hex digest of the target body, or null when unknown.
 * @returns {Promise<Record<string, any>>} Pinned copy.
 * @throws {Error} When a reference resolves to no digest: the publish gate
 *   rejects dangling references instead of shipping them.
 */
export async function pinSchemaRefs(body, resolveDigest) {
  const refs = collectSchemaRefs(body);
  /** @type {Map<string, string>} */
  const pinned = new Map();
  for (const ref of refs) {
    const digest = await resolveDigest(ref);
    if (digest === null || digest === undefined) {
      throw new Error(`unresolvable schema reference '${ref}'`);
    }
    pinned.set(ref, digest);
  }
  /** @type {(value: any) => any} */
  const walkPinned = (value) => {
    if (Array.isArray(value)) return value.map(walkPinned);
    if (value !== null && typeof value === "object") {
      /** @type {Record<string, any>} */
      const out = {};
      for (const [key, entry] of Object.entries(value)) {
        if (
          key === "$ref" &&
          typeof entry === "string" &&
          !entry.startsWith("#") &&
          pinned.has(entry)
        ) {
          const parsed = parseSchemaRef(entry);
          out[key] = schemaUrn(
            parsed.id,
            /** @type {string} */ (pinned.get(entry)),
            parsed.fragment,
          );
          continue;
        }
        out[key] = walkPinned(entry);
      }
      return out;
    }
    return value;
  };
  return /** @type {Record<string, any>} */ (walkPinned(body));
}

/**
 * Detect cross-document `$ref` cycles among a set of schema bodies.
 * Same-document recursion is excluded — refs starting with `#` never leave
 * their document. Returns the offending cycle as an ordered list of ids, or
 * null when the set is acyclic.
 *
 * @param {Array<{ id: string, body: Record<string, any> }>} documents
 * @returns {string[]|null} Cycle path (first id repeated at the end), or null.
 */
export function detectRefCycles(documents) {
  /** @type {Map<string, Set<string>>} */
  const edges = new Map();
  for (const { id, body } of documents) {
    const targets = new Set(
      collectSchemaRefs(body)
        .map((ref) => parseSchemaRef(ref).id)
        .filter((target) => target !== id),
    );
    edges.set(id, targets);
  }
  // Three-color DFS: an edge to a gray (on-stack) node is a cycle, and
  // black nodes are proven acyclic and never rewalked — linear in the
  // reference graph, unlike a per-root restart
  /** @type {Map<string, number>} */
  const color = new Map();
  const GRAY = 1;
  const BLACK = 2;
  for (const start of edges.keys()) {
    if (color.get(start) === BLACK) continue;
    /** @type {string[]} */
    const path = [start];
    color.set(start, GRAY);
    /** @type {Array<[string, string[]]>} */
    const stack = [[start, [...(edges.get(start) ?? [])]]];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const [current, targets] = top;
      const next = targets.pop();
      if (next === undefined) {
        color.set(current, BLACK);
        stack.pop();
        path.pop();
        continue;
      }
      const nextColor = color.get(next) ?? 0;
      if (nextColor === GRAY) {
        return [...path.slice(path.indexOf(next)), next];
      }
      if (nextColor === BLACK) continue;
      color.set(next, GRAY);
      path.push(next);
      stack.push([next, [...(edges.get(next) ?? [])]]);
    }
  }
  return null;
}

/**
 * RFC 8785 (JSON Canonicalization Scheme) canonicalization: object keys in
 * UTF-16 code-unit order, no whitespace, ECMAScript number formatting,
 * minimal string escaping, UTF-8 output. I-JSON constraints apply: numbers
 * must be IEEE-754 doubles and strings must not carry lone surrogates.
 *
 * @param {any} value
 * @returns {string} Canonical JSON text.
 * @throws {TypeError} On non-I-JSON input (non-finite numbers, lone surrogates).
 */
export function canonicalizeJson(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  if (typeof value === "object") {
    // Keys sort by UTF-16 code-unit order — the JavaScript default string
    // comparison, which is exactly the JCS rule
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${canonicalString(key)}:${canonicalizeJson(value[key])}`).join(",")}}`;
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return canonicalNumber(value);
    case "string":
      return canonicalString(value);
    default:
      throw new TypeError(
        "canonicalization requires JSON data: strings, numbers, booleans, null, arrays, objects",
      );
  }
}

/**
 * Serialize a number per ECMAScript Number::toString, the JCS rule.
 * `-0` serializes as `0`; non-finite numbers are an I-JSON violation.
 *
 * @param {number} value
 * @returns {string}
 */
function canonicalNumber(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError("non-finite numbers cannot be canonicalized");
  }
  return String(value);
}

/**
 * Serialize a string with the JCS escape set: the two mandatory JSON
 * escapes, the short forms for the C0 controls that have them, `\u00xx`
 * (lowercase hex) for the rest of the control range, and every other code
 * point literal. Lone surrogates are an I-JSON violation.
 *
 * @param {string} value
 * @returns {string}
 */
function canonicalString(value) {
  for (const char of value) {
    const code = /** @type {number} */ (char.codePointAt(0));
    if (code >= 0xd800 && code <= 0xdfff) {
      throw new TypeError(
        "strings carrying lone surrogates cannot be canonicalized",
      );
    }
  }
  return JSON.stringify(value);
}

/**
 * Depth-first walk over every JSON value in a document.
 *
 * @param {any} value
 * @param {(value: any) => void} visit
 * @returns {void}
 */
function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, visit);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) walk(entry, visit);
  }
}
