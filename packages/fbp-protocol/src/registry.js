/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module registry
 * @description Component registry and code management codecs (work document
 *   #4 §6): the Two-Step Cache handshake (`0x20`–`0x24`), atomic full-source
 *   writes (`0x25`), and dynamic library install requests (`0x27`).
 *
 *   Component kinds and port fields are the shared vocabulary of the
 *   publish-time manifests (work document #25): the kind is declared data —
 *   never inferred — and a wire signature, a manifest signature, and a
 *   sidecar signature are the same data. `sig_hash` values are SHA-256 over
 *   the canonical signature serialization defined here, so a client can
 *   match a catalog manifest against a runtime advertisement without
 *   fetching details.
 */

import { MsgPack } from "@reticulum/core";
import {
  CMD_COMP_DETAIL_REQ,
  CMD_COMP_DETAIL_RES,
  CMD_COMP_INSTALL_REQ,
  CMD_COMP_MANIFEST,
  CMD_COMP_SYNC_REQ,
  CMD_COMP_WRITE,
  COMPONENT_TYPE,
} from "./constants.js";
import { ProtocolError } from "./errors.js";

/**
 * A port in a component signature. Wire field names follow the FBP runtime
 * protocol convention (`id`); the publish-time manifest's `name` field
 * (work document #25) maps onto it. `type` is the port datatype; the
 * optional fields are omitted from the wire when absent to save airtime.
 *
 * @typedef {object} PortInfo
 * @property {string} id Port name.
 * @property {string} type Port datatype.
 * @property {boolean} [addressable] Whether the port is an addressable array port.
 * @property {string} [description] Longer textual description of the port.
 * @property {boolean} [required] Whether the port must be connected.
 * @property {boolean} [control] Control-port identification (inports only, noflo-ui WD #40).
 */

/**
 * A component definition as answered by `0x24 CMD_COMP_DETAIL_RES`: the
 * declared component kind plus the full signature, shareable before any
 * implementation exists (stubs are valid state).
 *
 * @typedef {object} ComponentDetail
 * @property {string} type One of {@link COMPONENT_TYPE}.
 * @property {PortInfo[]} in Inports.
 * @property {PortInfo[]} out Outports.
 */

/**
 * A manifest entry for one component: the `sig_hash` of its canonical
 * signature plus the declared component kind (work document #4 updates #9
 * and #11). On the wire the entry is the positional tuple
 * `[sig_hash, kind]`; the kind is the shared vocabulary of
 * {@link COMPONENT_TYPE} — declared data, never inferred.
 *
 * @typedef {object} ManifestEntry
 * @property {string} sigHash SHA-256 hex digest of the canonical signature.
 * @property {string} type One of {@link COMPONENT_TYPE}.
 */

/**
 * Registry manifest entries: component name → {@link ManifestEntry}.
 *
 * @typedef {Record<string, ManifestEntry>} ManifestEntries
 */

/**
 * Component definitions keyed by library-namespaced name.
 *
 * @typedef {Record<string, ComponentDetail>} ComponentDetails
 */

/**
 * Encode a `0x20 CMD_COMP_SYNC_REQ`: `[0x20, local_registry_hash]`.
 *
 * @param {string} localRegistryHash Hash of the client's known registry state.
 * @returns {Uint8Array}
 */
export function encodeCompSyncReq(localRegistryHash) {
  assertHash(localRegistryHash, CMD_COMP_SYNC_REQ, "local_registry_hash");
  return MsgPack.encode([CMD_COMP_SYNC_REQ, localRegistryHash]);
}

/**
 * Decode a `0x20 CMD_COMP_SYNC_REQ`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, localRegistryHash: string }}
 */
export function decodeCompSyncReq(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_COMP_SYNC_REQ, 2);
  assertHash(frame[1], CMD_COMP_SYNC_REQ, "local_registry_hash");
  return { cmd: CMD_COMP_SYNC_REQ, localRegistryHash: frame[1] };
}

/**
 * Encode a `0x22 CMD_COMP_MANIFEST`:
 * `[0x22, new_registry_hash, { "math/Add": ["sig_hash_1", "elementary"], ... }]`.
 * Entries are valid with a signature and no source; each entry travels as
 * the positional `[sig_hash, kind]` tuple so the declared component kind
 * reaches clients without a details round-trip (work document #4 updates
 * #9 and #11).
 *
 * @param {string} newRegistryHash
 * @param {ManifestEntries} entries Component name → {@link ManifestEntry}.
 * @returns {Uint8Array}
 */
export function encodeCompManifest(newRegistryHash, entries) {
  assertHash(newRegistryHash, CMD_COMP_MANIFEST, "new_registry_hash");
  assertEntries(entries);
  /** @type {Record<string, [string, string]>} */
  const wire = {};
  for (const [name, entry] of Object.entries(entries)) {
    wire[name] = [entry.sigHash, entry.type];
  }
  return MsgPack.encode([CMD_COMP_MANIFEST, newRegistryHash, wire]);
}

/**
 * Decode a `0x22 CMD_COMP_MANIFEST`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, newRegistryHash: string, entries: ManifestEntries }}
 */
export function decodeCompManifest(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_COMP_MANIFEST, 3);
  assertHash(frame[1], CMD_COMP_MANIFEST, "new_registry_hash");
  assertWireEntries(frame[2]);
  /** @type {ManifestEntries} */
  const entries = {};
  for (const [name, [sigHash, type]] of Object.entries(frame[2])) {
    entries[name] = { sigHash, type };
  }
  return {
    cmd: CMD_COMP_MANIFEST,
    newRegistryHash: frame[1],
    entries,
  };
}

