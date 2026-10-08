const noflo = require("@noflo/noflo");

exports.getComponent = () => {
  const c = new noflo.Component();
  c.description = "Discovery fixture component";
  c.inPorts.add("in", { datatype: "all" });
  c.outPorts.add("out", { datatype: "all" });
  c.process((input, output) => {
    output.sendDone(input.get("in"));
  });
  return c;
};
