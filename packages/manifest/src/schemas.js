//     @noflo/manifest - Publish-time component manifest generator
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @module schemas
 * @description The schema-set machinery for the publish-time manifest
 *   generator (work document #37 phase 1): reading a package's `schemas/`
 *   directory, pinning references into absolute URN form, computing
 *   `implements` closures, hoisting inline anonymous port schemas into
 *   content-addressed entries, projecting in-band guards, and enforcing
 *   the publish gate — closure resolvability, namespace ownership,
 *   meta-schema identity, and guard–schema consistency.
 */

/* @ts-self-types="./schemas.d.ts" */

import fs from "node:fs";
import path from "node:path";
import {
  canonicalizeJson,
  collectSchemaRefs,
  detectRefCycles,
  digestSchema,
  metaSchemaDigest,
  parseSchemaRef,
  pinSchemaRefs,
  projectGuard,
  validateGuard,
} from "@noflo/fbp-protocol";

/**
 * Reserved namespace ids and their owning packages (work document #37 §4).
 * Ownership is recorded per package, not by a global authority: a third
 * party claiming a reserved namespace is a construction error, not a
 * runtime hazard.
 */
const RESERVED_NAMESPACES = {
  std: "@noflo/fbp-protocol",
  ui: "@noflo/fbp-protocol",
  runtime: "@noflo/fbp-protocol",
  noflo: "@noflo/fbp-protocol",
  assembly: "@noflo/assembly",
};

const META_SCHEMA_IDS = ["noflo/extension-vocabulary", "noflo/meta-catalog"];

/**
 * A schema body resolved within the package's own closure, ready for the
 * manifest table.
 *
 * @typedef {object} NamedSchema
 * @property {Record<string, any>} body The published (pinned, implements-embedded) body.
 * @property {string} digest SHA-256 hex digest over the published form.
 * @property {string} path In-package path, e.g. `schemas/canvas/point.json`.
 * @property {string[]} implements Computed interface-closure ids (bases only).
 */

/**
 * A hoisted anonymous schema: content-addressed, id-less.
 *
 * @typedef {object} AnonymousSchema
 * @property {Record<string, any>} body The published body (`$id` omitted).
 * @property {string} digest SHA-256 hex digest over the published form.
 * @property {string} path In-package path: `schemas/<digest>.json`.
 */

/**
 * A foreign schema referenced through the dependency closure: the
 * provider's published manifest pins the digest; the body resolves from
 * the provider's own `schemas/` directory when shipped.
 *
 * @typedef {object} ForeignSchema
 * @property {string} digest SHA-256 hex digest, as pinned by the provider.
 * @property {string|null} npm The providing package's npm name, when resolvable.
 * @property {Record<string, any>|null} body The provider's body, when shipped.
 */

/**
 * A foreign schema this package's ports actually reference: recorded in
 * the manifest's schemas table with its provider (work document #37 §4).
 *
 * @typedef {object} ReferencedForeign
 * @property {string} digest
 * @property {string|null} providedBy
 */

/**
 * The package's schema set: everything the generator may reference, with
 * the publish gate already applied.
 *
 * @typedef {object} SchemaSet
 * @property {Map<string, NamedSchema>} named Own schemas, keyed by id.
 * @property {Map<string, AnonymousSchema>} anonymous Hoisted anonymous schemas, keyed by digest.
 * @property {Map<string, ForeignSchema>} foreign Dependency-published schemas, keyed by id.
 * @property {Map<string, ReferencedForeign>} foreignReferenced Foreign ids referenced by this package's ports.
 * @property {string} npm The generating package's npm name.
 */

/**
 * A raw port schema marker as declared in component source: an authoring
 * sugar id string, an inline object, or a pre-pinned reference.
 *
 * @typedef {string|Record<string, any>|null|undefined} SchemaMarker
 */

/**
 * Build the package's schema set: read the `schemas/` directory, verify
 * the publish gate, resolve the foreign closure through the dependency
 * manifests, pin every cross-document reference into absolute URN form
 * (writing the published bytes back so the shipped documents are the
 * digested bytes), and compute the `implements` closure per schema.
 *
 * Publish gate (work document #37 §4, §11):
 * - every own document carries a valid named id, or ships digest-keyed as
 *   an anonymous entry
 * - reserved namespaces (`std`, `ui`, `runtime`, `noflo`, `assembly`) are
 *   rejected outside their owning packages
 * - a `$schema` URN naming a NoFlo meta-schema must match the shipped
 *   pinned artifact's digest; foreign meta-schema ids are rejected
 * - cross-document `$ref` cycles are rejected; same-document recursion is fine
 * - closed interfaces (`additionalProperties: false`) are rejected with the
 *   composition-safe alternative named
 * - every reference resolves within the closure, and a dependency's pinned
 *   digest matching its shipped body is verified here, at publish
 *
 * @param {string} baseDir
 * @param {{ npm: string }} identity
 * @returns {Promise<SchemaSet>}
 */
export async function buildSchemaSet(baseDir, identity) {
  /** @type {SchemaSet} */
  const schemaSet = {
    named: new Map(),
    anonymous: new Map(),
    foreign: new Map(),
    foreignReferenced: new Map(),
    npm: identity.npm,
  };

  // Pass 1: read every own document as authored
  /** @type {Array<{ id: string, body: Record<string, any>, path: string, filePath: string }>} */
  const pending = [];
  const schemasDir = path.join(baseDir, "schemas");
  if (fs.existsSync(schemasDir)) {
    for (const filePath of listJsonFiles(schemasDir)) {
      const rel = path.relative(baseDir, filePath).split(path.sep).join("/");
      const body = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const digest = path.basename(filePath, ".json");
      if (/^[0-9a-f]{64}$/.test(digest) && body.$id === undefined) {
        // Content-addressed anonymous entry: the file name is the key
        schemaSet.anonymous.set(digest, { body, digest, path: rel });
        continue;
      }
      if (typeof body.$id !== "string") {
        throw new Error(
          `Schema document '${rel}' carries no $id: named schemas are addressed as ns/name, anonymous ones ship digest-keyed as schemas/<digest>.json`,
        );
      }
      const id = parseSchemaRef(body.$id).id;
      assertNamespaceAvailable(id, identity.npm, rel);
      await verifyMetaSchemaUrn(body, rel);
      pending.push({ id, body, path: rel, filePath });
    }
  }

  // Pass 2: the cycle gate runs over the as-authored reference graph
  const cycle = detectRefCycles(pending.map(({ id, body }) => ({ id, body })));
  if (cycle) {
    throw new Error(
      `Cross-document schema reference cycle: ${cycle.join(" → ")}. A Merkle DAG cannot contain cycles; same-document recursion via '#' remains fine.`,
    );
  }

  // Pass 3: the foreign closure resolves from the dependency manifests, so
  // pinning can resolve foreign targets. Own documents are skipped: they
  // resolve through the topological pass below
  const pendingIds = new Set(pending.map((document) => document.id));
  const referenced = new Set(
    pending.flatMap(({ body }) =>
      collectSchemaRefs(body).map((ref) => parseSchemaRef(ref).id),
    ),
  );
  for (const id of referenced) {
    if (pendingIds.has(id)) continue;
    await resolveForeign(schemaSet, baseDir, id);
  }

  // Pass 4: pin and digest in topological order — a document is processed
  // only after every schema it references carries its final digest
  for (const document of pending) {
    if (schemaSet.named.has(document.id)) continue;
    await processOwnDocument(schemaSet, baseDir, document, new Set());
  }
  return schemaSet;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listJsonFiles(dir) {
  /** @type {string[]} */
  const files = [];
  const walk = (/** @type {string} */ current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.name.endsWith(".json")) {
        files.push(entryPath);
      }
    }
  };
  walk(dir);
  return files;
}

