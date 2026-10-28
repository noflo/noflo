import { Component, fork } from "../../src/index.js";

class SplitAssemblies extends Component {
  constructor() {
    super({
      description: "Split production into concurrent lines",
      inPorts: {
        in: {
          datatype: "object",
          schema: "car/order",
        },
      },
      outPorts: {
        b: {
          datatype: "object",
          schema: "car/order",
        },
        c: {
          datatype: "object",
          schema: "car/order",
        },
      },
      validates: { id: "num" },
    });
  }

  processMessage(input, output) {
    if (!input.hasData("in")) {
      return null;
    }
    const msg = input.getData("in");
    // We have to call error check and validation manually
    // if ports are different from IN -> [ ] -> OUT
    if (!this.validate(msg)) {
      return output.sendDone({
        b: msg,
        c: msg,
      });
    }
    // Fork the message to protect concurrency
    const forkedMsg = fork(msg);
    return output.sendDone({
      b: msg,
      c: forkedMsg,
    });
  }
}

export function getComponent() {
  return new SplitAssemblies();
}
