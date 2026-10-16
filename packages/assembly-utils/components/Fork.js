/**
 * @noflo/assembly-utils - Assembly adapter components for NoFlo
 * Fork an assembly message to all connected outputs.
 * SPDX-License-Identifier: MIT
 */
/* @ts-self-types="./Fork.d.ts" */

import { fork } from "@noflo/assembly";
import noflo from "@noflo/noflo";

/**
 * Fork component factory.
 */
export function getComponent() {
  const c = new noflo.Component();
  c.description = "Fork assembly message to all connections";
  c.icon = "angle-double-left";
  c.inPorts.add("in", {
    datatype: "object",
  });
  c.outPorts.add("out", {
    datatype: "object",
    addressable: true,
  });
  return c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    const ip = /** @type {import("@noflo/noflo").IP} */ (input.get("in"));
    const message = ip.data;
    const attached = c.outPorts.ports.out.listAttached();
    attached.forEach((index) => {
      output.send({
        out: new noflo.IP("data", fork(message), {
          index,
          scope: ip.scope,
        }),
      });
    });
    output.done();
  });
}
