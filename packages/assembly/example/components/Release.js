import { Component, failed } from "../../src/index.js";

class Release extends Component {
  constructor() {
    super({
      description: "Release a car to the outer world",
      inPorts: {
        in: {
          datatype: "object",
          schema: "car/assembly-combined",
        },
      },
      outPorts: {
        out: {
          datatype: "object",
          schema: "car/car",
        },
      },
      validates: ["chassis.id", "body.id"],
    });
  }

  relay(msg, output) {
    // Display errors at this point
    if (failed(msg)) {
      msg.errors.forEach((e) => console.error(e));
    } else {
      if (msg.parts) {
        delete msg.parts;
      }
      console.log(
        "A Car:",
        JSON.stringify(
          {
            chassis: msg.chassis,
            body: msg.body,
          },
          null,
          2,
        ),
      );
    }
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new Release();
}
