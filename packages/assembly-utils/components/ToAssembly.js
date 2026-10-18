/**
 * @noflo/assembly-utils - Assembly adapter components for NoFlo
 * Convert regular NoFlo data into an assembly message envelope.
 * SPDX-License-Identifier: MIT
 */
/* @ts-self-types="./ToAssembly.d.ts" */
import noflo from "@noflo/noflo";

/**
 * ToAssembly component factory.
 *
 * The optional `assembly.field` node metadata names the field the
 * incoming value lands under (default `data`): an application turning
 * bare values into assembly messages picks the message shape — e.g.
 * `field: "path"` turns a path string into `{ errors: [], path: value
 * }` for a downstream adapter that consumes `path`. A non-string field
 * name, or the reserved `errors` name, rejects loudly at load time. The
 * error envelope stays `{ errors: [error] }` regardless of the field: a
 * failed value has no field content.
 *
 * @param {Record<string, unknown>} [metadata] - Node metadata; the
 *   `assembly.field` key names the value field
 */
export function getComponent(metadata = {}) {
  const field =
    /** @type {string | undefined} */ (metadata?.["assembly.field"]) ?? "data";
  // The field name must be a string and must not collide with the error
  // envelope: `assembly.field: "errors"` would silently overwrite the
  // errors array on the data path
  if (typeof field !== "string") {
    throw new TypeError(
      `ToAssembly: the assembly.field metadata must be a string (got ${JSON.stringify(field)})`,
    );
  }
  if (field === "errors") {
    throw new TypeError(
      "ToAssembly: the assembly.field metadata must not be 'errors' — the error envelope owns that field",
    );
  }
  const c = new noflo.Component();
  c.description = "Convert regular NoFlo data to an assembly message";
  c.inPorts.add("in", {
    datatype: "all",
  });
  c.inPorts.add("error", {
    datatype: "object",
  });
  c.outPorts.add("out", {
    datatype: "object",
  });
  return c.process((input, output) => {
    if (input.hasData("in")) {
      const data = input.getData("in");
      /** @type {Record<string, unknown>} */
      const envelope = { errors: [] };
      envelope[field] = data;
      output.sendDone({
        out: envelope,
      });
      return;
    }
    if (input.hasData("error")) {
      const error = input.getData("error");
      output.sendDone({
        out: {
          errors: [error],
        },
      });
    }
  });
}
