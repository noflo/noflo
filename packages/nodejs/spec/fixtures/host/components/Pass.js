import { Component } from "@noflo/noflo";

export function getComponent() {
  const c = new Component({
    description: "Passes data through",
    inPorts: { in: { datatype: "all" } },
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
