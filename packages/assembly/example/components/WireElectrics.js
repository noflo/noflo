import { Component } from "../../src/index.js";

class WireElectrics extends Component {
  constructor() {
    super({
      description: "Wires body electrics",
      inPorts: {
        main: {
          datatype: "object",
          schema: "car/assembly-body-complete",
        },
        aux: {
          datatype: "object",
          schema: "car/assembly-body-complete",
        },
      },
      outPorts: {
        out: {
          datatype: "object",
          schema: "car/assembly-body-complete",
        },
      },
      validates: ["body.id"],
    });
  }

  processMessage(input, output) {
    if (!input.hasData("main", "aux")) {
      return null;
    }

    const main = input.getData("main");
    const aux = input.getData("aux");

    // Validate each of message ports
    if (!this.validate(main)) {
      return output.sendDone(main);
    }
    if (!this.validate(aux)) {
      return output.sendDone(aux);
    }

    main.body.electrics = "~~~~~~~~~~~~~~~~";

    return output.sendDone(main);
  }
}

export function getComponent() {
  return new WireElectrics();
}
