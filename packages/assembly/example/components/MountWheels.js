import { Component } from "../../src/index.js";

class MountWheels extends Component {
  constructor() {
    super({
      description: "Mounts wheels",
      inPorts: {
        in: {
          datatype: "object",
          description: "Assembly",
          schema: "car/assembly-chassis",
        },
        count: {
          datatype: "int",
          description: "Number of wheels",
          schema: { type: "integer", minimum: 1 },
          control: true, // for simplicity of example graph
        },
      },
      outPorts: {
        out: {
          datatype: "object",
          schema: "car/assembly-chassis-complete",
        },
      },
      validates: { chassis: "obj" },
    });
  }

  processMessage(input, output) {
    if (!input.hasData("in", "count")) {
      return null;
    }

    const msg = input.getData("in");
    const count = input.getData("count");

    if (!this.validate(msg)) {
      return output.sendDone(msg);
    }

    msg.chassis.wheels = [];
    for (let i = 0; i < count; i += 1) {
      msg.chassis.wheels.push("O");
    }

    return output.sendDone(msg);
  }
}

export function getComponent() {
  return new MountWheels();
}
