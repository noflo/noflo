/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * DOT renderer for canonical graph documents.
 *
 * Renders a canonical graph document (the `GraphModel.serialize()` shape
 * from `@noflo/graph`) as a Graphviz DOT digraph for inspection. Zero
 * dependencies, standard JavaScript only. Deterministic: entity-id
 * ordering throughout, so two renders of the same graph are identical.
 *
 * This is an inspection format, not an interchange one — information
 * lost here is anything DOT cannot carry naturally (groups render as
 * clusters, exports as dashed boundary edges, IIPs as note-shaped
 * nodes).
 *
 * @module @noflo/graph
 * @example
 * import { toDOT } from '@noflo/graph';
 * console.log(toDOT(graph.serialize()));
 */

/* @ts-self-types="./toDot.d.ts" */

/**
 * The canonical graph document shape (`GraphModel.serialize()`).
 *
 * @typedef {import("./graph/GraphModel.js").CanonicalGraph} CanonicalGraph
 */

/**
 * Escape a string for a DOT quoted string: backslashes and quotes.
 *
 * @param {string} value
 * @returns {string}
 */
function esc(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Render a non-empty string payload for a label, or null when empty. */
function label(value) {
  return value ? esc(value) : null;
}

/**
 * Join non-null label fragments with the DOT line-break separator.
 *
 * @param {(string|null)[]} fragments
 * @returns {string}
 */
function labelFrom(fragments) {
  const parts = fragments.filter((f) => f !== null);
  return parts.length > 0 ? `label="${parts.join("\\n")}"` : "";
}

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
 * Render a canonical graph document as a Graphviz DOT digraph.
 *
 * The input is the `GraphModel.serialize()` shape; a plain object with
 * the same fields is accepted equally. Node ids are the canonical
 * `entity_id` values.
 *
 * @param {CanonicalGraph} graph
 * @returns {string} The DOT source, newline-terminated
 */
export function toDOT(graph) {
  /** @type {string[]} */
  const lines = ["digraph {", "  rankdir=LR;"];

  const nodes = [...(graph.nodes ?? [])].sort((a, b) =>
    a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0,
  );

  // Nodes: id + component
  for (const node of nodes) {
    const component =
      node.component === undefined ? null : `(${node.component})`;
    const attrs = [labelFrom([esc(node.entity_id), label(component)])];
    lines.push(
      `  "${esc(node.entity_id)}" [${attrs.filter(Boolean).join(", ")}];`,
    );
  }

  // Exports: dashed boundary edges between the public port and the node
  const sortedExports = [...(graph.exports ?? [])].sort(
    (a, b) =>
      (a.public < b.public ? -1 : a.public > b.public ? 1 : 0) ||
      (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0),
  );
  for (const exp of sortedExports) {
    const portLabel = `${exp.public}: ${renderPort(exp.internal)}`;
    if (exp.direction === "inport") {
      lines.push(
        `  "${esc(`in:${exp.public}`)}" [label="${esc(portLabel)}", shape=cds];`,
      );
      lines.push(
        `  "${esc(`in:${exp.public}`)}" -> "${esc(exp.internal.node)}" [style=dashed, label="${esc(renderPort(exp.internal))}"];`,
      );
    } else {
      lines.push(
        `  "${esc(`out:${exp.public}`)}" [label="${esc(portLabel)}", shape=cds];`,
      );
      lines.push(
        `  "${esc(exp.internal.node)}" -> "${esc(`out:${exp.public}`)}" [style=dashed, label="${esc(renderPort(exp.internal))}"];`,
      );
    }
  }

  // IIPs: note-shaped nodes carrying the initial data
  const sortedIips = [...(graph.iips ?? [])].sort((a, b) =>
    a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0,
  );
  for (const iip of sortedIips) {
    const data = JSON.stringify(iip.from.data) ?? "null";
    const iipId = `iip:${iip.entity_id}`;
    lines.push(`  "${esc(iipId)}" [label="${esc(data)}", shape=note];`);
    lines.push(
      `  "${esc(iipId)}" -> "${esc(iip.to.node)}" [label="${esc(renderPort(iip.to))}"];`,
    );
  }

  // Edges: port-to-port labels
  const sortedEdges = [...(graph.edges ?? [])].sort((a, b) =>
    a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0,
  );
  for (const edge of sortedEdges) {
    lines.push(
      `  "${esc(edge.from.node)}" -> "${esc(edge.to.node)}" [label="${esc(renderPort(edge.from))} -> ${esc(renderPort(edge.to))}"];`,
    );
  }

  // Groups: clusters over member nodes
  const sortedGroups = [...(graph.groups ?? [])]
    .map((group, i) => ({ group, i }))
    .sort(
      (a, b) =>
        (a.group.name < b.group.name
          ? -1
          : a.group.name > b.group.name
            ? 1
            : 0) || a.i - b.i,
    );
  // Groups: clusters over member nodes, numbered by sorted position.
  // Members render even when their ids dangle: Graphviz implicitly
  // creates the phantom node inside the cluster, surfacing the
  // dangling reference instead of hiding it.
  for (const [position, { group }] of sortedGroups.entries()) {
    lines.push(`  subgraph cluster_${position} {`);
    lines.push(`    label="${esc(group.name)}";`);
    for (const memberId of [...(group.nodes ?? [])].sort()) {
      lines.push(`    "${esc(memberId)}";`);
    }
    lines.push("  }");
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}