/**
 * Encode a `0x23 CMD_COMP_DETAIL_REQ`: `[0x23, names]` — the client requests
 * only the definitions it does not already know.
 *
 * @param {string[]} names Library-namespaced component names.
 * @returns {Uint8Array}
 */
export function encodeCompDetailReq(names) {
  assertNames(names);
  return MsgPack.encode([CMD_COMP_DETAIL_REQ, names]);
}

/**
 * Decode a `0x23 CMD_COMP_DETAIL_REQ`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, names: string[] }}
 */
export function decodeCompDetailReq(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_COMP_DETAIL_REQ, 2);
  assertNames(frame[1]);
  return { cmd: CMD_COMP_DETAIL_REQ, names: [...frame[1]] };
}

/**
 * Encode a `0x24 CMD_COMP_DETAIL_RES`: `[0x24, components]`. Succeeds for
 * stubs — the signature is shareable before implementation exists.
 *
 * @param {ComponentDetails} components
 * @returns {Uint8Array}
 */
export function encodeCompDetailRes(components) {
  assertDetails(components);
  return MsgPack.encode([CMD_COMP_DETAIL_RES, components]);
}

/**
 * Decode a `0x24 CMD_COMP_DETAIL_RES`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, components: ComponentDetails }}
 */
export function decodeCompDetailRes(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_COMP_DETAIL_RES, 2);
  assertDetails(frame[1]);
  return { cmd: CMD_COMP_DETAIL_RES, components: frame[1] };
}

/**
 * Encode a `0x25 CMD_COMP_WRITE`:
 * `[0x25, component_name, source]` — an atomic full-source update. For
 * sources over 500 bytes, clients SHOULD pass a Reticulum Resource hash
 * instead of a raw string.
 *
 * @param {string} componentName Library-namespaced component name.
 * @param {string} source Full source string or RNS resource hash.
 * @returns {Uint8Array}
 */
export function encodeCompWrite(componentName, source) {
  assertName(componentName, CMD_COMP_WRITE, "component_name");
  if (typeof source !== "string" || source.length === 0) {
    throw new ProtocolError(
      "source must be a non-empty string",
      CMD_COMP_WRITE,
    );
  }
  return MsgPack.encode([CMD_COMP_WRITE, componentName, source]);
}

/**
 * Decode a `0x25 CMD_COMP_WRITE`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, componentName: string, source: string }}
 */
export function decodeCompWrite(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_COMP_WRITE, 3);
  assertName(frame[1], CMD_COMP_WRITE, "component_name");
  if (typeof frame[2] !== "string" || frame[2].length === 0) {
    throw new ProtocolError(
      "source must be a non-empty string",
      CMD_COMP_WRITE,
    );
  }
  return { cmd: CMD_COMP_WRITE, componentName: frame[1], source: frame[2] };
}

/**
 * Encode a `0x27 CMD_COMP_INSTALL_REQ`: `[0x27, package_uri]` — dynamic ES
 * module injection via HTTP, npm, or RNS. With the ecosystem catalog (work
 * document #26) the URI resolves through the catalog's provenance fields.
 *
 * @param {string} packageUri
 * @returns {Uint8Array}
 */
