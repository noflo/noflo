//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * Generated from `schemas/noflo-meta-catalog.json.json` — the shipped artifact is the JSON
 * file; this module mirrors it for dependency-free runtime access. The
 * test suite verifies the two stay byte-identical.
 */
export const metaCatalog = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "noflo/meta-catalog",
  title: "NoFlo metadata catalog document format",
  description:
    "The published meta-schema for metadata catalog documents (work document #37 §3.2): one document per namespace, each entry carrying the key's schema, its class (positional or config), and the entity kinds it applies to. Catalogs are data about schemas, not schemas themselves, and are digest-addressed like every other artifact. Runtimes never load catalogs: metadata validation is editor-side.",
  type: "object",
  required: ["entries"],
  properties: {
    entries: {
      type: "object",
      description: "Namespace keys (`ns.key`) to their declarations.",
      additionalProperties: {
        type: "object",
        required: ["schema", "class", "kinds"],
        properties: {
          schema: {
            type: "object",
            description:
              "JSON Schema 2020-12 document the key's values must satisfy. Validated editor-side only.",
          },
          class: {
            description:
              "positional keys may travel the 0x05 UI-metadata op and merge per key; config keys are graph state riding insert payloads and merge as one map per entity.",
            enum: ["positional", "config"],
          },
          kinds: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: {
              enum: ["node", "edge", "iip", "export", "group", "graph"],
            },
          },
        },
      },
    },
  },
};