/**
 * Pin one own document: resolve every cross-document reference to its
 * final digest, embed the computed `implements` closure, write the
 * published bytes back (idempotently), and register the digest. Own
 * dependencies are processed first through the topological walk.
 *
 * @param {SchemaSet} schemaSet
 * @param {string} baseDir
 * @param {{ id: string, body: Record<string, any>, path: string, filePath: string }} document
 * @param {Set<string>} processing Topological walk guard.
 * @returns {Promise<void>}
 */
async function processOwnDocument(schemaSet, baseDir, document, processing) {
  if (schemaSet.named.has(document.id) || processing.has(document.id)) return;
  processing.add(document.id);
  // Own targets first: their pinned forms must exist before this document
  // can pin its references to their digests
  for (const ref of collectSchemaRefs(document.body)) {
    const targetId = parseSchemaRef(ref).id;
    const target = pendingOwn(schemaSet, baseDir, targetId);
    if (target) {
      await processOwnDocument(schemaSet, baseDir, target, processing);
    } else if (!schemaSet.named.has(targetId)) {
      await resolveForeign(schemaSet, baseDir, targetId);
    }
  }
  const pinned = await pinSchemaRefs(document.body, (ref) =>
    resolveDigestForPinning(schemaSet, baseDir, ref),
  );
  const entry = {
    body: pinned,
    digest: await digestSchema(pinned),
    path: document.path,
    implements: /** @type {string[]} */ ([]),
  };
  schemaSet.named.set(document.id, entry);
  entry.implements = await computeImplements(document.id, schemaSet, new Set());
  // The published bytes are the digested bytes; the rewrite is idempotent
  const published = `${JSON.stringify(pinned, null, 2)}\n`;
  if (fs.readFileSync(document.filePath, "utf8") !== published) {
    fs.writeFileSync(document.filePath, published);
  }
}

