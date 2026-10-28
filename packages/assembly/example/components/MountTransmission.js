import { Component } from "../../src/index.js";

class MountTransmission extends Component {
  constructor() {
    super({
      description: "Mounts transmission and drive shaft",
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
    msg.chassis.transmission = "ZF Automatic 6-speed";
    msg.chassis.driveShaft = "-----";
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new MountTransmission();
}
