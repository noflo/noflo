import { Component } from "../../src/index.js";

class MountPanels extends Component {
  constructor() {
    super({
      description: "Mounts body panels",
      inPorts: {
        in: {
          datatype: "object",
          schema: "car/assembly-body",
        },
      },
      outPorts: {
        out: {
          datatype: "object",
          schema: "car/assembly-body",
        },
      },
      validates: ["body.id"],
    });
  }

  relay(msg, output) {
    msg.body.panels = "Steel Panels";
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new MountPanels();
}
