import { Component } from "noflo";

export function getComponent() {
  const c = new Component();
  c.description = "Emits the running total of everything received (stateful)";
  c.inPorts.add("in", { datatype: "int" });
  c.outPorts.add("out", { datatype: "int" });
  let sum = 0;
  c.process((input, output) => {
    sum += input.getData("in");
    output.sendDone({ out: sum });
  });
  return c;
}