/**
 * @param {SchemaSet} schemaSet
 * @param {string} baseDir
 * @param {string} id
 * @returns {{ id: string, body: Record<string, any>, path: string, filePath: string }|null}
 */
function pendingOwn(schemaSet, baseDir, id) {
  if (schemaSet.named.has(id)) return null;
  const filePath = findOwnDocument(baseDir, id);
  if (!filePath) return null;
  const body = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (typeof body.$id !== "string" || parseSchemaRef(body.$id).id !== id) {
    return null;
  }
  return {
    id,
    body,
    path: path.relative(baseDir, filePath).split(path.sep).join("/"),
    filePath,
  };
}

/**
 * @param {string} baseDir
 * @param {string} id
 * @returns {string|null}
 */
function findOwnDocument(baseDir, id) {
  const schemasDir = path.join(baseDir, "schemas");
  if (!fs.existsSync(schemasDir)) return null;
  // Convention: schemas/<ns>/<name>.json, with a flat fallback
  for (const candidate of [
    path.join(schemasDir, `${id}.json`),
    path.join(schemasDir, `${id.replace("/", path.sep)}.json`),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return scanForId(schemasDir, id);
}

/**
 * @param {string} dir
 * @param {string} id
 * @returns {string|null}
 */
function scanForId(dir, id) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = scanForId(entryPath, id);
      if (nested) return nested;
      continue;
    }
    if (!entry.name.endsWith(".json")) continue;
    try {
      const body = JSON.parse(fs.readFileSync(entryPath, "utf8"));
      if (body.$id === id) return entryPath;
    } catch {
      // Not JSON at all; not ours to gate here
    }
  }
  return null;
}

/**
 * @param {string} id
 * @param {string} npm
 * @param {string} where Error context.
 * @returns {void}
 */
function assertNamespaceAvailable(id, npm, where) {
  const namespace = id.split("/")[0];
  const owner = RESERVED_NAMESPACES[namespace];
  if (owner && owner !== npm) {
    throw new Error(
      `Schema document '${where}' claims the reserved namespace '${namespace}', owned by ${owner}. Namespace governance is local and loud: pick a namespace your package owns.`,
    );
  }
}

/**
 * A body whose `$schema` names a NoFlo meta-schema must match the shipped
 * pinned artifact's digest; foreign meta-schema ids are rejected — the
 * meta-schemas are immutable and pinned, evolution mints new ids.
 *
 * @param {Record<string, any>} body
 * @param {string} where
 * @returns {Promise<void>}
 */
async function verifyMetaSchemaUrn(body, where) {
  if (
    typeof body.$schema !== "string" ||
    !body.$schema.startsWith("urn:noflo:")
  ) {
    return;
  }
  const ref = parseSchemaRef(body.$schema);
  if (!META_SCHEMA_IDS.includes(ref.id)) {
    throw new Error(
      `Schema document '${where}' references unknown meta-schema '${ref.id}'`,
    );
  }
  const shipped = await metaSchemaDigest(/** @type {any} */ (ref.id));
  if (ref.digest !== shipped) {
    throw new Error(
      `Schema document '${where}' pins meta-schema '${ref.id}' at digest ${ref.digest}, but the shipped artifact digests to ${shipped}`,
    );
  }
}

/**
 * @param {SchemaSet} schemaSet
 * @param {string} baseDir
 * @param {string} ref
 * @returns {Promise<string|null>}
 */
