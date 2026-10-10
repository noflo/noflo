import { Component as AssemblyComponent } from "@noflo/assembly";
import { Component } from "@noflo/noflo";
export function getComponent() {
  class RelayThing extends AssemblyComponent {
    relay(msg, output) {
      output.sendDone(msg);
    }
  }
  const c = new RelayThing({ description: "Relay-style" });
  return c;
}