export function encodeCompInstallReq(packageUri) {
  if (typeof packageUri !== "string" || packageUri.length === 0) {
    throw new ProtocolError(
      "package_uri must be a non-empty string",
      CMD_COMP_INSTALL_REQ,
    );
  }
  return MsgPack.encode([CMD_COMP_INSTALL_REQ, packageUri]);
}

/**
 * Decode a `0x27 CMD_COMP_INSTALL_REQ`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, packageUri: string }}
 */
export function decodeCompInstallReq(bytes) {
  const frame = MsgPack.decode(bytes);
  expectFrame(frame, CMD_COMP_INSTALL_REQ, 2);
  if (typeof frame[1] !== "string" || frame[1].length === 0) {
    throw new ProtocolError(
      "package_uri must be a non-empty string",
      CMD_COMP_INSTALL_REQ,
    );
  }
  return { cmd: CMD_COMP_INSTALL_REQ, packageUri: frame[1] };
}

/**
 * Serialize a component signature canonically: sorted-key JSON over the
 * kind and the full port field set. This is the byte-stable substrate the
 * `sig_hash` is computed over; it must stay aligned with the canonical
 * serialization owned by noflo-ui #43 — a change here is protocol-visible.
 *
 * @param {ComponentDetail} signature
 * @returns {string}
 */
export function canonicalSignature(signature) {
  assertDetail(signature, null);
  return stableStringify({
    type: signature.type,
    in: signature.in.map(portJson),
    out: signature.out.map(portJson),
  });
}

/**
 * Compute the `sig_hash` of a component signature: SHA-256 (hex) over
 * {@link canonicalSignature}. Async because WebCrypto is; available on
 * every runtime the protocol targets.
 *
 * @param {ComponentDetail} signature
 * @returns {Promise<string>}
 */
export async function sigHash(signature) {
  const bytes = new TextEncoder().encode(canonicalSignature(signature));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Render a port as a plain JSON object with sorted keys, dropping absent
 * optional fields so the canonical form is minimal and stable.
 *
 * @param {PortInfo} port
 * @returns {Record<string, any>}
 */
function portJson(port) {
  /** @type {Record<string, any>} */
  const json = { id: port.id, type: port.type };
  if (port.addressable !== undefined) json.addressable = port.addressable;
  if (port.description !== undefined) json.description = port.description;
  if (port.required !== undefined) json.required = port.required;
  if (port.control !== undefined) json.control = port.control;
  return json;
}

/**
 * Deterministic JSON: object keys sorted, arrays in order, no whitespace.
 * Only JSON-safe values reach it (signatures are strings, booleans, and
 * numbers).
 *
 * @param {any} value
 * @returns {string}
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * @param {any} frame
 * @param {number} opcode
 * @param {number} arity
 * @returns {void}
 */
function expectFrame(frame, opcode, arity) {
  if (!Array.isArray(frame) || frame[0] !== opcode) {
    throw new ProtocolError("unexpected frame opcode", opcode);
  }
  if (frame.length !== arity) {
    throw new ProtocolError(
      `frame must carry exactly ${arity} elements`,
      opcode,
    );
  }
}

/**
 * @param {string} hash
 * @param {number} opcode
 * @param {string} field
 * @returns {void}
 */
function assertHash(hash, opcode, field) {
  if (typeof hash !== "string" || hash.length === 0) {
    throw new ProtocolError(`${field} must be a non-empty string`, opcode);
  }
}

/**
 * @param {string} name
 * @param {number} opcode
 * @param {string} field
 * @returns {void}
 */
function assertName(name, opcode, field) {
  if (typeof name !== "string" || name.length === 0) {
    throw new ProtocolError(`${field} must be a non-empty string`, opcode);
  }
}

/**
 * @param {string[]} names
 * @returns {void}
 */
function assertNames(names) {
  if (!Array.isArray(names)) {
    throw new ProtocolError(
      "component names must be an array",
      CMD_COMP_DETAIL_REQ,
    );
  }
  for (const name of names) {
    assertName(name, CMD_COMP_DETAIL_REQ, "component name");
  }
}

/**
 * @param {ManifestEntries} entries
 * @returns {void}
 */
function assertEntries(entries) {
  if (
    entries === null ||
    typeof entries !== "object" ||
    Array.isArray(entries)
  ) {
    throw new ProtocolError(
      "manifest entries must be a map of component name to manifest entry",
      CMD_COMP_MANIFEST,
    );
  }
  for (const [name, entry] of Object.entries(entries)) {
    assertName(name, CMD_COMP_MANIFEST, "component name");
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ProtocolError(
        `manifest entry for ${name} must be a map with sigHash and type`,
        CMD_COMP_MANIFEST,
      );
    }
    assertHash(entry.sigHash, CMD_COMP_MANIFEST, "sig_hash");
    if (!Object.values(COMPONENT_TYPE).includes(entry.type)) {
      throw new ProtocolError(
        `manifest entry for ${name} must declare a component kind from the shared vocabulary`,
        CMD_COMP_MANIFEST,
      );
    }
  }
}

