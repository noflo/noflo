/**
 * @noflo/assembly-utils - Assembly adapter components for NoFlo
 * Collect streamed assemblies from all connected inputs into a single message.
 * SPDX-License-Identifier: MIT
 */
/* @ts-self-types="./All.d.ts" */
import noflo from "@noflo/noflo";

export function getComponent() {
  const c = new noflo.Component();
  c.description = "Collect streamed Assemblies from all connected inputs into a single message";
  c.icon = "fast-forward";

  c.inPorts.add("in", {
    datatype: "object",
    addressable: true,
  });
  c.outPorts.add("out", {
    datatype: "object",
  });
  c.forwardBrackets = {};
  return c.process((input, output) => {
    const attachedIndexes = /** @type {number[]} */ (input.attached("in"));
    const indexesWithStreams = attachedIndexes
      .filter((idx) => input.hasStream(["in", idx]));
    if (indexesWithStreams.length < attachedIndexes.length) {
      // Still waiting for streams
      return;
    }
    const streams = /** @type {Array<Array<import("@noflo/noflo").IP>>} */ (
      indexesWithStreams.map((idx) => input.getStream(["in", idx]))
    );
    const message = {
      errors: [],
      data: [],
    };
    streams.forEach((stream) => {
      const streamData = [];
      stream.forEach((ip) => {
        if (ip.type !== "data") {
          return;
        }
        if (ip.data.errors && ip.data.errors.length) {
          // Error anywhere in input is an error in the whole assembly
          message.errors = message.errors.concat(ip.data.errors);
        }
        streamData.push(ip.data);
      });
      message.data.push(streamData);
    });
    output.sendDone({
      out: message,
    });
  });
}
