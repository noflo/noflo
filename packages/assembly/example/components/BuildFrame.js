import { Component } from "../../src/index.js";

class BuildFrame extends Component {
  constructor() {
    super({
      description: "Builds car frame",
      inPorts: {
        in: {
          datatype: "object",
          schema: "car/order",
        },
      },
      outPorts: {
        out: {
          datatype: "object",
          schema: "car/assembly-chassis",
        },
      },
      validates: { id: "num" },
    });
  }

  /**
   * @param {Record<string, any>} msg
   * @param {{ sendDone(map: Record<string, unknown>): void, done(): void }} output
   */
  relay(msg, output) {
    msg.chassis = {
      id: msg.id,
      frame: "Steel Frame",
    };
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new BuildFrame();
}
