//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * Generated from `schemas/catalog-ui.json` — the shipped artifact is the JSON
 * file; this module mirrors it for dependency-free runtime access. The
 * test suite verifies the two stay identical.
 */
export const UiCatalog = {
  $schema:
    "urn:noflo:noflo/meta-catalog@278e7057c1cce1a8f33fb75aab757450cbdcde7bb5135858d18ac0ca1bfe62c9",
  title: "The ui metadata catalog",
  description:
    "Positional canvas metadata (work document #37 §3.2): keys that change only how a graph is drawn. They may travel the 0x05 UI-metadata op, merge per key, and may be dropped by constrained nodes without semantic loss. ui.x and ui.y are the canvas positions of nodes, exported ports, and IIPs (noflo-ui SPEC Appendix A intents); ui.route and ui.routePoints are edge routing (noflo-ui WD #35's live semantics, re-declared here rather than carried over as legacy).",
  entries: {
    "ui.x": {
      schema: {
        type: "number",
      },
      class: "positional",
      kinds: ["node", "export", "iip"],
    },
    "ui.y": {
      schema: {
        type: "number",
      },
      class: "positional",
      kinds: ["node", "export", "iip"],
    },
    "ui.route": {
      schema: {
        type: "string",
      },
      class: "positional",
      kinds: ["edge"],
    },
    "ui.routePoints": {
      schema: {
        type: "array",
      },
      class: "positional",
      kinds: ["edge"],
    },
  },
};