/**
 * @param {Record<string, any>} entries Raw wire entries: name → [sig_hash, kind].
 * @returns {void}
 */
function assertWireEntries(entries) {
  if (
    entries === null ||
    typeof entries !== "object" ||
    Array.isArray(entries)
  ) {
    throw new ProtocolError(
      "manifest entries must be a map of component name to [sig_hash, kind] tuple",
      CMD_COMP_MANIFEST,
    );
  }
  for (const [name, tuple] of Object.entries(entries)) {
    assertName(name, CMD_COMP_MANIFEST, "component name");
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 2 ||
      typeof tuple[0] !== "string" ||
      tuple[0].length === 0 ||
      !Object.values(COMPONENT_TYPE).includes(tuple[1])
    ) {
      throw new ProtocolError(
        `manifest entry for ${name} must be a [sig_hash, kind] tuple carrying a declared component kind`,
        CMD_COMP_MANIFEST,
      );
    }
  }
}

/**
 * @param {ComponentDetails} components
 * @returns {void}
 */
function assertDetails(components) {
  if (
    components === null ||
    typeof components !== "object" ||
    Array.isArray(components)
  ) {
    throw new ProtocolError(
      "component details must be a map of component name to definition",
      CMD_COMP_DETAIL_RES,
    );
  }
  for (const [name, detail] of Object.entries(components)) {
    assertName(name, CMD_COMP_DETAIL_RES, "component name");
    assertDetail(detail, name);
  }
}

/**
 * @param {ComponentDetail} detail
 * @param {string|null} name Component name for error context, when known.
 * @returns {void}
 */
function assertDetail(detail, name) {
  const where = name === null ? "component detail" : `component ${name}`;
  if (detail === null || typeof detail !== "object" || Array.isArray(detail)) {
    throw new ProtocolError(`${where} must be a map`, CMD_COMP_DETAIL_RES);
  }
  if (!Object.values(COMPONENT_TYPE).includes(detail.type)) {
    throw new ProtocolError(
      `${where} must declare a component kind from the shared vocabulary`,
      CMD_COMP_DETAIL_RES,
    );
  }
  for (const side of ["in", "out"]) {
    if (!Array.isArray(detail[side])) {
      throw new ProtocolError(
        `${where} must declare its ${side}ports as an array`,
        CMD_COMP_DETAIL_RES,
      );
    }
    for (const port of detail[side]) {
      assertPort(port, where, side);
    }
  }
}

/**
 * @param {PortInfo} port
 * @param {string} where
 * @param {string} side
 * @returns {void}
 */
function assertPort(port, where, side) {
  if (port === null || typeof port !== "object" || Array.isArray(port)) {
    throw new ProtocolError(
      `${where} ${side}port must be a map`,
      CMD_COMP_DETAIL_RES,
    );
  }
  if (typeof port.id !== "string" || port.id.length === 0) {
    throw new ProtocolError(
      `${where} ${side}port must carry a non-empty id`,
      CMD_COMP_DETAIL_RES,
    );
  }
  if (typeof port.type !== "string" || port.type.length === 0) {
    throw new ProtocolError(
      `${where} ${side}port ${port.id} must carry a datatype`,
      CMD_COMP_DETAIL_RES,
    );
  }
  for (const flag of ["addressable", "required", "control"]) {
    if (port[flag] !== undefined && typeof port[flag] !== "boolean") {
      throw new ProtocolError(
        `${where} ${side}port ${port.id} ${flag} must be a boolean`,
        CMD_COMP_DETAIL_RES,
      );
    }
  }
}