function resolveDigestForPinning(schemaSet, baseDir, ref) {
  const id = parseSchemaRef(ref).id;
  const own = schemaSet.named.get(id);
  if (own) return Promise.resolve(own.digest);
  const foreign = schemaSet.foreign.get(id);
  if (foreign) return Promise.resolve(foreign.digest);
  return (async () =>
    (await resolveForeign(schemaSet, baseDir, id))?.digest ?? null)();
}

/**
 * Resolve one foreign schema through the dependency closure: the
 * provider's published manifest pins the digest; its shipped body is
 * verified against that pin here, at publish, not discovered at runtime.
 *
 * @param {SchemaSet} schemaSet
 * @param {string} baseDir
 * @param {string} id
 * @returns {Promise<ForeignSchema|null>}
 */
async function resolveForeign(schemaSet, baseDir, id) {
  const existing = schemaSet.foreign.get(id);
  if (existing) return existing;
  const namespace = id.split("/")[0];
  for (const candidate of [`@noflo/${namespace}`, `noflo-${namespace}`]) {
    const pkgDir = path.join(baseDir, "node_modules", candidate);
    if (!fs.existsSync(pkgDir)) continue;
    const manifestPath = path.join(pkgDir, "noflo.json");
    let manifestDigest = null;
    /** @type {string|null} */
    let declaredPath = null;
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const entry = manifest.schemas?.[id];
      if (entry) {
        manifestDigest = entry.digest;
        declaredPath = entry.path ?? null;
      }
    }
    if (!manifestDigest && !declaredPath) {
      // The provider is installed but publishes no schemas table entry;
      // fall through to scanning its shipped schemas/ directory
      const scanned = scanForId(path.join(pkgDir, "schemas"), id);
      if (!scanned) continue;
      const body = JSON.parse(fs.readFileSync(scanned, "utf8"));
      const resolved = {
        digest: await digestSchema(body),
        npm: providerNpm(baseDir, namespace),
        body,
      };
      schemaSet.foreign.set(id, resolved);
      return resolved;
    }
    let body = null;
    if (declaredPath) {
      body = JSON.parse(
        fs.readFileSync(path.join(pkgDir, declaredPath), "utf8"),
      );
    }
    if (body) {
      const computed = await digestSchema(body);
      if (manifestDigest && manifestDigest !== computed) {
        throw new Error(
          `Digest mismatch across the closure: ${id} is pinned at ${manifestDigest} by the provider's manifest but its shipped body digests to ${computed}`,
        );
      }
      manifestDigest = manifestDigest ?? computed;
    }
    if (!manifestDigest) {
      throw new Error(
        `Schema reference '${id}' resolves to a provider with no digest pin: regenerate the provider's manifest`,
      );
    }
    const resolved = {
      digest: manifestDigest,
      npm: providerNpm(baseDir, namespace),
      body,
    };
    schemaSet.foreign.set(id, resolved);
    return resolved;
  }
  throw new Error(
    `Schema reference '${id}' does not resolve within the closure: it is neither shipped in this package's schemas/ directory nor provided by an installed dependency's manifest. Offline completeness is the publish gate's job.`,
  );
}

/**
 * @param {string} baseDir
 * @param {string} namespace
 * @returns {string|null}
 */
function providerNpm(baseDir, namespace) {
  for (const candidate of [`@noflo/${namespace}`, `noflo-${namespace}`]) {
    const pkgPath = path.join(
      baseDir,
      "node_modules",
      candidate,
      "package.json",
    );
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, "utf8")).name;
    }
  }
  return null;
}

/**
 * Compute the `implements` closure for a schema: the transitive set of ids
 * reached through root-level `allOf`/`$ref` members only. A
 * `properties`-nested `$ref` is not an implementation. Closed interfaces
 * are rejected here with the composition-safe alternative named.
 *
 * @param {string} id The schema's own id.
 * @param {SchemaSet} schemaSet
 * @param {Set<string>} visiting Cycle guard.
 * @returns {Promise<string[]>} Sorted base ids.
 */
export async function computeImplements(id, schemaSet, visiting = new Set()) {
  if (visiting.has(id)) return [];
  visiting.add(id);
  const body = ownOrForeignBody(schemaSet, id);
  if (!body) return [];
  /** @type {Set<string>} */
  const bases = new Set();
  if (Array.isArray(body.allOf)) {
    for (const member of body.allOf) {
      if (
        member === null ||
        typeof member !== "object" ||
        Array.isArray(member)
      ) {
        continue;
      }
      if (typeof member.$ref === "string") {
        await addImplementation(member.$ref, id, schemaSet, bases, visiting);
        continue;
      }
      // Inline member: its own root-level allOf members are implementations
      for (const nested of member.allOf ?? []) {
        if (nested?.$ref === undefined) continue;
        await addImplementation(nested.$ref, id, schemaSet, bases, visiting);
      }
    }
  }
  return [...bases].sort();
}

