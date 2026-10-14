/**
 * A link double: records sends, delivers injected frames to data
 * listeners, and serves resource requests from a hash map.
 */
export class FakeLink {
  constructor() {
    /** @type {Uint8Array[]} */
    this.sent = [];
    /** @type {Map<string, Uint8Array>} */
    this.resources = new Map();
    /** @type {Array<(payload: Uint8Array) => void>} */
    this.dataListeners = [];
    this.teardownCalls = 0;
  }

  /**
   * @param {string} type
   * @param {(event: any) => void} listener
   */
  addEventListener(type, listener) {
    if (type === "data") {
      this.dataListeners.push(listener);
    }
  }

  removeEventListener(type, listener) {
    const i = this.dataListeners.indexOf(listener);
    if (i !== -1) {
      this.dataListeners.splice(i, 1);
    }
  }

  /**
   * Deliver an inbound frame payload to data listeners.
   *
   * @param {Uint8Array} payload
   */
  deliver(payload) {
    for (const listener of [...this.dataListeners]) {
      listener({
        detail: { packet: { payload }, type: "data" },
      });
    }
  }

  /**
   * @param {{ packetType: number, payload: Uint8Array }} packet
   */
  async send(packet) {
    this.sent.push(packet.payload);
  }

  /**
   * @param {string} hash
   * @returns {Promise<Uint8Array>}
   */
  async request(hash) {
    const bytes = this.resources.get(hash);
    if (!bytes) {
      throw new Error(`resource not found: ${hash}`);
    }
    return bytes;
  }

  async teardown() {
    this.teardownCalls += 1;
  }
}
