const noflo = require("@noflo/noflo");

exports.getComponent = () => {
  const c = new noflo.Component();
  c.description = "Implemented sibling of a signature sidecar";
  c.inPorts.add("in", { datatype: "all" });
  c.outPorts.add("out", { datatype: "all" });
  c.process((input, output) => {
    output.sendDone(input.get("in"));
  });
  return c;
};
