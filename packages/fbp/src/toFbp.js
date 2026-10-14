/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * Writer for the .fbp flow-based programming language.
 *
 * Renders a canonical graph document (the `GraphModel.serialize()` shape
 * from `@noflo/graph`) as `.fbp` DSL source. Zero dependencies, standard
 * JavaScript only: runs on Node.js, Deno, Bun, and browsers.
 *
 * The DSL is a lossy surface: groups have no DSL representation, and
 * metadata values are limited to what the syntax can carry (`x`/`y`
 * numbers and simple scalar strings). Everything else round-trips:
 * nodes with components, edges with port indexes, IIPs, and exports
 * survive a `toFBP`/`parse` cycle with identical semantics.
 *
 * @module @noflo/fbp
 * @example
 * import { toFBP } from '@noflo/fbp';
 * const source = toFBP(canonicalGraph);
 */

/* @ts-self-types="./toFbp.d.ts" */

/**
 * @typedef {import('./parse.js').GraphJson} GraphJson
 */
/**
 * The canonical graph document shape (`GraphModel.serialize()`).
 *
 * @typedef {Object} CanonicalGraph
 * @property {string} [name]
 * @property {Object<string, any>} [metadata]
 * @property {Array<{ entity_id: string, component?: string, metadata?: Object<string, any> }>} nodes
 * @property {Array<{ entity_id: string, from: { node: string, port: string, index?: number }, to: { node: string, port: string, index?: number }, metadata?: Object<string, any> }>} edges
 * @property {Array<{ entity_id: string, from: { data: any }, to: { node: string, port: string, index?: number }, metadata?: Object<string, any> }>} iips
 * @property {Array<{ entity_id: string, direction: "inport"|"outport", internal: { node: string, port: string, index?: number }, public: string, metadata?: Object<string, any> }>} exports
 * @property {any[]} [groups]
 */

/** Characters allowed in a DSL metadata value. @type {RegExp} */
const SAFE_META_VALUE = /^[A-Za-z0-9/_.:-]+$/;

/**
 * Render a port reference: `port` or `port[index]`.
 *
 * @param {{ port: string, index?: number }} portRef
 * @returns {string}
 */
function renderPort(portRef) {
	return portRef.index === undefined
		? portRef.port
		: `${portRef.port}[${portRef.index}]`;
}

/**
 * Render a node declaration suffix: `(Component)` or `(Component:key=value)`, or
 * an empty string when the node was already declared. The node's first mention
 * in the output carries the declaration.
 *
 * @param {Map<string, CanonicalGraph["nodes"][number]>} nodes
 * @param {Set<string>} declared
 * @param {string} nodeId
 * @returns {string}
 */
function renderComponent(nodes, declared, nodeId) {
	const node = nodes.get(nodeId);
	if (!node || declared.has(nodeId)) {
		return "";
	}
	declared.add(nodeId);
	return `(${node.component ?? ""}${renderMetadata(node.metadata)})`;
}

/**
 * Render the `:key=value` metadata suffix inside a node declaration.
 * Only expressible values survive: integer `x`/`y` coordinates and scalar
 * strings from the safe character set; everything else is dropped (the
 * DSL round-trips through `parse` with identical semantics, minus the
 * unrepresentable values).
 *
 * @param {Object<string, any>|undefined} metadata
 * @returns {string}
 */
function renderMetadata(metadata) {
	if (!metadata) {
		return "";
	}
	const entries = Object.entries(metadata)
		.filter(([key, value]) => {
			if (key === "x" || key === "y") {
				return typeof value === "number" && Number.isInteger(value);
			}
			return typeof value === "string" && SAFE_META_VALUE.test(value);
		})
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`);
	return entries.length > 0 ? `:${entries.join(",")}` : "";
}

/**
 * Render an IIP data literal: strings quoted (with `'` escaped), other
 * JSON-able values as JSON.
 *
 * @param {any} data
 * @returns {string}
 */
function renderIipData(data) {
	if (typeof data === "string") {
		return `'${data.replace(/'/g, "\\'")}'`;
	}
	const json = JSON.stringify(data);
	if (json === undefined) {
		throw new TypeError(
			"IIP data must be JSON-able; cannot render it in the .fbp DSL",
		);
	}
	return json;
}

/**
 * Deterministic tie-breaker: entity id order.
 *
 * @param {{ entity_id: string }} a
 * @param {{ entity_id: string }} b
 * @returns {number}
 */
function byEntityId(a, b) {
	return a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0;
}

/**
 * Render a canonical graph document as `.fbp` DSL source.
 *
 * The input is the `GraphModel.serialize()` shape; a plain object with
 * the same fields is accepted equally. Node ids are the canonical
 * `entity_id` values.
 *
 * @param {CanonicalGraph} graph
 * @returns {string} The `.fbp` source, newline-terminated
 * @throws {TypeError} On IIP data that cannot be represented
 */
export function toFBP(graph) {
	/** @type {string[]} */
	const lines = [];
	/** @type {Map<string, CanonicalGraph["nodes"][number]>} */
	const nodes = new Map((graph.nodes ?? []).map((n) => [n.entity_id, n]));
	/** @type {Set<string>} */
	const declared = new Set();

	// Exports first: INPORT/OUTPORT header lines
	const sortedExports = [...(graph.exports ?? [])].sort(
		(a, b) =>
			(a.public < b.public ? -1 : a.public > b.public ? 1 : 0) ||
			byEntityId(a, b),
	);
	for (const exp of sortedExports) {
		lines.push(
			`${exp.direction === "inport" ? "INPORT" : "OUTPORT"}=${exp.internal.node}.${renderPort(exp.internal)}:${exp.public}`,
		);
	}

	// IIPs, one line each; the target's first mention carries the component
	const sortedIips = [...(graph.iips ?? [])].sort(
		(a, b) =>
			(a.to.node < b.to.node ? -1 : a.to.node > b.to.node ? 1 : 0) ||
			byEntityId(a, b),
	);
	for (const iip of sortedIips) {
		lines.push(
			`${renderIipData(iip.from.data)} -> ${renderPort(iip.to)} ${iip.to.node}${renderComponent(nodes, declared, iip.to.node)}`,
		);
	}

	// Edges, one line each; first mentions carry their components
	const sortedEdges = [...(graph.edges ?? [])].sort((a, b) => {
		const fromA = `${a.from.node}.${a.from.port}.${a.from.index ?? ""}`;
		const fromB = `${b.from.node}.${b.from.port}.${b.from.index ?? ""}`;
		return (fromA < fromB ? -1 : fromA > fromB ? 1 : 0) || byEntityId(a, b);
	});
	for (const edge of sortedEdges) {
		lines.push(
			`${edge.from.node}${renderComponent(nodes, declared, edge.from.node)} ${renderPort(edge.from)} -> ${renderPort(edge.to)} ${edge.to.node}${renderComponent(nodes, declared, edge.to.node)}`,
		);
	}

	// Nodes untouched by edges or IIPs, declared standalone
	for (const nodeId of [...nodes.keys()].sort()) {
		if (declared.has(nodeId)) {
			continue;
		}
		lines.push(`${nodeId}${renderComponent(nodes, declared, nodeId)}`);
	}

	return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
