import { Component } from "../../src/index.js";

class BuildFrame extends Component {
  constructor() {
    super({
      description: 'Builds car frame',
      validates: { id: 'num' },
      // Port definition is not necessary
    });
  }

  /**
   * @param {Record<string, any>} msg
   * @param {{ sendDone(map: Record<string, unknown>): void, done(): void }} output
   */
  relay(msg, output) {
    msg.chassis = {
      id: msg.id,
      frame: 'Steel Frame',
    };
    output.sendDone(msg);
  }
}

export function getComponent() {
  return new BuildFrame();
}
