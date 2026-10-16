/**
 * @noflo/assembly-utils - Assembly adapter components for NoFlo
 * Merge assembly messages from all connected inputs into one.
 * SPDX-License-Identifier: MIT
 */
/* @ts-self-types="./Merge.d.ts" */

import { merge } from "@noflo/assembly";
import noflo from "@noflo/noflo";

/**
 * Merge component factory.
 *
 * Firing pattern: a barrier — the process fires only when every attached
 * `in` connection holds a data packet, and all of them are consumed
 * together. The has-check covers every connection before any get, so no
 * leg is ever consumed by an activation that then waits (the has/get-order
 * discipline, work documents #21 and #36).
 *
 * Concurrency contract (work document #36): messages that are in flight
 * concurrently through this component must carry scopes — the barrier
 * resolves per scope, so interleaved scoped messages pair correctly.
 * Unscoped concurrent in-flight messages pair positionally per connection
 * and cross; unscoped traffic is only correct when delivery is in-order
 * and synchronous.
 */
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
    const indexesWithData = attachedIndexes.filter((idx) =>
      input.hasData(["in", idx]),
    );
    if (indexesWithData.length < attachedIndexes.length) {
      // Still waiting for data
      return;
    }
    const messages = indexesWithData.map((idx) => input.getData(["in", idx]));
    /** @type {import("@noflo/assembly").AssemblyMessage} */
    let message = { errors: [] };
    let errors = [];
    messages.forEach((msg) => {
      if (msg.errors?.length) {
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
