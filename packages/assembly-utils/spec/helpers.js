import noflo from "@noflo/noflo";

/**
 * Prepare a component for testing: attach sockets to the given ports.
 *
 * @param {import("@noflo/noflo").Component} component
 * @param {Record<string, any>} ports - port name to port instance
 * @returns {{ ins: Record<string, any>, outs: Record<string, any[]> }}
 */
export function prepare(_component, ports) {
  const ins = {};
  const outs = {};
  for (const [name, port] of Object.entries(ports)) {
    const socket = new noflo.internalSocket.InternalSocket();
    port.attach(socket);
    if (port instanceof noflo.OutPort) {
      outs[name] = socket;
    } else {
      ins[name] = socket;
    }
  }
  return { ins, outs };
}

/**
 * Post a data packet to an inport socket.
 *
 * @param {Record<string, any>} ins
 * @param {string} port
 * @param {any} data
 */
export function send(ins, port, data) {
  ins[port].post(new noflo.IP("data", data));
}

/**
 * Wait for one data packet on each named outport, resolving to undefined
 * for ports that stay silent within the settle window.
 *
 * @param {Record<string, any>} outs
 * @param {string[]} names
 * @param {number} [ms]
 * @returns {Promise<Record<string, any|undefined>>}
 */
export function receive(outs, names, ms = 500) {
  return Promise.all(
    names.map(
      (name) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(undefined), ms);
          outs[name].addEventListener("ip", (event) => {
            clearTimeout(timer);
            resolve(event.detail);
          });
        }),
    ),
  ).then((ips) => Object.fromEntries(names.map((n, i) => [n, ips[i]])));
}
