//     @noflo/assembly - Message relay conventions for NoFlo
//     SPDX-License-Identifier: MIT

/**
 * Generated from `schemas/catalog.json` — the shipped artifact is the JSON
 * file; this module mirrors it for dependency-free runtime access. The
 * test suite verifies the two stay identical.
 */
export const AssemblyCatalog = {
  $schema:
    "urn:noflo:noflo/meta-catalog@278e7057c1cce1a8f33fb75aab757450cbdcde7bb5135858d18ac0ca1bfe62c9",
  title: "The assembly metadata catalog",
  description:
    "The config-class metadata keys `asAssembly`-generated adapter graphs carry (work document #37 §3.2, §5.1). Generated adapter nodes are configured through node metadata, which the loader passes to `getComponent(metadata)` — the declared form of the mechanism work document #36 already exercises. Config keys are graph state: they ride insert payloads, merge as one map per entity, and are never droppable; a config edit is a node re-instantiation trigger.",
  entries: {
    "assembly.field": {
      schema: {
        type: "string",
        minLength: 1,
        description: "The message field an adapter node extracts or writes.",
      },
      class: "config",
      kinds: ["node"],
    },
  },
};
