import { Component } from "@noflo/noflo";

export function getComponent() {
  const c = new Component({
    description: "Sends the config value once and closes the stream",
    inPorts: { in: { datatype: "all", required: true } },
    outPorts: { out: { datatype: "all" } },
  });
  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    output.sendDone({ out: input.getData("in") });
  });
  return c;
}
