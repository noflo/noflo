import { Component as AssemblyComponent } from "@noflo/assembly";
export function getComponent() {
  class RelayThing extends AssemblyComponent {
    /**
     * @param {Record<string, any>} msg
     * @param {{ sendDone(map: Record<string, unknown>): void }} output
     */
    relay(msg, output) {
      output.sendDone(msg);
    }
  }
  const c = new RelayThing({ description: "Relay-style" });
  return c;
}