/**
 * @param {string} ref
 * @param {string} selfId
 * @param {SchemaSet} schemaSet
 * @param {Set<string>} bases
 * @param {Set<string>} visiting
 * @returns {Promise<void>}
 */
async function addImplementation(ref, selfId, schemaSet, bases, visiting) {
  const baseId = parseSchemaRef(ref).id;
  if (baseId === selfId) return;
  assertInterfaceOpen(baseId, schemaSet);
  bases.add(baseId);
  for (const transitive of await computeImplements(
    baseId,
    schemaSet,
    visiting,
  )) {
    bases.add(transitive);
  }
}

/**
 * @param {SchemaSet} schemaSet
 * @param {string} id
 * @returns {Record<string, any>|null}
 */
function ownOrForeignBody(schemaSet, id) {
  return (
    schemaSet.named.get(id)?.body ?? schemaSet.foreign.get(id)?.body ?? null
  );
}

/**
 * An interface carrying `additionalProperties: false` or
 * `unevaluatedProperties: false` cannot be extended by `allOf` — the
 * extending schema fails to validate as the base.
 *
 * @param {string} baseId
 * @param {SchemaSet} schemaSet
 * @returns {void}
 */
function assertInterfaceOpen(baseId, schemaSet) {
  const body = ownOrForeignBody(schemaSet, baseId);
  if (!body) return;
  if (
    body.additionalProperties === false ||
    body.unevaluatedProperties === false
  ) {
    throw new Error(
      `Schema '${baseId}' is a closed interface (additionalProperties/unevaluatedProperties: false) and cannot be implemented via allOf. Use the composition-safe alternative: keep the interface open and constrain the extension, or mint a new id.`,
    );
  }
}

/**
 * Hoist an inline port schema marker into the schema set: an object becomes
 * a content-addressed anonymous entry (or a named entry when it carries an
 * `$id`); a string is resolved as authoring sugar. Returns the final port
 * reference, or null when the marker is absent.
 *
 * @param {SchemaMarker} marker
 * @param {SchemaSet} schemaSet
 * @param {string} baseDir
 * @param {string} where Error context (component and port).
 * @returns {Promise<{ id?: string, digest: string }|null>}
 */
export async function hoistSchemaMarker(marker, schemaSet, baseDir, where) {
  if (marker === null || marker === undefined) return null;
  if (typeof marker === "string") {
    const parsed = parseSchemaRef(marker);
    if (parsed.fragment !== null) {
      throw new Error(
        `${where}: port schema references target whole artifacts; fragment refs (${marker}) are not portable authoring sugar`,
      );
    }
    let digest = null;
    const own = schemaSet.named.get(parsed.id);
    if (own) {
      digest = own.digest;
    } else {
      const foreign = await resolveForeign(schemaSet, baseDir, parsed.id);
      digest = foreign?.digest ?? null;
    }
    if (!digest) {
      throw new Error(
        `${where}: schema '${parsed.id}' does not resolve within the closure — ship it in schemas/ or declare the providing dependency`,
      );
    }
    recordForeignReference(schemaSet, parsed.id, digest);
    return parsed.digest
      ? { id: parsed.id, digest: parsed.digest }
      : { id: parsed.id, digest };
  }
  if (marker === null || typeof marker !== "object" || Array.isArray(marker)) {
    throw new Error(`${where}: port schema must be an id string or an object`);
  }
  if (
    typeof marker.digest === "string" &&
    /^[0-9a-f]{64}$/.test(marker.digest)
  ) {
    // Already pinned (regenerated from a published manifest)
    if (marker.id !== undefined) {
      recordForeignReference(schemaSet, marker.id, marker.digest);
    }
    return marker.id === undefined
      ? { digest: marker.digest }
      : { id: marker.id, digest: marker.digest };
  }
  if (typeof marker.$id === "string") {
    // A named document written inline: hoist it into schemas/ under its id
    const id = parseSchemaRef(marker.$id).id;
    assertNamespaceAvailable(id, schemaSet.npm, where);
    await verifyMetaSchemaUrn(marker, where);
    const existing = schemaSet.named.get(id);
    const pinned = await pinSchemaRefs(marker, (ref) =>
      resolveDigestForPinning(schemaSet, baseDir, ref),
    );
    const digest = await digestSchema(pinned);
    if (existing && existing.digest !== digest) {
      throw new Error(
        `${where}: inline schema '${id}' disagrees with the shipped document at ${existing.path}`,
      );
    }
    const rel = `schemas/${id}.json`;
    writePublishedBody(baseDir, rel, pinned);
    if (!existing) {
      /** @type {NamedSchema} */
      const entry = {
        body: pinned,
        digest,
        path: rel,
        implements: [],
      };
      schemaSet.named.set(id, entry);
      entry.implements = await computeImplements(id, schemaSet, new Set());
    }
    return { id, digest };
  }
  // Anonymous: content-addressed, id-less, digest-keyed
  const digest = await digestSchema(marker);
  if (!schemaSet.anonymous.has(digest)) {
    const rel = `schemas/${digest}.json`;
    writePublishedBody(baseDir, rel, marker);
    schemaSet.anonymous.set(digest, { body: marker, digest, path: rel });
  }
  return { digest };
}

