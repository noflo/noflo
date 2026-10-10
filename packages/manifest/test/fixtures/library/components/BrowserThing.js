import { Component } from "@noflo/noflo";
export function getComponent() {
  const c = new Component({
    description: "Runs everywhere",
    icon: "globe",
    inPorts: { in: { datatype: "string", required: true } },
    outPorts: { out: { datatype: "string" } },
  });
  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    output.sendDone({ out: input.getData("in") });
  });
  return c;
}
