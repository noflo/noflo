//     @noflo/fbp-protocol - FBP Protocol 2.0 over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * Generated from `schemas/noflo-extension-vocabulary.json.json` — the shipped artifact is the JSON
 * file; this module mirrors it for dependency-free runtime access. The
 * test suite verifies the two stay byte-identical.
 */
export const extensionVocabulary = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "noflo/extension-vocabulary",
  title: "NoFlo extension vocabulary for JSON Schema 2020-12",
  description:
    "Declares the keywords NoFlo adds to JSON Schema 2020-12 through the spec's own $vocabulary mechanism (work document #37 §1, §3.2). The NoFlo vocabulary is declared optional (the false form), so validators that do not know our keywords ignore them rather than refusing the document. discriminator is OpenAPI vocabulary, declared here rather than smuggled into core. implements is a root-level keyword computed at publish over root-level allOf/$ref members only.",
  $vocabulary: {
    "https://json-schema.org/draft/2020-12/vocab/core": true,
    "https://json-schema.org/draft/2020-12/vocab/applicator": true,
    "https://json-schema.org/draft/2020-12/vocab/validation": true,
    "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
    "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
    "https://json-schema.org/draft/2020-12/vocab/content": true,
    "urn:noflo:vocab/extension": false,
  },
  allOf: [
    {
      $ref: "https://json-schema.org/draft/2020-12/schema",
    },
  ],
  properties: {
    discriminator: {
      $ref: "#/$defs/discriminator",
    },
    implements: {
      type: "array",
      description:
        "Root-level declaration of the interface ids this schema implements. Computed at publish as the closure over the document's root-level allOf/$ref members; a properties-nested $ref is not an implementation.",
      items: {
        type: "string",
        pattern: "^[a-z][a-z0-9_-]*/",
      },
    },
  },
  $defs: {
    discriminator: {
      type: "object",
      description:
        "OpenAPI-style discriminator for oneOf pickers: the property whose value selects the implementation, plus the optional value-to-schema mapping.",
      required: ["propertyName"],
      properties: {
        propertyName: {
          type: "string",
        },
        mapping: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
        },
      },
    },
  },
};
