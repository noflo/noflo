import { Component } from "../../src/index.js";

class BuildBodyBase extends Component {
  constructor() {
    super({
      description: "Builds the base of car body",
      inPorts: {
        in: {
          datatype: "object",
          schema: "car/order",
        },
      },
      outPorts: {
        out: {
          datatype: "object",
          schema: "car/assembly-body",
        },
      },
      validates: { id: "num" },
    });
  }

  relay(msg, output) {
    msg.body = {
      id: msg.id,
    };
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new BuildBodyBase();
}
