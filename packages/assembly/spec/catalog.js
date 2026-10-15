//     @noflo/assembly - Message relay conventions for NoFlo
//     SPDX-License-Identifier: MIT
//     @file spec/catalog.js
//     @description The assembly catalog and the work document #37 §5.1
//       proof of concept: every metadata map in a generated adapter graph
//       passes schema validation, survives the FBP JSON round-trip,
//       encodes through 0x14 insert ops unchanged, and re-instantiates
//       identically.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { getComponent } from "@noflo/assembly-utils/components/ExtractField.js";
import {
  CMD_CRDT_UPDATE,
  canonicalizeJson,
  decodeCrdtUpdate,
  digestSchema,
  encodeCrdtUpdate,
  metaSchemaDigest,
  OP_TYPE,
} from "@noflo/fbp-protocol";
import { exportFbpJson, GraphModel, importFbpJson } from "@noflo/graph";
import noflo from "@noflo/noflo";
import { asAssembly } from "../src/asAssembly.js";
import { ASSEMBLY_CATALOG } from "../src/catalog.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020");

class CopyLike extends noflo.Component {
  constructor() {
    super({
      description: "Passes the message through",
      inPorts: {
        in: { datatype: "object", required: true },
      },
      outPorts: {
        out: { datatype: "all" },
      },
    });
  }

  process(input, output) {
    if (!input.hasData("in")) {
      return;
    }
    output.sendDone({ out: input.getData("in") });
  }
}

describe("assembly catalog", () => {
  it("ships a body identical to the schemas/ artifact", async () => {
    const fileBody = JSON.parse(
      readFileSync(new URL("../schemas/catalog.json", import.meta.url), "utf8"),
    );
    assert.deepEqual(
      canonicalizeJson(ASSEMBLY_CATALOG),
      canonicalizeJson(fileBody),
    );
    assert.equal(
      await digestSchema(ASSEMBLY_CATALOG),
      await digestSchema(fileBody),
    );
  });

  it("pins the shipped meta-catalog at its digest", async () => {
    assert.equal(
      ASSEMBLY_CATALOG.$schema,
      `urn:noflo:noflo/meta-catalog@${await metaSchemaDigest("noflo/meta-catalog")}`,
    );
  });
});

describe("metadata PoC (work document #37 §5.1)", () => {
  /** @returns {import("@noflo/graph").GraphModel} */
  const generated = () => {
    const graph = asAssembly(new CopyLike(), { target: "test/CopyLike" });
    return graph instanceof GraphModel ? graph : GraphModel.from(graph);
  };

  it("every node metadata map in the generated graph validates", () => {
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(
      ASSEMBLY_CATALOG.entries["assembly.field"].schema,
    );
    let metadataNodes = 0;
    for (const node of generated().nodes()) {
      const metadata = node.metadata ?? {};
      for (const [key, value] of Object.entries(metadata)) {
        if (key === "assembly.field") {
          metadataNodes += 1;
          assert.equal(
            validate(value),
            true,
            `assembly.field of ${node.entity_id}: ${ajv.errorsText(validate.errors)}`,
          );
        } else {
          // Undeclared keys are not rejected — additionalProperties stays
          // open — but the generated graph carries none
          assert.fail(`unexpected metadata key '${key}' on ${node.entity_id}`);
        }
      }
    }
    assert.ok(
      metadataNodes > 0,
      "the generated graph carries adapter metadata",
    );
  });

  it("survives the FBP JSON round-trip byte-stably", () => {
    const graph = generated();
    const exported = exportFbpJson(graph);
    const reimported = importFbpJson(exported);
    assert.equal(
      canonicalizeJson(exportFbpJson(graph)),
      canonicalizeJson(exportFbpJson(reimported)),
    );
    // The metadata maps survive the round-trip
    for (const node of reimported.nodes()) {
      const original = graph
        .nodes()
        .find((n) => n.entity_id === node.entity_id);
      assert.deepEqual(node.metadata ?? {}, original?.metadata ?? {});
    }
  });

  it("encodes through 0x14 insert ops unchanged", () => {
    const graph = generated();
    const node = graph
      .nodes()
      .find((n) => Object.keys(n.metadata ?? {}).length > 0);
    assert.ok(node, "the generated graph carries metadata");
    const definition = { ...node };
    const frame = encodeCrdtUpdate({
      planeId: null,
      clientId: "runtime",
      logicalClock: 1,
      opType: OP_TYPE.INSERT_NODE,
      entityId: node.entity_id,
      payload: definition,
    });
    const decoded = decodeCrdtUpdate(frame);
    assert.equal(decoded.cmd, CMD_CRDT_UPDATE);
    assert.equal(decoded.opType, OP_TYPE.INSERT_NODE);
    assert.deepEqual(decoded.payload.metadata, node.metadata);
  });

  it("re-instantiates identically from the catalog-conformant metadata", () => {
    const graph = generated();
    const extract = graph
      .nodes()
      .find((n) => n.component === "assembly-utils/ExtractField");
    assert.ok(extract);
    const instance = getComponent(extract.metadata);
    assert.equal(instance.field, extract.metadata["assembly.field"]);
    // The same metadata re-instantiates the same behavior
    const again = getComponent(extract.metadata);
    assert.equal(again.field, instance.field);
    assert.notEqual(again, instance);
  });
});
