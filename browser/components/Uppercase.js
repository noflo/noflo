/**
 * (c) 2021-2026 Henri Bergius
 * @file browser/components/Uppercase.js
 * @description Fixture component for the live-editing flow: it is NOT in
 *   the registry's initial catalog — `main.js` registers it at runtime,
 *   exercising the registry `change` → loader refresh path.
 */

import { Component } from "@noflo/noflo";

export function getComponent() {
  const c = new Component({
    description: "Uppercases strings",
    inPorts: {
      in: { datatype: "string" },
    },
    outPorts: {
      out: { datatype: "string" },
    },
    process(input, output) {
      output.sendDone({ out: String(input.getData("in")).toUpperCase() });
    },
  });
  return c;
}
