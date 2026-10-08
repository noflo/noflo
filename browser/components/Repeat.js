/**
 * (c) 2021-2026 Henri Bergius
 * @file browser/components/Repeat.js
 * @description Fixture component: echoes what it receives. Written as a
 *   plain ESM module with a `getComponent` export — the browser-side
 *   component shape the static registry resolves.
 */

import { Component } from "@noflo/noflo";

export function getComponent() {
  const c = new Component({
    description: "Repeats what it receives",
    inPorts: {
      in: { datatype: "all" },
    },
    outPorts: {
      out: { datatype: "all" },
    },
    process(input, output) {
      output.sendDone({ out: input.getData("in") });
    },
  });
  return c;
}
