/**
 * @noflo/assembly-utils - Assembly adapter components for NoFlo
 * Merge assembly messages from all connected inputs into one.
 * SPDX-License-Identifier: MIT
 */
/* @ts-self-types="./Merge.d.ts" */
import noflo from "@noflo/noflo";
import { merge } from "@noflo/assembly";

export function getComponent() {
  const c = new noflo.Component();
  c.description = "Merge assembly message from all connections";
  c.icon = "angle-double-right";
  c.inPorts.add("in", {
    datatype: "object",
    addressable: true,
  });
  c.outPorts.add("out", {
    datatype: "object",
  });
  return c.process((input, output) => {
    const attachedIndexes = /** @type {number[]} */ (input.attached("in"));
    const indexesWithData = attachedIndexes
      .filter((idx) => input.hasData(["in", idx]));
    if (indexesWithData.length < attachedIndexes.length) {
      // Still waiting for data
      return;
    }
    const messages = indexesWithData.map((idx) => input.getData(["in", idx]));
    /** @type {import("@noflo/assembly").AssemblyMessage} */
    let message = { errors: [] };
    let errors = [];
    messages.forEach((msg) => {
      if (msg.errors && msg.errors.length) {
        errors = errors.concat(msg.errors);
      }
      message = merge(message, msg);
    });
    output.sendDone({
      out: {
        ...message,
        errors,
      },
    });
  });
}
