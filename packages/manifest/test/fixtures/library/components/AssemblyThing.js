import { Component as AssemblyComponent } from "@noflo/assembly";
export function getComponent() {
  class RelayThing extends AssemblyComponent {
    relay(msg, output) {
      output.sendDone(msg);
    }
  }
  const c = new RelayThing({ description: "Relay-style" });
  return c;
}
