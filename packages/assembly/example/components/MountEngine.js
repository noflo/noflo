import { Component } from "../../src/index.js";

class MountEngine extends Component {
  constructor() {
    super({
      description: 'Mounts 3rd party engine on chassis',
      inPorts: {
        in: {
          datatype: 'object',
          description: 'Assembly',
        },
        engine: {
          datatype: 'string',
          description: 'Engine name',
          control: true, // for simplicity of example graph
        },
      },
      validates: { chassis: 'obj' },
    });
  }

  /**
   * @param {{ hasData(...ports: string[]): boolean, getData(...ports: string[]): any }} input
   * @param {{ sendDone(map: Record<string, unknown>): void, done(): void }} output
   */
  processMessage(input, output) {
    if (!input.hasData('in', 'engine')) { return null; }

    const msg = input.getData('in');
    const engine = input.getData('engine');

    // Message validation is explicit if there are multiple inports
    if (!this.validate(msg)) {
      return output.sendDone(msg);
    }

    msg.chassis.engine = engine;

    return output.sendDone(msg);
  }
}

export function getComponent() {
  return new MountEngine();
}