/**
 * @param {SchemaSet} schemaSet
 * @param {string} id
 * @param {string} digest
 * @returns {void}
 */
function recordForeignReference(schemaSet, id, digest) {
  if (schemaSet.named.has(id)) return;
  if (!schemaSet.foreignReferenced.has(id)) {
    schemaSet.foreignReferenced.set(id, {
      digest,
      providedBy: schemaSet.foreign.get(id)?.npm ?? null,
    });
  }
}

/**
 * Write a published schema body: stable JSON, two-space indent, trailing
 * newline. Existing files are left untouched when their bytes already match
 * (idempotent publish); content-addressed entries are immutable.
 *
 * @param {string} baseDir
 * @param {string} rel
 * @param {Record<string, any>} body
 * @returns {void}
 */
function writePublishedBody(baseDir, rel, body) {
  const filePath = path.join(baseDir, rel);
  const serialized = `${JSON.stringify(body, null, 2)}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    if (fs.readFileSync(filePath, "utf8") !== serialized) {
      throw new Error(
        `Schema document '${rel}' already exists with different bytes: content-addressed entries are immutable`,
      );
    }
    return;
  }
  fs.writeFileSync(filePath, serialized);
}

/**
 * Resolve a port's schema marker and guard into the final manifest shape,
 * deriving the guard from the schema when the author did not write one and
 * linting explicit guards against the projection (the consistency rule:
 * the guard must equal the projection of the schema). The port object is
 * updated in place.
 *
 * @param {{ schema: SchemaMarker, guard: any }} port Harvested port with raw markers.
 * @param {SchemaSet} schemaSet
 * @param {string} baseDir
 * @param {string} where Error context.
 * @returns {Promise<void>}
 */
export async function finalizePortSchema(port, schemaSet, baseDir, where) {
  const ref = await hoistSchemaMarker(port.schema, schemaSet, baseDir, where);
  port.schema = ref;
  if (port.guard !== null && port.guard !== undefined) {
    validateGuard(port.guard);
  }
  if (!ref) {
    port.guard = null;
    return;
  }
  const body = ref.id
    ? (schemaSet.named.get(ref.id)?.body ??
      schemaSet.foreign.get(ref.id)?.body ??
      null)
    : (schemaSet.anonymous.get(ref.digest)?.body ?? null);
  if (!body) {
    // Foreign body not shipped locally: no projection is possible, and an
    // explicit guard cannot be linted — it ships as written
    if (port.guard === null || port.guard === undefined) port.guard = null;
    return;
  }
  const projected = projectGuard(body, (refString) =>
    ownOrForeignBody(schemaSet, parseSchemaRef(refString).id),
  );
  if (port.guard === null || port.guard === undefined) {
    // Derived: the hoisting pass generates the guard from the schema
    port.guard = Object.keys(projected).length ? projected : null;
    return;
  }
  const explicit = canonicalizeJson(port.guard);
  const derived = canonicalizeJson(projected);
  if (explicit !== derived) {
    throw new Error(
      `${where}: the declared guard does not equal the projection of its schema. Guards must equal the schema's projection (work document #37 §3.1); either drop the explicit guard or fix the schema: declared ${explicit}, projected ${derived}`,
    );
  }
}
