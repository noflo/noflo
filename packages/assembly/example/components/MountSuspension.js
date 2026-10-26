import { Component } from "../../src/index.js";

class MountSuspension extends Component {
  constructor() {
    super({
      inPorts: {
        in: {
          datatype: "object",
          schema: "car/assembly-chassis",
        },
      },
      outPorts: {
        out: {
          datatype: "object",
          schema: "car/assembly-chassis",
        },
      },
    });
  }

  relay(msg, output) {
    msg.chassis.suspension = {
      levers: "> | | <",
      shocks: ["I", "I", "i", "i"],
      coils: ["Z", "Z", "z", "z"],
    };
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new MountSuspension({
    description: "Mounts suspension",
  });
}
