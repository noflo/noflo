import { Component } from "noflo";

export function getComponent() {
  const c = new Component();
  c.description = "Repeats whatever it receives";
  c.inPorts.add("in", { datatype: "all" });
  c.outPorts.add("out", { datatype: "all" });
  c.process((input, output) => {
    output.sendDone({ out: input.getData("in") });
  });
  return c;
}
